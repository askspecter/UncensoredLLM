// Applies db/migrations/*.sql in order, once each. Safe to run on every deploy.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("[migrate] DATABASE_URL not set — skipping.");
  process.exit(0);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
const dir = join(process.cwd(), "db", "migrations");

try {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
  const done = new Set((await sql`SELECT name FROM schema_migrations`).map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    const body = await readFile(join(dir, f), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO schema_migrations (name) VALUES (${f})`;
    });
    console.log(`[migrate] applied ${f}`);
  }
  console.log("[migrate] up to date");
} finally {
  await sql.end();
}
