import { Client } from "@notionhq/client";

const notion = new Client({ auth: import.meta.env.NOTION_API_KEY });

const DATABASE_ID = "431bce89a9a48379b47a01053fe924c2";

// Raw fetch — all entries except SKIP
export async function getAllPodfics() {
  const results: any[] = [];
  let cursor: string | undefined = undefined;

  do {
    const response = await notion.databases.query({
      database_id: DATABASE_ID,
      filter: {
        or: [
          { property: "Status for upload", select: { does_not_equal: "SKIP" } },
          { property: "Status for upload", select: { is_empty: true } },
        ],
      },
      start_cursor: cursor,
      page_size: 100,
    });
    results.push(...response.results);
    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return results.map(mapPodfic);
}

// Curated recs — fetched by page ID so order is preserved and cover art stays in sync with Notion
const REC_PAGE_IDS = [
  "330bce89a9a481eab010fd0db5da3fc3", // Courtesy Call
  "330bce89a9a48122a4abf5166aa970cc", // I Can Hear You Blushing
  "330bce89a9a481cc8e1fc6a22ebdc80a", // Headphones and Naughty Whispers
  "330bce89a9a481ca8371e09d668283ec", // Turning Point
  "330bce89a9a48150b15afa4693a136b9", // If You Don't Know How To Blow, Blow For Me
  "330bce89a9a481559948dbe811724cfd", // If You Really Hold Me Tight
  "330bce89a9a481efa30dc9988b1b10a9", // Life You Up, a (re) Meet-Cute
  "330bce89a9a481b98929c6cc334fcddd", // An Edible Arrangement
  "330bce89a9a4813ab39beb470e9f7171", // Unforeseen
];

export async function getRecommendations() {
  const pages = await Promise.all(
    REC_PAGE_IDS.map((id) => notion.pages.retrieve({ page_id: id }))
  );
  return pages.map(mapPodfic);
}

// Commissioned art — queries for Commissioned Art URL is_not_empty AND Status is empty,
// deduplicates by Commissioned Art URL
export async function getCommissionedArt() {
  const results: any[] = [];
  let cursor: string | undefined = undefined;

  do {
    const response = await notion.databases.query({
      database_id: DATABASE_ID,
      filter: {
        and: [
          { property: "Commissioned Art URL", url: { is_not_empty: true } },
          { property: "Status for upload", select: { is_empty: true } },
        ],
      },
      start_cursor: cursor,
      page_size: 100,
    });
    results.push(...response.results);
    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);

  const seen = new Set<string>();
  return results
    .map(mapPodfic)
    .filter(p => {
      if (!p.commissionedArtUrl) return false;
      if (seen.has(p.commissionedArtUrl)) return false;
      seen.add(p.commissionedArtUrl);
      return true;
    });
}

// Convenience fetchers
export async function getPodficsByType(type: "One Shot" | "Multi Chapter" | "ASMR") {
  const all = await getAllPodfics();
  return all.filter((p) => p.type === type);
}

export async function getPodficsByFandom(fandom: string) {
  const all = await getAllPodfics();
  return all.filter((p) => p.fandoms.includes(fandom));
}

export async function getAllFandoms(): Promise<string[]> {
  const all = await getAllPodfics();
  const set = new Set<string>();
  all.forEach((p) => p.fandoms.forEach((f: string) => set.add(f)));
  return Array.from(set);
}

// Map raw Notion page to a clean object
function mapPodfic(page: any) {
  const props = page.properties;

  function text(prop: any) {
    if (prop?.rich_text?.length) return prop.rich_text.map((rt: any) => rt.plain_text).join("");
    if (prop?.title?.length) return prop.title.map((t: any) => t.plain_text).join("");
    return "";
  }
  function select(prop: any) {
    return prop?.select?.name ?? "";
  }
  function multiSelect(prop: any): string[] {
    return prop?.multi_select?.map((o: any) => o.name) ?? [];
  }
  function url(prop: any) {
    return prop?.url ?? "";
  }

  return {
    id: page.id,
    createdTime: page.created_time ?? "",
    title: text(props["Podfic Title"]),
    writtenBy: text(props["Written By"]),
    type: select(props["Type"]) as "One Shot" | "Multi Chapter" | "ASMR",
    fandoms: multiSelect(props["Fandoms"]),
    dynamic: select(props["Dynamic"]),
    rating: select(props["Rating"]),
    coreRelationship: select(props["Core Relationships"]),
    length: text(props["Length"]),
    summary: text(props["Summary"]),
    chapterName: text(props["Chapter Name"]),
    coverArtUrl: url(props["Cover Art URL"]),
    commissionedArtUrl: url(props["Commissioned Art URL"]),
    artistCredit: props["Artist Credit"]?.rich_text?.map((rt: any) => rt.plain_text).join("") ?? "",
    internetArchiveUrl: url(props["Internet Archive URL"]),
    ao3Url: url(props["Link To Ao3 Page"]),
    chapterUrl: url(props["Link To Chapter (Shareable Link)"]),
    asmrSubtag: select(props["ASMR Sub-tag"]),
    collaborators: text(props["Collaborators"]),
    podficLength: select(props["Podfic Length"]),
    totalDuration: text(props["Total Duration"]),
  };
}

export type Podfic = ReturnType<typeof mapPodfic>;

export async function getPodficById(id: string): Promise<Podfic> {
  const page = await notion.pages.retrieve({ page_id: id });
  return mapPodfic(page as any);
}

// Resolves an archive.org/details URL to a direct MP3 download URL via the IA metadata API.
// Called at build time so there's no client-side dependency.
export async function resolveInternetArchiveAudio(detailsUrl: string): Promise<string> {
  if (!detailsUrl) return '';
  const match = detailsUrl.match(/archive\.org\/details\/([^/?#]+)/);
  if (!match) return '';
  const identifier = match[1];
  try {
    const res = await fetch(`https://archive.org/metadata/${identifier}`);
    if (!res.ok) return '';
    const data = await res.json();
    const files: any[] = data.files ?? [];
    // Prefer the original MP3; fall back to any MP3
    const mp3 =
      files.find((f) => f.name?.toLowerCase().endsWith('.mp3') && f.source === 'original') ??
      files.find((f) => f.name?.toLowerCase().endsWith('.mp3'));
    if (!mp3) return '';
    return `https://archive.org/download/${identifier}/${encodeURIComponent(mp3.name)}`;
  } catch {
    return '';
  }
}

// Format HH:MM:SS → M:SS / MM:SS for sub-hour, H:MM:SS for 1h+
export function formatDuration(raw: string | undefined): string {
  if (!raw) return '';
  const parts = raw.split(':');
  if (parts.length !== 3) return raw;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const s = parts[2];
  if (h === 0) return `${m}:${s}`;
  return `${h}:${String(m).padStart(2, '0')}:${s}`;
}
