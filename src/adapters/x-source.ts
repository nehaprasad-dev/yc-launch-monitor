import type { SourceName } from "@prisma/client";
import { z } from "zod";

import { env } from "../config/env.js";
import type { MonitorSource, SocialPost, SourcePullResult } from "../monitor/types.js";

const xApiResponseSchema = z.object({
  data: z
    .array(
      z.object({
        id: z.string(),
        text: z.string(),
        created_at: z.string(),
        author_id: z.string().optional(),
        entities: z
          .object({
            urls: z
              .array(
                z.object({
                  expanded_url: z.string().optional(),
                }),
              )
              .optional(),
          })
          .optional(),
      }),
    )
    .optional(),
  meta: z
    .object({
      newest_id: z.string().optional(),
      next_token: z.string().optional(),
      result_count: z.number().optional(),
    })
    .optional(),
  includes: z
    .object({
      users: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            username: z.string(),
          }),
        )
        .optional(),
    })
    .optional(),
});

export class XSource implements MonitorSource {
  readonly source: SourceName = "X";

  async fetch(cursor?: string | null): Promise<SourcePullResult> {
    if (!env.X_BEARER_TOKEN || env.xQueries.length === 0) {
      return {
        source: this.source,
        posts: [],
        cursor,
        observedAt: new Date(),
        health: "degraded",
        errorReason: "X adapter disabled because X_BEARER_TOKEN or X_QUERIES is missing.",
      };
    }

    const posts: SocialPost[] = [];
    let newestSeenId = cursor ?? null;

    for (const query of env.xQueries) {
      const url = new URL("https://api.x.com/2/tweets/search/recent");
      url.searchParams.set("query", query);
      url.searchParams.set("max_results", "10");
      url.searchParams.set("tweet.fields", "created_at,author_id,entities");
      url.searchParams.set("expansions", "author_id");
      url.searchParams.set("user.fields", "name,username");

      if (cursor) {
        url.searchParams.set("since_id", cursor);
      }

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${env.X_BEARER_TOKEN}`,
        },
      });

      if (!response.ok) {
        throw new Error(`X recent search failed with status ${response.status}`);
      }

      const json = xApiResponseSchema.parse(await response.json());
      const users = new Map((json.includes?.users ?? []).map((user) => [user.id, user]));

      for (const tweet of json.data ?? []) {
        const user = tweet.author_id ? users.get(tweet.author_id) : undefined;
        const authorHandle = user?.username ? `@${user.username}` : undefined;
        const postUrl = user?.username
          ? `https://x.com/${user.username}/status/${tweet.id}`
          : tweet.entities?.urls?.[0]?.expanded_url ?? `https://x.com/i/web/status/${tweet.id}`;

        posts.push({
          platform: this.source,
          externalId: tweet.id,
          authorName: user?.name ?? "Unknown author",
          authorHandle,
          authorProfileUrl: user?.username ? `https://x.com/${user.username}` : null,
          text: tweet.text,
          url: postUrl,
          detectedAt: new Date(tweet.created_at),
          metadata: { query },
        });

        if (!newestSeenId || BigInt(tweet.id) > BigInt(newestSeenId)) {
          newestSeenId = tweet.id;
        }
      }
    }

    return {
      source: this.source,
      posts,
      cursor: newestSeenId,
      observedAt: new Date(),
      health: "healthy",
      metadata: {
        queries: env.xQueries,
        fetchedPosts: posts.length,
      },
    };
  }
}
