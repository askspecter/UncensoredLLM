import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { sql, fromMicros } from "@/lib/db";

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;
  const rows = await sql`SELECT id, user_id, order_id, amount_micros, address, status, tx_hash, created_at, paid_at
                         FROM payouts ORDER BY (status = 'pending') DESC, created_at DESC LIMIT 200`;
  return NextResponse.json(rows.map((p) => ({ ...p, amount: fromMicros(p.amount_micros) })));
}
