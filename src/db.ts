import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import { Pool, type PoolConfig } from "pg";
import ws from "ws";

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
  url.searchParams.delete("channel_binding");

  const sslmode = url.searchParams.get("sslmode");
  const needsSsl = sslmode === "require" || sslmode === "verify-full" || sslmode === "prefer";

  return {
    connectionString: url.toString(),
    connectionTimeoutMillis: 15000,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  };
}

function createAdapter() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  if (connectionString.includes("neon.tech")) {
    neonConfig.webSocketConstructor = ws;
    return new PrismaNeon({ connectionString });
  }

  const pool = globalThis.__pgPool__ ?? new Pool(buildPoolConfig());

  if (process.env.NODE_ENV !== "production") {
    globalThis.__pgPool__ = pool;
  }

  return new PrismaPg(pool);
}

export const prisma =
  globalThis.__prismaClient__ ??
  new PrismaClient({
    adapter: createAdapter(),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__prismaClient__ = prisma;
}
