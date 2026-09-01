import type { SourceName } from "@prisma/client";

import type { MonitorSource, SocialPost, SourcePullResult } from "../monitor/types.js";

const demoPosts: SocialPost[] = [
  {
    platform: "X",
    externalId: "demo-post-1",
    authorName: "Jane Doe",
    authorHandle: "@janedoe",
    authorProfileUrl: "https://x.com/janedoe",
    text: "We got into YC S26. Acme AI is joining YC to build autonomous accounting.",
    url: "https://x.com/janedoe/status/demo-post-1",
    detectedAt: new Date("2026-08-30T09:00:00.000Z"),
  },
];

export class DemoSource implements MonitorSource {
  readonly source: SourceName = "DEMO";

  async fetch(cursor?: string | null): Promise<SourcePullResult> {
    const unseenPosts = cursor ? demoPosts.filter((post) => post.externalId !== cursor) : demoPosts;
    const latestId = unseenPosts.at(-1)?.externalId ?? cursor ?? null;

    return {
      source: this.source,
      posts: unseenPosts,
      cursor: latestId,
      observedAt: new Date(),
      health: "healthy",
      metadata: {
        demo: true,
        fetchedPosts: unseenPosts.length,
      },
    };
  }
}
