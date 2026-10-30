import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { sql } from "@/lib/db";

/** One coin: its launch details, recent harvests and top earners. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isAddress(token)) return NextResponse.json({ error: "Bad address" }, { status: 400 });
  const t = getAddress(token);
  const [coin] = await sql`SELECT * FROM launch_coins WHERE token = ${t}`;
  if (!coin) return NextResponse.json({ error: "Not a Beeper launch (yet). If it was just launched, try again in a minute." }, { status: 404 });
  const harvests = await sql<{ tx_hash: string; block_number: string; credit_micros: string; paid_micros: string; holders: number; created_at: Date }[]>`
    SELECT tx_hash, block_number, credit_micros, paid_micros, holders, created_at FROM launch_harvests WHERE token = ${t} ORDER BY block_number DESC LIMIT 20`;
  const top = await sql<{ wallet: string; earned: string }[]>`
    SELECT wallet, sum(amount_micros) AS earned FROM launch_rewards WHERE token = ${t} GROUP BY wallet ORDER BY 2 DESC LIMIT 10`;
  const [{ paid }] = await sql<{ paid: string }[]>`SELECT coalesce(sum(paid_micros), 0) AS paid FROM launch_harvests WHERE token = ${t}`;
  return NextResponse.json({
    coin, paid: Number(paid) / 1e6,
    harvests: harvests.map((h) => ({ txHash: h.tx_hash, block: h.block_number, credit: Number(h.credit_micros) / 1e6, paid: Number(h.paid_micros) / 1e6, holders: h.holders, at: h.created_at })),
    top: top.map((r) => ({ wallet: r.wallet, earned: Number(r.earned) / 1e6 })),
  }, { headers: { "cache-control": "public, s-maxage=15" } });
}
