import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
}

// In dev, hot-reload re-evaluates this module: reuse the underlying socket pool.
declare global {
  // eslint-disable-next-line no-var
  var __suparbase_pg__: ReturnType<typeof postgres> | undefined;
}

const sql = globalThis.__suparbase_pg__ ?? postgres(connectionString, { max: 10, prepare: false });
if (process.env.NODE_ENV !== "production") globalThis.__suparbase_pg__ = sql;

export const db = drizzle(sql, { schema });
export type DB = typeof db;
