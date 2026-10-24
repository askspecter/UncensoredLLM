import { NextResponse } from "next/server";
import { isAddress, verifyMessage } from "viem";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { linkMessage } from "@/lib/bcredit";

/** Links a wallet after verifying a signed message proving the caller controls it. */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const { address, signature, ts } = await req.json().catch(() => ({}));
  if (!isAddress(String(address ?? "")) || typeof signature !== "string" || !Number.isFinite(ts)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (Math.abs(Date.now() - ts) > 10 * 60_000) return NextResponse.json({ error: "Signature expired, try again" }, { status: 400 });
  const ok = await verifyMessage({ address, message: linkMessage(auth.userId, address, ts), signature: signature as `0x${string}` }).catch(() => false);
  if (!ok) return NextResponse.json({ error: "Signature does not match this wallet" }, { status: 400 });

  const addr = address.toLowerCase();
  const [existing] = await sql<{ user_id: string }[]>`SELECT user_id FROM holder_wallets WHERE address = ${addr}`;
  if (existing && existing.user_id !== auth.userId) return NextResponse.json({ error: "This wallet is linked to another account" }, { status: 409 });
  await sql`INSERT INTO holder_wallets (address, user_id) VALUES (${addr}, ${auth.userId}) ON CONFLICT (address) DO NOTHING`;
  return NextResponse.json({ ok: true, address: addr });
}

export async function DELETE(req: Request) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const { address } = await req.json().catch(() => ({}));
  await sql`DELETE FROM holder_wallets WHERE address = ${String(address ?? "").toLowerCase()} AND user_id = ${auth.userId}`;
  return NextResponse.json({ ok: true });
}
