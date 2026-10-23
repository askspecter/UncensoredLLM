import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { sql, fromMicros } from "@/lib/db";
import { settleOrder } from "@/lib/market";
import { createApiKey } from "@/lib/keys";
import { explorerTx } from "@/lib/chain";
import { findTransfer, verifyTx, type Found } from "@/lib/usdg";

/** Checks the chain for this order's USDG payment (by tx hash if given, otherwise by scanning) and settles it. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const [o] = await sql<{ status: string; pay_units: string | null; start_block: string | null; tx_hash: string | null }[]>`
    SELECT status, pay_units, start_block, tx_hash FROM orders WHERE id = ${id} AND user_id = ${auth.userId} AND payment_method = 'usdg'`;
  if (!o || !o.pay_units) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (o.status === "paid") return NextResponse.json({ status: "paid", txHash: o.tx_hash });
  // Expired orders still accept a late payment; settleOrder re-takes or covers their fills.
  if (o.status !== "pending" && o.status !== "expired") return NextResponse.json({ status: o.status });

  const units = BigInt(o.pay_units);
  let found: Found | null = null;
  try {
    found = typeof body?.txHash === "string" && body.txHash
      ? await verifyTx(body.txHash.trim(), units)
      : await findTransfer(units, BigInt(o.start_block ?? 0));
  } catch (e) {
    console.error("[confirm] rpc error", e);
    return NextResponse.json({ status: "pending", error: "Network busy, retrying…" });
  }
  if (!found) {
    return NextResponse.json({ status: "pending", ...(body?.txHash ? { error: "That transaction isn’t a matching USDG payment (yet)." } : {}) });
  }

  // Claim the tx for this order; the UNIQUE constraint stops one transfer paying for two orders.
  try {
    const claimed = await sql`UPDATE orders SET tx_hash = ${found.txHash}, payer = ${found.from} WHERE id = ${id} AND (tx_hash IS NULL OR tx_hash = ${found.txHash}) RETURNING id`;
    if (!claimed.length) return NextResponse.json({ status: "pending" });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return NextResponse.json({ status: "pending", error: "Transaction already used for another order" }, { status: 409 });
    throw e;
  }
  await settleOrder(id, found.txHash);

  const [{ count }] = await sql<{ count: string }[]>`SELECT count(*) FROM api_keys WHERE user_id = ${auth.userId} AND revoked_at IS NULL`;
  const firstKey = Number(count) === 0 ? await createApiKey(auth.userId, "Default") : null;
  const [{ balance_micros }] = await sql<{ balance_micros: string }[]>`SELECT balance_micros FROM users WHERE id = ${auth.userId}`;
  return NextResponse.json({
    status: "paid", txHash: found.txHash, explorer: explorerTx(found.txHash),
    balance: fromMicros(balance_micros), apiKey: firstKey?.key ?? null,
  });
}
