// Public network metrics computed from the database (aggregates only, never content).
import { createHash } from "crypto";
import { MODELS } from "./data";
import { dbEnabled, sql } from "./db";

export type Day = { date: string; values: Record<string, number> };

const DAYS = 30;
const UNCENSORED = new Set(MODELS.filter((m) => m.uncensored).map((m) => m.id));

function emptySeries(keys: string[]): Map<string, Day> {
  const out = new Map<string, Day>();
  const today = new Date();
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    const key = d.toISOString().slice(0, 10);
    out.set(key, { date: key.slice(5), values: Object.fromEntries(keys.map((k) => [k, 0])) });
  }
  return out;
}

export async function networkMetrics() {
  if (!dbEnabled) return null;
  const [orders, usage, [totals]] = await Promise.all([
    sql<{ day: string; method: string; cents: string; n: string }[]>`
      SELECT to_char(paid_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, payment_method AS method, sum(total_cents) AS cents, count(*) AS n
      FROM orders WHERE status = 'paid' AND paid_at > now() - interval '30 days' GROUP BY 1, 2`,
    sql<{ day: string; model: string; micros: string; tokens: string }[]>`
      SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, model, sum(cost_micros) AS micros, sum(prompt_tokens + completion_tokens) AS tokens
      FROM usage_logs WHERE created_at > now() - interval '30 days' GROUP BY 1, 2`,
    sql<{ users: string; paid_cents: string; tokens: string; requests: string }[]>`
      SELECT (SELECT count(*) FROM users) AS users,
             (SELECT coalesce(sum(total_cents), 0) FROM orders WHERE status = 'paid') AS paid_cents,
             (SELECT coalesce(sum(prompt_tokens + completion_tokens), 0) FROM usage_logs) AS tokens,
             (SELECT count(*) FROM usage_logs) AS requests`,
  ]);

  const purchases = emptySeries(["USDG", "Card"]);
  const credit = emptySeries(["USDG", "Card"]);
  const spend = emptySeries(["Uncensored", "Other"]);
  const tokens = emptySeries(["Uncensored", "Other"]);
  for (const o of orders) {
    const k = o.method === "card" ? "Card" : "USDG";
    const p = purchases.get(o.day), c = credit.get(o.day);
    if (p) p.values[k] += Number(o.n);
    if (c) c.values[k] += Math.round(Number(o.cents) / 100);
  }
  for (const u of usage) {
    const k = UNCENSORED.has(u.model) ? "Uncensored" : "Other";
    const s = spend.get(u.day), t = tokens.get(u.day);
    if (s) s.values[k] += Math.round(Number(u.micros) / 1e4) / 100;
    if (t) t.values[k] += Number(u.tokens);
  }

  return {
    totals: { users: Number(totals.users), paid: Number(totals.paid_cents) / 100, tokens: Number(totals.tokens), requests: Number(totals.requests) },
    purchases: [...purchases.values()], credit: [...credit.values()], spend: [...spend.values()], tokens: [...tokens.values()],
  };
}

/** Public handle: the user's chosen handle, or a stable pseudonym that can't be reversed to their id. */
const pseudonym = (id: string, handle: string | null) => handle ?? `anon_${createHash("sha256").update(id).digest("hex").slice(0, 6)}`;

export async function leaderboards() {
  if (!dbEnabled) return null;
  const [buyers, users] = await Promise.all([
    sql<{ id: string; handle: string | null; cents: string; n: string }[]>`
      SELECT u.id, u.handle, sum(o.total_cents) AS cents, count(*) AS n
      FROM orders o JOIN users u ON u.id = o.user_id
      WHERE o.status = 'paid' AND o.paid_at > now() - interval '30 days'
      GROUP BY u.id ORDER BY cents DESC LIMIT 20`,
    sql<{ id: string; handle: string | null; tokens: string; n: string }[]>`
      SELECT u.id, u.handle, sum(l.prompt_tokens + l.completion_tokens) AS tokens, count(*) AS n
      FROM usage_logs l JOIN users u ON u.id = l.user_id
      WHERE l.created_at > now() - interval '30 days'
      GROUP BY u.id ORDER BY tokens DESC LIMIT 20`,
  ]);
  return {
    buyers: buyers.map((r) => ({ handle: pseudonym(r.id, r.handle), value: Number(r.cents) / 100, count: Number(r.n) })),
    users: users.map((r) => ({ handle: pseudonym(r.id, r.handle), value: Number(r.tokens), count: Number(r.n) })),
  };
}
