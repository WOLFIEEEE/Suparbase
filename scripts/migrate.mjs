#!/usr/bin/env node
/**
 * Suparbase production migrator.
 *
 * Runs at container start before `next start`. Connects to `DATABASE_URL`,
 * applies every Drizzle-generated SQL migration under `./drizzle` that
 * isn't already recorded in `__drizzle_migrations`, then exits.
 *
 * A non-zero exit aborts the deploy on Coolify (the `app` container won't
 * proceed to `next start`).
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set. Aborting migration.");
  process.exit(1);
}

const start = Date.now();
const sql = postgres(databaseUrl, { max: 1, prepare: false });
const db = drizzle(sql);

try {
  console.log("[migrate] connecting to database…");
  await migrate(db, { migrationsFolder: "./drizzle" });
  const ms = Date.now() - start;
  console.log(`[migrate] OK (${ms} ms)`);
} catch (err) {
  console.error("[migrate] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
