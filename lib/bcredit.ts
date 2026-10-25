// bCREDIT: each UTC day, a share of Beeper's gross margin is split across linked $BEEP holders
// pro rata to the $BEEP their wallets hold. 1 bCREDIT activates into $1 of API balance.
import { createPublicClient, erc20Abi, getAddress, http, parseAbiItem } from "viem";
import { MARGIN } from "./data";
import { MICROS, sql } from "./db";
import { addToBalance } from "./billing";
import { USDG, robinhood } from "./chain";
import { BEEP } from "./token";
import { liveHook } from "./hook-server";

/** Share of daily gross margin paid to holders. */
export const HOLDER_SHARE = Math.min(Math.max(Number(process.env.BCREDIT_SHARE ?? 0.2), 0), 0.5);
/** Minimum $BEEP a wallet must hold to earn (whole tokens). */
export const MIN_BEEP = Number(process.env.BCREDIT_MIN_BEEP ?? 1000);

const client = createPublicClient({ chain: robinhood, transport: http(process.env.ROBINHOOD_RPC_URL || undefined) });
const WEI = BigInt(10) ** BigInt(BEEP.decimals);

export { linkMessage } from "./bcredit-shared";

// BeeperHook (contracts/src/BeeperHook.sol): its USDG fees go to holders in full.
const HOOK_FEE = parseAbiItem("event HookFee(bytes32 indexed poolId, address indexed currency, uint256 amount, uint256 feeBps, bool burned)");

/** USDG (6 decimals, so already micro-dollars) the hook sent to the vault in (from, to]. */
async function hookFees(hook: `0x${string}`, from: bigint, to: bigint): Promise<bigint> {
  if (to <= from) return BigInt(0);
  let sum = BigInt(0);
  for (let start = from + BigInt(1); start <= to; start += BigInt(50_000)) {
    const end = start + BigInt(49_999) < to ? start + BigInt(49_999) : to;
    const logs = await client.getLogs({ address: hook, event: HOOK_FEE, args: { currency: USDG }, fromBlock: start, toBlock: end });
    for (const l of logs) sum += l.args.amount ?? BigInt(0);
  }
  return sum;
}

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
  const block = await client.getBlockNumber();
  const hook = await liveHook();
  const [{ last }] = await sql<{ last: string | null }[]>`SELECT max(hook_to_block) AS last FROM bcredit_epochs`;
  const hookFrom = last ? BigInt(last) : hook && hook.fromBlock > BigInt(0) ? hook.fromBlock - BigInt(1) : block;
  const fromHook = hook ? await hookFees(hook.address, hookFrom, block) : BigInt(0);
  const pool = (revenue * BigInt(Math.round(HOLDER_SHARE * 10_000))) / BigInt(10_000) + fromHook;
  const wallets = await sql<{ address: string; user_id: string }[]>`SELECT address, user_id FROM holder_wallets`;

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
      INSERT INTO bcredit_epochs (day, revenue_micros, pool_micros, total_beep, holders, block_number, hook_fees_micros, hook_to_block)
      VALUES (${day}, ${revenue.toString()}, ${pool.toString()}, ${total.toString()}, ${eligible.length}, ${block.toString()}, ${fromHook.toString()}, ${hook ? block.toString() : null})
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
    return { day, revenue: Number(revenue) / MICROS, hookFees: Number(fromHook) / MICROS, pool: Number(pool) / MICROS, paid: Number(paid) / MICROS, holders: eligible.length };
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
