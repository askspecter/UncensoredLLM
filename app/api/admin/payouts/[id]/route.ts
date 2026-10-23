import { NextResponse } from "next/server";
import { isHash } from "viem";
import { requireAdmin } from "@/lib/admin";
import { sql } from "@/lib/db";

/** Marks a payout as sent, recording the USDG transfer hash. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;
  const { id } = await params;
  const { txHash } = await req.json().catch(() => ({}));
  if (!isHash(String(txHash ?? ""))) return NextResponse.json({ error: "Enter the payout transaction hash" }, { status: 400 });
  const rows = await sql`UPDATE payouts SET status = 'paid', tx_hash = ${txHash}, paid_at = now() WHERE id = ${id} AND status = 'pending' RETURNING id`;
  if (!rows.length) return NextResponse.json({ error: "Payout not found or already paid" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
