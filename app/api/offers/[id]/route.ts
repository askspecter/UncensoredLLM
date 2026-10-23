import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { sql, fromMicros } from "@/lib/db";
import { addToBalance } from "@/lib/billing";

/** Cancels an offer and returns its unsold credit. Credit reserved by open orders comes back if they expire. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const { id } = await params;
  const refunded = await sql.begin(async (tx) => {
    const [o] = await tx<{ remaining_micros: string }[]>`
      SELECT remaining_micros FROM offers WHERE id = ${id} AND user_id = ${auth.userId} AND status = 'live' FOR UPDATE`;
    if (!o) return null;
    const left = BigInt(o.remaining_micros);
    await tx`UPDATE offers SET status = 'cancelled', remaining_micros = 0 WHERE id = ${id}`;
    if (left > BigInt(0)) await addToBalance(tx, auth.userId, left, "unescrow", id);
    return left;
  });
  if (refunded === null) return NextResponse.json({ error: "Offer not found" }, { status: 404 });
  return NextResponse.json({ ok: true, refunded: fromMicros(refunded) });
}
