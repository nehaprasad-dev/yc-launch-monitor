import type { SocialPost } from "../monitor/types.js";

interface HnHit {
  objectID: string;
  title?: string | null;
  author?: string | null;
  url?: string | null;
  created_at?: string | null;
  story_text?: string | null;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&#x2F;/gi, "/")
    .replace(/&#x27;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLaunchHnTitle(title: string): boolean {
  return /^Launch HN:/i.test(title) && /\(YC\s+[SWP]?\d{2}\)/i.test(title);
}

export async function fetchHnLaunchPosts(limit = 25): Promise<SocialPost[]> {
  const url = new URL("https://hn.algolia.com/api/v1/search_by_date");
  url.searchParams.set("query", "Launch HN YC");
  url.searchParams.set("tags", "story");
  url.searchParams.set("hitsPerPage", String(limit));

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HN Algolia search failed with status ${response.status}`);
  }

  const json = (await response.json()) as { hits?: HnHit[] };
  const posts: SocialPost[] = [];

  for (const hit of json.hits ?? []) {
    const title = hit.title?.trim();
    if (!title || !isLaunchHnTitle(title)) {
      continue;
    }

    const body = hit.story_text ? decodeHtml(hit.story_text) : "";
    const text = body ? `${title}\n\n${body.slice(0, 1200)}` : title;
    const author = hit.author?.trim() || "HN founder";
    const objectId = hit.objectID;
    const hnUrl = `https://news.ycombinator.com/item?id=${objectId}`;

    posts.push({
      platform: "SOCIAL_INBOX",
      externalId: `hn-${objectId}`,
      authorName: author,
      authorHandle: `@${author}`,
      authorProfileUrl: `https://news.ycombinator.com/user?id=${encodeURIComponent(author)}`,
      text,
      url: hit.url?.trim() || hnUrl,
      detectedAt: hit.created_at ? new Date(hit.created_at) : new Date(),
      metadata: {
        source: "hn_algolia",
        hnUrl,
        title,
      },
    });
  }

  return posts;
}
