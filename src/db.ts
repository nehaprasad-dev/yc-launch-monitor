import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import dns from "node:dns";
import { Pool, type PoolConfig } from "pg";

dns.setDefaultResultOrder("ipv4first");

declare global {
  // eslint-disable-next-line no-var
  var __prismaClient__: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __pgPool__: Pool | undefined;
}

function buildPoolConfig(): PoolConfig {
  const raw = process.env.DATABASE_URL;

  if (!raw) {
    throw new Error("DATABASE_URL is required");
  }

  const url = new URL(raw);

  return {
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, "") || "neondb",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 60000,
    idleTimeoutMillis: 30000,
    max: 5,
    keepAlive: true,
  };
}

function createClient() {
  const pool = globalThis.__pgPool__ ?? new Pool(buildPoolConfig());
  const client = new PrismaClient({
    adapter: new PrismaPg(pool),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

  if (process.env.NODE_ENV !== "production") {
    globalThis.__pgPool__ = pool;
  }

  return client;
}

export const prisma = globalThis.__prismaClient__ ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prismaClient__ = prisma;
}

export async function withDbRetry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const code = typeof error === "object" && error && "code" in error ? String((error as { code?: string }).code) : "";
      const retryable = code === "ETIMEDOUT" || code === "P1001" || code === "P1017";

      if (!retryable || attempt === attempts) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }

  throw lastError;
}
