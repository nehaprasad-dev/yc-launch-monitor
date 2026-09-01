import type { SourceName } from "@prisma/client";
import { z } from "zod";

import { env } from "../config/env.js";
import type { MonitorSource, SocialPost, SourcePullResult } from "../monitor/types.js";

const linkedInResponseSchema = z.object({
  elements: z
    .array(
      z.object({
        id: z.string(),
        commentary: z.string().optional(),
        publishedAt: z.string().optional(),
        author: z
          .object({
            name: z.string(),
            handle: z.string().optional(),
            profileUrl: z.string().optional(),
          })
          .optional(),
        url: z.string().optional(),
      }),
    )
    .default([]),
  paging: z
    .object({
      nextCursor: z.string().optional(),
    })
    .optional(),
});

export class LinkedInSource implements MonitorSource {
  readonly source: SourceName = "LINKEDIN";

  async fetch(cursor?: string | null): Promise<SourcePullResult> {
    if (!env.LINKEDIN_ENABLED || !env.LINKEDIN_ACCESS_TOKEN || !env.LINKEDIN_POSTS_ENDPOINT) {
      return {
        source: this.source,
        posts: [],
        cursor,
        observedAt: new Date(),
        health: "degraded",
        errorReason: "LinkedIn adapter disabled because approved access is not configured.",
      };
    }

    const url = new URL(env.LINKEDIN_POSTS_ENDPOINT);
    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${env.LINKEDIN_ACCESS_TOKEN}`,
        "X-Restli-Protocol-Version": "2.0.0",
      },
    });

    if (!response.ok) {
      throw new Error(`LinkedIn posts request failed with status ${response.status}`);
    }

    const json = linkedInResponseSchema.parse(await response.json());
    const posts: SocialPost[] = json.elements.map((element) => ({
      platform: this.source,
      externalId: element.id,
      authorName: element.author?.name ?? "Unknown author",
      authorHandle: element.author?.handle ?? null,
      authorProfileUrl: element.author?.profileUrl ?? null,
      text: element.commentary ?? "",
      url: element.url ?? element.author?.profileUrl ?? "",
      detectedAt: element.publishedAt ? new Date(element.publishedAt) : new Date(),
    }));

    return {
      source: this.source,
      posts,
      cursor: json.paging?.nextCursor ?? cursor,
      observedAt: new Date(),
      health: "healthy",
      metadata: {
        fetchedPosts: posts.length,
      },
    };
  }
}
