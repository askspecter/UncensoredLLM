import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { sql, fromMicros } from "@/lib/db";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const { id } = await params;
  const [o] = await sql`SELECT id, status, credit_micros, total_cents, checkout_url, created_at, paid_at FROM orders WHERE id = ${id} AND user_id = ${auth.userId}`;
  if (!o) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  return NextResponse.json({ ...o, credit: fromMicros(o.credit_micros), total: o.total_cents / 100 });
}
