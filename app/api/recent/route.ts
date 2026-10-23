import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { dbEnabled, sql, fromMicros } from "@/lib/db";

/** Latest paid purchases, pseudonymous. */
export async function GET() {
  if (!dbEnabled) return NextResponse.json([]);
  const rows = await sql<{ user_id: string; handle: string | null; credit_micros: string; total_cents: number; paid_at: string }[]>`
    SELECT o.user_id, u.handle, o.credit_micros, o.total_cents, o.paid_at FROM orders o JOIN users u ON u.id = o.user_id
    WHERE o.status = 'paid' ORDER BY o.paid_at DESC LIMIT 8`;
  return NextResponse.json(rows.map((r) => {
    const credit = fromMicros(r.credit_micros);
    return {
      who: r.handle ?? `anon_${createHash("sha256").update(r.user_id).digest("hex").slice(0, 6)}`,
      credit,
      discount: credit > 0 ? Math.max(0, 1 - r.total_cents / 100 / credit) : 0,
      at: r.paid_at,
    };
  }), { headers: { "cache-control": "public, max-age=10" } });
}
