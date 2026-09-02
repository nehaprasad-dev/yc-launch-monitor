import type { SourceName } from "@prisma/client";

import type { MonitorSource, SocialPost, SourcePullResult } from "../monitor/types.js";
import { readInboxPosts } from "../services/social-inbox-store.js";
import { fetchHnLaunchPosts } from "./hn-launch-source.js";

function mergePosts(...groups: SocialPost[][]): SocialPost[] {
  const byId = new Map<string, SocialPost>();

  for (const group of groups) {
    for (const post of group) {
      byId.set(post.externalId, post);
    }
  }

  return [...byId.values()].sort((left, right) => right.detectedAt.getTime() - left.detectedAt.getTime());
}

export class SocialInboxSource implements MonitorSource {
  readonly source: SourceName = "SOCIAL_INBOX";

  async fetch(cursor?: string | null): Promise<SourcePullResult> {
    const inboxPosts = await readInboxPosts();

    let hnPosts: SocialPost[] = [];
    let hnError: string | undefined;

    try {
      hnPosts = await fetchHnLaunchPosts(30);
    } catch (error) {
      hnError = error instanceof Error ? error.message : "HN launch fetch failed";
    }

    const posts = mergePosts(inboxPosts, hnPosts);
    const unseenPosts = cursor ? posts.filter((post) => post.externalId !== cursor) : posts;
    const latestId = unseenPosts[0]?.externalId ?? cursor ?? null;

    return {
      source: this.source,
      posts: unseenPosts,
      cursor: latestId,
      observedAt: new Date(),
      health: hnError && hnPosts.length === 0 && inboxPosts.length === 0 ? "degraded" : "healthy",
      errorReason: hnError,
      metadata: {
        inbox: true,
        hnLaunch: true,
        fetchedPosts: unseenPosts.length,
        inboxPosts: inboxPosts.length,
        hnPosts: hnPosts.length,
        hnError: hnError ?? null,
      },
    };
  }
}
