import postgres from "postgres";

const url = process.env.DATABASE_URL;
export const dbEnabled = Boolean(url);

// Reuse one pool across hot reloads and warm serverless invocations.
const g = globalThis as unknown as { __sql?: postgres.Sql };
export const sql: postgres.Sql = g.__sql ?? postgres(url ?? "postgres://unset", {
  max: 5,
  idle_timeout: 20,
  prepare: false, // required for transaction-mode poolers (Supabase, Neon pooled URLs)
  onnotice: () => {},
});
if (url) g.__sql = sql;

export const MICROS = 1_000_000;
export const toMicros = (usd: number) => Math.round(usd * MICROS);
export const fromMicros = (m: number | bigint | string) => Number(m) / MICROS;
