// bCREDIT: each UTC day, a share of Beeper's gross margin is split across linked $BEEP holders
// pro rata to the $BEEP their wallets hold. 1 bCREDIT activates into $1 of API balance.
import { createPublicClient, erc20Abi, getAddress, http } from "viem";
import { MARGIN } from "./data";
import { MICROS, sql } from "./db";
import { addToBalance } from "./billing";
import { robinhood } from "./chain";
import { BEEP } from "./token";

/** Share of daily gross margin paid to holders. */
export const HOLDER_SHARE = Math.min(Math.max(Number(process.env.BCREDIT_SHARE ?? 0.2), 0), 0.5);
/** Minimum $BEEP a wallet must hold to earn (whole tokens). */
export const MIN_BEEP = Number(process.env.BCREDIT_MIN_BEEP ?? 1000);

const client = createPublicClient({ chain: robinhood, transport: http(process.env.ROBINHOOD_RPC_URL || undefined) });
const WEI = BigInt(10) ** BigInt(BEEP.decimals);

export { linkMessage } from "./bcredit-shared";

export async function beepBalance(address: string): Promise<bigint> {
  return client.readContract({ address: BEEP.address, abi: erc20Abi, functionName: "balanceOf", args: [getAddress(address)] });
}

/** Gross margin earned on usage during a UTC day (charged minus upstream cost). */
async function dailyRevenue(day: string): Promise<bigint> {
  const [r] = await sql<{ charged: string }[]>`
    SELECT coalesce(sum(cost_micros), 0) AS charged FROM usage_logs
    WHERE created_at >= ${day}::date AND created_at < ${day}::date + 1`;
  const charged = BigInt(r.charged);
  return charged - (charged * BigInt(1_000_000)) / BigInt(Math.round((1 + MARGIN) * 1_000_000));
}

/** Distributes bCREDIT for `day` (YYYY-MM-DD, UTC). Idempotent: a day is only paid once. */
export async function distribute(day: string) {
  const [done] = await sql`SELECT day FROM bcredit_epochs WHERE day = ${day}`;
  if (done) return { day, skipped: "already distributed" };

  const revenue = await dailyRevenue(day);
  const pool = (revenue * BigInt(Math.round(HOLDER_SHARE * 10_000))) / BigInt(10_000);
  const wallets = await sql<{ address: string; user_id: string }[]>`SELECT address, user_id FROM holder_wallets`;
  const block = await client.getBlockNumber();

  // Snapshot balances now, aggregate per account, drop holders below the minimum.
  const perUser = new Map<string, bigint>();
  for (let i = 0; i < wallets.length; i += 20) {
    const chunk = wallets.slice(i, i + 20);
    const bals = await Promise.all(chunk.map((w) => beepBalance(w.address).catch(() => BigInt(0))));
    chunk.forEach((w, j) => perUser.set(w.user_id, (perUser.get(w.user_id) ?? BigInt(0)) + bals[j]));
  }
  const min = BigInt(MIN_BEEP) * WEI;
  const eligible = [...perUser].filter(([, b]) => b >= min);
  const total = eligible.reduce((s, [, b]) => s + b, BigInt(0));

  return sql.begin(async (tx) => {
    const ins = await tx`
      INSERT INTO bcredit_epochs (day, revenue_micros, pool_micros, total_beep, holders, block_number)
      VALUES (${day}, ${revenue.toString()}, ${pool.toString()}, ${total.toString()}, ${eligible.length}, ${block.toString()})
      ON CONFLICT (day) DO NOTHING RETURNING day`;
    if (!ins.length) return { day, skipped: "already distributed" };
    let paid = BigInt(0);
    if (total > BigInt(0) && pool > BigInt(0)) {
      for (const [userId, bal] of eligible) {
        const amount = (pool * bal) / total; // rounds down, so the sum never exceeds the pool
        if (amount <= BigInt(0)) continue;
        await tx`INSERT INTO bcredit_rewards (day, user_id, beep_balance, amount_micros) VALUES (${day}, ${userId}, ${bal.toString()}, ${amount.toString()})`;
        await tx`UPDATE users SET bcredit_micros = bcredit_micros + ${amount.toString()} WHERE id = ${userId}`;
        paid += amount;
      }
    }
    return { day, revenue: Number(revenue) / MICROS, pool: Number(pool) / MICROS, paid: Number(paid) / MICROS, holders: eligible.length };
  });
}

/** Moves bCREDIT into API balance 1:1. */
export async function activate(userId: string): Promise<number> {
  return sql.begin(async (tx) => {
    const [u] = await tx<{ bcredit_micros: string }[]>`SELECT bcredit_micros FROM users WHERE id = ${userId} FOR UPDATE`;
    const amt = BigInt(u?.bcredit_micros ?? 0);
    if (amt <= BigInt(0)) return 0;
    await tx`UPDATE users SET bcredit_micros = 0 WHERE id = ${userId}`;
    await addToBalance(tx, userId, amt, "bcredit", `bcredit:${Date.now()}`);
    return Number(amt) / MICROS;
  });
}

export const toBeep = (wei: string | bigint) => Number(BigInt(wei) / WEI);
