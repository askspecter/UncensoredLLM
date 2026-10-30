import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";

/** What this account earned from launchpad coins, and what its linked wallets still have waiting. */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const rows = await sql<{ token: string; symbol: string; earned: string }[]>`
    SELECT r.token, c.symbol, sum(r.amount_micros) AS earned FROM launch_rewards r JOIN launch_coins c ON c.token = r.token
    WHERE r.user_id = ${auth.userId} GROUP BY r.token, c.symbol ORDER BY 3 DESC`;
  return NextResponse.json({ coins: rows.map((r) => ({ token: r.token, symbol: r.symbol, earned: Number(r.earned) / 1e6 })), total: rows.reduce((s, r) => s + Number(r.earned) / 1e6, 0) });
}
