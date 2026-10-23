import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { requireUser } from "@/lib/auth";
import { sql, fromMicros, toMicros } from "@/lib/db";
import { addToBalance } from "@/lib/billing";
import { newId } from "@/lib/keys";
import { MIN_OFFER } from "@/lib/data";

/** The signed-in seller's offers and payouts. */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const [offers, payouts] = await Promise.all([
    sql`SELECT o.id, o.credit_micros, o.remaining_micros, o.discount_bps, o.payout_address, o.status, o.created_at,
               coalesce((SELECT sum(credit_micros) FROM order_fills f WHERE f.offer_id = o.id AND f.status = 'settled'), 0) AS sold_micros
        FROM offers o WHERE o.user_id = ${auth.userId} ORDER BY o.created_at DESC LIMIT 50`,
    sql`SELECT id, amount_micros, address, status, tx_hash, created_at, paid_at FROM payouts WHERE user_id = ${auth.userId} ORDER BY created_at DESC LIMIT 50`,
  ]);
  return NextResponse.json({
    offers: offers.map((o) => ({ id: o.id, credit: fromMicros(o.credit_micros), remaining: fromMicros(o.remaining_micros), sold: fromMicros(o.sold_micros),
      discount: o.discount_bps / 10_000, payoutAddress: o.payout_address, status: o.status, createdAt: o.created_at })),
    payouts: payouts.map((p) => ({ id: p.id, amount: fromMicros(p.amount_micros), address: p.address, status: p.status, txHash: p.tx_hash, createdAt: p.created_at, paidAt: p.paid_at })),
  });
}

/** Lists part of the seller's balance on the order book. The credit is escrowed until sold or cancelled. */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const b = await req.json().catch(() => null);
  const credit = Number(b?.credit);
  const discount = Number(b?.discount);
  const payout = String(b?.payout ?? "").trim();
  if (!Number.isFinite(credit) || credit < MIN_OFFER) return NextResponse.json({ error: `Minimum offer is $${MIN_OFFER}` }, { status: 400 });
  if (!Number.isFinite(discount) || discount < 0.01 || discount > 0.9) return NextResponse.json({ error: "Discount must be 1 to 90%" }, { status: 400 });
  if (!isAddress(payout)) return NextResponse.json({ error: "Enter a valid 0x payout address" }, { status: 400 });

  const micros = BigInt(toMicros(credit));
  const id = newId("off");
  const ok = await sql.begin(async (tx) => {
    const [u] = await tx<{ balance_micros: string }[]>`SELECT balance_micros FROM users WHERE id = ${auth.userId} FOR UPDATE`;
    if (BigInt(u.balance_micros) < micros) return false;
    await addToBalance(tx, auth.userId, -micros, "escrow", id);
    await tx`INSERT INTO offers (id, user_id, credit_micros, remaining_micros, discount_bps, payout_address)
             VALUES (${id}, ${auth.userId}, ${micros.toString()}, ${micros.toString()}, ${Math.round(discount * 10_000)}, ${getAddress(payout)})`;
    return true;
  });
  if (!ok) return NextResponse.json({ error: "Not enough credit balance to list that amount" }, { status: 400 });
  return NextResponse.json({ id, status: "live" }, { status: 201 });
}
