import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { sql, fromMicros } from "@/lib/db";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const uid = auth.userId;

  const [[user], keys, orders, usage, daily, [totals]] = await Promise.all([
    sql`SELECT id, handle, balance_micros, created_at FROM users WHERE id = ${uid}`,
    sql`SELECT id, name, prefix, created_at, last_used_at FROM api_keys WHERE user_id = ${uid} AND revoked_at IS NULL ORDER BY created_at DESC`,
    sql`SELECT id, status, credit_micros, total_cents, payment_method, checkout_url, pay_units, pay_to, tx_hash, created_at FROM orders WHERE user_id = ${uid} ORDER BY created_at DESC LIMIT 20`,
    sql`SELECT model, prompt_tokens, completion_tokens, cost_micros, latency_ms, status, created_at FROM usage_logs WHERE user_id = ${uid} ORDER BY created_at DESC LIMIT 20`,
    sql`SELECT to_char(d, 'MM-DD') AS date, coalesce(sum(u.cost_micros), 0) AS cost_micros
        FROM generate_series(current_date - 13, current_date, interval '1 day') d
        LEFT JOIN usage_logs u ON u.user_id = ${uid} AND u.created_at::date = d::date
        GROUP BY d ORDER BY d`,
    sql`SELECT
          (SELECT coalesce(sum(credit_micros), 0) FROM orders WHERE user_id = ${uid} AND status = 'paid') AS bought_micros,
          (SELECT coalesce(sum(total_cents), 0) FROM orders WHERE user_id = ${uid} AND status = 'paid') AS paid_cents,
          (SELECT count(*) FROM usage_logs WHERE user_id = ${uid} AND created_at > now() - interval '14 days') AS requests`,
  ]);

  return NextResponse.json({
    user: { id: user.id, handle: user.handle, createdAt: user.created_at, balance: fromMicros(user.balance_micros) },
    keys,
    orders: orders.map((o) => ({ ...o, credit: fromMicros(o.credit_micros), total: o.total_cents / 100 })),
    usage: usage.map((u) => ({ ...u, cost: fromMicros(u.cost_micros) })),
    daily: daily.map((d) => ({ date: d.date, cost: fromMicros(d.cost_micros) })),
    totals: {
      bought: fromMicros(totals.bought_micros),
      saved: fromMicros(totals.bought_micros) - Number(totals.paid_cents) / 100,
      requests: Number(totals.requests),
    },
  });
}

const RESERVED = new Set(["admin", "beeper", "support", "root", "system", "anon", "official"]);

/** Sets or clears the public handle shown on the leaderboard and recent buys. */
export async function PATCH(req: Request) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const body = await req.json().catch(() => ({}));
  const raw = typeof body?.handle === "string" ? body.handle.trim().toLowerCase() : "";
  const handle = raw === "" ? null : raw;
  if (handle && (!/^[a-z0-9_]{3,20}$/.test(handle) || RESERVED.has(handle) || handle.startsWith("anon_"))) {
    return NextResponse.json({ error: "Handle must be 3 to 20 characters: a to z, 0 to 9 or _" }, { status: 400 });
  }
  try {
    await sql`UPDATE users SET handle = ${handle} WHERE id = ${auth.userId}`;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return NextResponse.json({ error: "That handle is taken" }, { status: 409 });
    throw e;
  }
  return NextResponse.json({ handle });
}

