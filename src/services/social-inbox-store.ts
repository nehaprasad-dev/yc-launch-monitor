import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { SocialPost } from "../monitor/types.js";

const inboxPath = path.resolve(process.cwd(), "data", "social-inbox.json");

export interface InboxPostInput {
  externalId?: string;
  authorName: string;
  authorHandle?: string;
  authorProfileUrl?: string;
  text: string;
  url?: string;
  detectedAt?: string;
}

async function ensureInboxFile(): Promise<void> {
  await mkdir(path.dirname(inboxPath), { recursive: true });

  try {
    await readFile(inboxPath, "utf8");
  } catch {
    await writeFile(inboxPath, "[]\n", "utf8");
  }
}

export async function readInboxPosts(): Promise<SocialPost[]> {
  await ensureInboxFile();
  const raw = await readFile(inboxPath, "utf8");
  const parsed = JSON.parse(raw) as InboxPostInput[];

  return parsed.map((post, index) => ({
    platform: "SOCIAL_INBOX",
    externalId: post.externalId?.trim() || `inbox-${index + 1}`,
    authorName: post.authorName,
    authorHandle: post.authorHandle ?? null,
    authorProfileUrl: post.authorProfileUrl ?? null,
    text: post.text,
    url: post.url?.trim() || `https://local.inbox/${post.externalId ?? index + 1}`,
    detectedAt: post.detectedAt ? new Date(post.detectedAt) : new Date(),
  }));
}

export async function appendInboxPost(input: InboxPostInput): Promise<SocialPost> {
  await ensureInboxFile();
  const raw = await readFile(inboxPath, "utf8");
  const parsed = JSON.parse(raw) as InboxPostInput[];
  const externalId = input.externalId?.trim() || `inbox-${Date.now()}`;

  const next: InboxPostInput = {
    ...input,
    externalId,
    url: input.url?.trim() || `https://local.inbox/${externalId}`,
    detectedAt: input.detectedAt ?? new Date().toISOString(),
  };

  parsed.push(next);
  await writeFile(inboxPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");

  return {
    platform: "SOCIAL_INBOX",
    externalId,
    authorName: next.authorName,
    authorHandle: next.authorHandle ?? null,
    authorProfileUrl: next.authorProfileUrl ?? null,
    text: next.text,
    url: next.url!,
    detectedAt: new Date(next.detectedAt!),
  };
}
