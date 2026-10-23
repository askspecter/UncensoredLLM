import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { requireUser } from "@/lib/auth";
import { sql, fromMicros } from "@/lib/db";
import { MIN_WITHDRAW } from "@/lib/affiliate";
import { newId } from "@/lib/keys";

/** Requests a USDG payout of all commission that has cleared its hold. */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const { address } = await req.json().catch(() => ({}));
  if (!isAddress(String(address ?? ""))) return NextResponse.json({ error: "Enter a valid 0x address on Robinhood Chain" }, { status: 400 });

  const id = newId("pay");
  const amount = await sql.begin(async (tx) => {
    const rows = await tx<{ id: string; amount_micros: string }[]>`
      SELECT id, amount_micros FROM referral_earnings
      WHERE affiliate_id = ${auth.userId} AND payout_id IS NULL AND available_at <= now() FOR UPDATE`;
    const total = rows.reduce((s, r) => s + BigInt(r.amount_micros), BigInt(0));
    if (total < BigInt(MIN_WITHDRAW * 1_000_000)) return null;
    await tx`INSERT INTO payouts (id, user_id, amount_micros, address, kind) VALUES (${id}, ${auth.userId}, ${total.toString()}, ${getAddress(address)}, 'affiliate')`;
    await tx`UPDATE referral_earnings SET payout_id = ${id} WHERE id IN ${tx(rows.map((r) => r.id))}`;
    return total;
  });
  if (amount === null) return NextResponse.json({ error: `You need at least $${MIN_WITHDRAW} available to withdraw` }, { status: 400 });
  return NextResponse.json({ id, amount: fromMicros(amount) }, { status: 201 });
}
