import { NextResponse } from "next/server";
import { createPublicClient, erc20Abi, getAddress, http, isAddress } from "viem";
import { sql } from "@/lib/db";
import { robinhood } from "@/lib/chain";
import { syncThrottled } from "@/lib/launch-server";

const client = createPublicClient({ chain: robinhood, transport: http(process.env.ROBINHOOD_RPC_URL || undefined) });
export const maxDuration = 60;

/** One coin: its launch details, trades for the chart, recent harvests and top earners. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isAddress(token)) return NextResponse.json({ error: "Bad address" }, { status: 400 });
  const t = getAddress(token);
  await syncThrottled().catch((e) => console.error("[launch] sync", e));
  const [coin] = await sql`SELECT * FROM launch_coins WHERE token = ${t}`;
  if (!coin) return NextResponse.json({ error: "Not a Beeper launch (yet). If it was just launched, try again in a minute." }, { status: 404 });
  const harvests = await sql<{ tx_hash: string; block_number: string; credit_micros: string; paid_micros: string; holders: number; created_at: Date }[]>`
    SELECT tx_hash, block_number, credit_micros, paid_micros, holders, created_at FROM launch_harvests WHERE token = ${t} ORDER BY block_number DESC LIMIT 20`;
  const top = await sql<{ wallet: string; earned: string }[]>`
    SELECT wallet, sum(amount_micros) AS earned FROM launch_rewards WHERE token = ${t} GROUP BY wallet ORDER BY 2 DESC LIMIT 10`;
  const trades = await sql<{ tx_hash: string; ts: Date; side: string; wallet: string; usdg_micros: string; tokens: string }[]>`
    SELECT * FROM (SELECT tx_hash, ts, side, wallet, usdg_micros, tokens, block_number FROM launch_trades WHERE token = ${t}
      ORDER BY block_number DESC LIMIT 1000) x ORDER BY block_number`;
  const supply = await client.readContract({ address: t, abi: erc20Abi, functionName: "totalSupply" }).catch(() => null);
  const [{ paid }] = await sql<{ paid: string }[]>`SELECT coalesce(sum(paid_micros), 0) AS paid FROM launch_harvests WHERE token = ${t}`;
  return NextResponse.json({
    coin, paid: Number(paid) / 1e6, supply: supply === null ? null : Number(supply / BigInt(1e12)) / 1e6,
    trades: trades.map((r) => ({ tx: r.tx_hash, at: r.ts, side: r.side, wallet: r.wallet, usdg: Number(r.usdg_micros) / 1e6, tokens: Number(BigInt(r.tokens) / BigInt(1e12)) / 1e6 })),
    harvests: harvests.map((h) => ({ txHash: h.tx_hash, block: h.block_number, credit: Number(h.credit_micros) / 1e6, paid: Number(h.paid_micros) / 1e6, holders: h.holders, at: h.created_at })),
    top: top.map((r) => ({ wallet: r.wallet, earned: Number(r.earned) / 1e6 })),
  }, { headers: { "cache-control": "public, s-maxage=15" } });
}
