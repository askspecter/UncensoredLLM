import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { dbEnabled, sql } from "@/lib/db";
import { hookState, liveHook, verifyHook } from "@/lib/hook-server";

export async function GET() {
  const h = await liveHook();
  if (!h) return NextResponse.json({ hook: null });
  return NextResponse.json({ hook: await hookState(h).catch(() => ({ address: h.address })) });
}

/**
 * Registers the hook the admin page just deployed. No session needed: the contract itself proves it
 * (deployed in `fromBlock`, created by the admin wallet, paying the official vault). Can only be set once.
 */
export async function POST(req: Request) {
  if (!dbEnabled) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const b = await req.json().catch(() => ({}));
  if (!isAddress(b?.address ?? "") || !/^\d+$/.test(String(b?.fromBlock ?? ""))) return NextResponse.json({ error: "address and fromBlock required" }, { status: 400 });
  const address = getAddress(b.address);
  const existing = await liveHook();
  if (existing) return NextResponse.json(existing.address === address ? { ok: true } : { error: "A hook is already live" }, { status: existing.address === address ? 200 : 409 });
  try {
    await verifyHook(address, BigInt(b.fromBlock));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  await sql`INSERT INTO app_settings (key, value) VALUES ('beeper_hook', ${sql.json({ address, fromBlock: String(b.fromBlock) })}) ON CONFLICT (key) DO NOTHING`;
  return NextResponse.json({ ok: true, address }, { status: 201 });
}
