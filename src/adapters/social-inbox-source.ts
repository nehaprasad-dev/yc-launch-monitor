import type { SourceName } from "@prisma/client";

import type { MonitorSource, SourcePullResult } from "../monitor/types.js";
import { readInboxPosts } from "../services/social-inbox-store.js";

export class SocialInboxSource implements MonitorSource {
  readonly source: SourceName = "SOCIAL_INBOX";

  async fetch(cursor?: string | null): Promise<SourcePullResult> {
    const posts = await readInboxPosts();
    const unseenPosts = cursor ? posts.filter((post) => post.externalId !== cursor) : posts;
    const latestId = unseenPosts.at(-1)?.externalId ?? cursor ?? null;

    return {
      source: this.source,
      posts: unseenPosts,
      cursor: latestId,
      observedAt: new Date(),
      health: "healthy",
      metadata: {
        inbox: true,
        fetchedPosts: unseenPosts.length,
        totalPosts: posts.length,
      },
    };
  }
}
