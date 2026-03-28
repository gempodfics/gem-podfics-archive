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
        property: "Status for upload",
        select: { does_not_equal: "SKIP" },
      },
      start_cursor: cursor,
      page_size: 100,
    });
    results.push(...response.results);
    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return results.map(mapPodfic);
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
    return prop?.rich_text?.[0]?.plain_text ?? prop?.title?.[0]?.plain_text ?? "";
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
    artistCredit: text(props["Artist Credit"]),
    internetArchiveUrl: url(props["Internet Archive URL"]),
    ao3Url: url(props["Link To Ao3 Page"]),
    chapterUrl: url(props["Link To Chapter (Shareable Link)"]),
    asmrSubtag: select(props["ASMR Sub-tag"]),
    collaborators: text(props["Collaborators"]),
  };
}

export type Podfic = ReturnType<typeof mapPodfic>;
