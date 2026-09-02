#!/usr/bin/env node
/**
 * Start a local production build generated with `output: "standalone"`.
 * Next does not copy public/ or .next/static into the standalone directory,
 * so mirror the same two copies performed by the production Docker image.
 */
import { cpSync, existsSync, mkdirSync } from "node:fs";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

// The generated standalone server expects deployment environments to inject
// variables. For local `pnpm start`, match `next dev`/`next build` by loading
// .env.local before any bundled server module evaluates its env assertions.
loadEnvConfig(process.cwd());

const standalone = ".next/standalone";
if (!existsSync(`${standalone}/server.js`)) {
  throw new Error("Standalone build not found. Run `pnpm build` first.");
}

if (existsSync("public")) {
  cpSync("public", `${standalone}/public`, { recursive: true, force: true });
}
mkdirSync(`${standalone}/.next`, { recursive: true });
cpSync(".next/static", `${standalone}/.next/static`, { recursive: true, force: true });

await import(`../${standalone}/server.js`);
