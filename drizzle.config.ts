import { defineConfig } from "drizzle-kit";

// drizzle-kit auto-loads .env / .env.local from cwd

export default defineConfig({
  schema: "./src/server/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://postgres@localhost:5432/suparbase",
  },
  strict: true,
  verbose: true,
});
