// Beeper launchpad, server side: finds the deployed launcher, indexes launches and harvests, and pays each
// harvest's USDG to the coin's holders as AI credit, pro rata to their balance at the harvest block.
import { createPublicClient, decodeFunctionData, getAddress, http, parseAbiItem, type Hex, type Log } from "viem";
import { robinhood } from "./chain";
import { sql } from "./db";
import { addToBalance } from "./billing";
import { walletClient } from "./server-wallet";
import { LAUNCHER_ABI, PONS_ESCROW, PONS_FACTORY, ROUTER_ABI, deployPlan } from "./launch";
import { USDG } from "./chain";
import CODE from "./launch-bytecode.json";

const client = createPublicClient({ chain: robinhood, transport: http(process.env.ROBINHOOD_RPC_URL || undefined, { retryCount: 6, retryDelay: 800 }) });
const PLAN = deployPlan(CODE as { router: Hex; launcher: Hex });
export const LAUNCHER = PLAN.launcher;
const SPAN = BigInt(9_999_000); // the RPC allows 10M blocks per getLogs
const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const LAUNCHED = LAUNCHER_ABI.find((x) => x.type === "event" && x.name === "Launched")!;
const HARVESTED = ROUTER_ABI.find((x) => x.type === "event" && x.name === "Harvested")!;
const ZERO = "0x0000000000000000000000000000000000000000";
const DEAD = "0x000000000000000000000000000000000000dead";

const getSetting = async <T,>(key: string) => (await sql<{ value: T }[]>`SELECT value FROM app_settings WHERE key = ${key}`)[0]?.value ?? null;
const setSetting = (key: string, value: object) => sql`
  INSERT INTO app_settings (key, value) VALUES (${key}, ${sql.json(value as never)})
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;

/** The launcher's address and deploy block, once it is on chain (deterministic CREATE2 address). */
export async function launcherState(): Promise<{ address: `0x${string}`; fromBlock: bigint } | null> {
  const saved = await getSetting<{ fromBlock: string }>("launchpad");
  if (saved) return { address: LAUNCHER, fromBlock: BigInt(saved.fromBlock) };
  const code = await client.getCode({ address: LAUNCHER });
  if (!code || code === "0x") return null;
  // First block with code, by binary search, so indexing never has to start from genesis.
  let lo = BigInt(0), hi = await client.getBlockNumber({ cacheTime: 0 });
  while (lo < hi) {
    const mid = (lo + hi) / BigInt(2);
    const c = await client.getCode({ address: LAUNCHER, blockNumber: mid }).catch(() => "0x");
    if (c && c !== "0x") hi = mid; else lo = mid + BigInt(1);
  }
  await setSetting("launchpad", { fromBlock: lo.toString() });
  return { address: LAUNCHER, fromBlock: lo };
}

/** getLogs over any range: 10M-block chunks, split further when a chunk returns too many logs. */
async function logsIn<T>(fetch: (from: bigint, to: bigint) => Promise<T[]>, from: bigint, to: bigint): Promise<T[]> {
  const out: T[] = [];
  const grab = async (a: bigint, b: bigint): Promise<void> => {
    try { out.push(...await fetch(a, b)); }
    catch (e) {
      if (b <= a || !/exceed|limit|spans|too many/i.test(String(e))) throw e;
      const m = (a + b) / BigInt(2);
      await grab(a, m); await grab(m + BigInt(1), b);
    }
  };
  for (let a = from; a <= to; a += SPAN) await grab(a, a + SPAN - BigInt(1) < to ? a + SPAN - BigInt(1) : to);
  return out;
}

/** Indexes new launches, reading name, logo and the rest from each launch transaction's calldata. */
async function syncLaunches(fromBlock: bigint, head: bigint) {
  const cursor = await getSetting<{ block: string }>("launch_cursor");
  const from = cursor ? BigInt(cursor.block) + BigInt(1) : fromBlock;
  if (from > head) return 0;
  const logs = await logsIn((a, b) => client.getLogs({ address: LAUNCHER, event: LAUNCHED, fromBlock: a, toBlock: b }), from, head);
  for (const l of logs) {
    const a = l.args as { id: bigint; creator: string; token: string; curve: string; router: string; model: string };
    const tx = await client.getTransaction({ hash: l.transactionHash! });
    let p: { name?: string; symbol?: string; logo?: string; description?: string; socials?: object; creatorTaxBps?: number } = {};
    try { p = (decodeFunctionData({ abi: LAUNCHER_ABI, data: tx.input }).args?.[0] ?? {}) as typeof p; } catch { /* launched through another contract */ }
    await sql`
      INSERT INTO launch_coins (id, token, curve, router, creator, model, name, symbol, logo, description, socials, tax_bps, created_block, tx_hash)
      VALUES (${Number(a.id)}, ${getAddress(a.token)}, ${getAddress(a.curve)}, ${getAddress(a.router)}, ${getAddress(a.creator)}, ${a.model},
              ${(p.name ?? "").slice(0, 64)}, ${(p.symbol ?? "").slice(0, 16)}, ${(p.logo ?? "").slice(0, 500)}, ${(p.description ?? "").slice(0, 1000)},
              ${sql.json((p.socials ?? {}) as never)}, ${Number(p.creatorTaxBps ?? 0)}, ${l.blockNumber!.toString()}, ${l.transactionHash!})
      ON CONFLICT (id) DO NOTHING`;
  }
  await setSetting("launch_cursor", { block: head.toString() });
  return logs.length;
}

// Contracts never earn: the curve, pools, routers and the like. EIP-7702 wallets (code 0xef0100…) are people.
const isContract = new Map<string, boolean>();
async function contractAddr(a: `0x${string}`) {
  if (!isContract.has(a)) {
    const code = await client.getCode({ address: a });
    isContract.set(a, Boolean(code && code !== "0x" && !code.startsWith("0xef0100")));
  }
  return isContract.get(a)!;
}

/** Holder balances of `token` at the end of `block`, rebuilt from its Transfer events. */
export async function holdersAt(token: `0x${string}`, createdBlock: bigint, block: bigint, skip: string[]) {
  const logs = await logsIn((a, b) => client.getLogs({ address: token, event: TRANSFER, fromBlock: a, toBlock: b }), createdBlock, block);
  const bal = new Map<string, bigint>();
  for (const l of logs) {
    const { from, to, value } = l.args as { from: string; to: string; value: bigint };
    const f = from.toLowerCase(), t = to.toLowerCase();
    bal.set(f, (bal.get(f) ?? BigInt(0)) - value);
    bal.set(t, (bal.get(t) ?? BigInt(0)) + value);
  }
  const excluded = new Set([ZERO, DEAD, PONS_FACTORY.toLowerCase(), PONS_ESCROW.toLowerCase(), LAUNCHER.toLowerCase(), token.toLowerCase(), ...skip.map((s) => s.toLowerCase())]);
  const out: [string, bigint][] = [];
  for (const [w, b] of bal) {
    if (b <= BigInt(0) || excluded.has(w)) continue;
    if (await contractAddr(getAddress(w))) continue;
    out.push([w, b]);
  }
  return out;
}

type Coin = { token: string; curve: string; router: string; created_block: string };

/** Pays one harvest to the coin's holders. Idempotent per (tx, log index). */
async function distribute(coin: Coin, log: Log & { args: { toCredit: bigint } }) {
  const tx = log.transactionHash!, idx = log.logIndex!;
  const [done] = await sql`SELECT 1 FROM launch_harvests WHERE tx_hash = ${tx} AND log_index = ${idx}`;
  if (done) return null;
  const credit = log.args.toCredit;
  const holders = await holdersAt(getAddress(coin.token), BigInt(coin.created_block), log.blockNumber!, [coin.curve, coin.router]);
  const total = holders.reduce((s, [, b]) => s + b, BigInt(0));
  const shares = total > BigInt(0) ? holders.map(([w, b]) => [w, (credit * b) / total] as const).filter(([, m]) => m > BigInt(0)) : [];
  const linked = shares.length
    ? new Map((await sql<{ address: string; user_id: string }[]>`SELECT address, user_id FROM holder_wallets WHERE address IN ${sql(shares.map(([w]) => w))}`).map((r) => [r.address, r.user_id]))
    : new Map<string, string>();

  return sql.begin(async (q) => {
    const ins = await q`
      INSERT INTO launch_harvests (tx_hash, log_index, token, block_number, credit_micros, paid_micros, holders)
      VALUES (${tx}, ${idx}, ${coin.token}, ${log.blockNumber!.toString()}, ${credit.toString()},
              ${shares.reduce((s, [, m]) => s + m, BigInt(0)).toString()}, ${shares.length})
      ON CONFLICT DO NOTHING RETURNING tx_hash`;
    if (!ins.length) return null;
    for (const [wallet, micros] of shares) {
      const user = linked.get(wallet) ?? null;
      await q`INSERT INTO launch_rewards (tx_hash, log_index, wallet, token, amount_micros, user_id, claimed_at)
              VALUES (${tx}, ${idx}, ${wallet}, ${coin.token}, ${micros.toString()}, ${user}, ${user ? new Date() : null})`;
      if (user) await addToBalance(q, user, micros, "launch", `${tx}:${idx}:${wallet}`);
    }
    return { token: coin.token, credit: Number(credit) / 1e6, holders: shares.length };
  });
}

async function syncHarvests(fromBlock: bigint, head: bigint) {
  const coins = await sql<Coin[]>`SELECT token, curve, router, created_block FROM launch_coins`;
  if (!coins.length) return [];
  const byRouter = new Map(coins.map((c) => [getAddress(c.router), c]));
  const cursor = await getSetting<{ block: string }>("launch_harvest_cursor");
  const from = cursor ? BigInt(cursor.block) + BigInt(1) : fromBlock;
  if (from > head) return [];
  const routers = [...byRouter.keys()];
  const logs: (Log & { args: { toCredit: bigint } })[] = [];
  for (let i = 0; i < routers.length; i += 200) {
    const part = await logsIn((a, b) => client.getLogs({ address: routers.slice(i, i + 200), event: HARVESTED, fromBlock: a, toBlock: b }), from, head);
    logs.push(...(part as unknown as (Log & { args: { toCredit: bigint } })[]));
  }
  logs.sort((a, b) => Number(a.blockNumber! - b.blockNumber!) || a.logIndex! - b.logIndex!);
  const paid = [];
  for (const l of logs) {
    const r = await distribute(byRouter.get(getAddress(l.address))!, l);
    if (r) paid.push(r);
  }
  await setSetting("launch_harvest_cursor", { block: head.toString() });
  return paid;
}

type Flow = { usdgIn: bigint; usdgOut: bigint; tokIn: bigint; tokOut: bigint; buyer?: string; seller?: string; block: bigint };

/** Rebuilds curve trades from Transfer logs, since USDG and the coin both move through the curve on every trade. */
async function syncTrades(fromBlock: bigint, head: bigint) {
  const coins = await sql<{ token: string; curve: string }[]>`SELECT token, curve FROM launch_coins`;
  if (!coins.length) return 0;
  const cursor = await getSetting<{ block: string }>("launch_trade_cursor");
  const from = cursor ? BigInt(cursor.block) + BigInt(1) : fromBlock;
  if (from > head) return 0;
  const byCurve = new Map(coins.map((c) => [c.curve.toLowerCase(), getAddress(c.token)]));
  const flows = new Map<string, Flow>();
  for (let i = 0; i < coins.length; i += 100) {
    const part = coins.slice(i, i + 100);
    const curves = part.map((c) => getAddress(c.curve)), tokens = part.map((c) => getAddress(c.token));
    const q = (address: `0x${string}` | `0x${string}`[], args: object) =>
      logsIn((a, b) => client.getLogs({ address, event: TRANSFER, args, fromBlock: a, toBlock: b }), from, head);
    const [usdgIn, usdgOut, tokIn, tokOut] = await Promise.all([
      q(USDG, { to: curves }), q(USDG, { from: curves }), q(tokens, { to: curves }), q(tokens, { from: curves }),
    ]);
    const add = (logs: typeof usdgIn, curveOf: (l: (typeof usdgIn)[number]) => string, k: "usdgIn" | "usdgOut" | "tokIn" | "tokOut") => {
      for (const l of logs) {
        const curve = curveOf(l).toLowerCase();
        if (!byCurve.has(curve)) continue;
        // A token log must be the curve's own coin, not some other launch's.
        if ((k === "tokIn" || k === "tokOut") && byCurve.get(curve)!.toLowerCase() !== l.address.toLowerCase()) continue;
        const key = `${l.transactionHash}:${curve}`;
        const f = flows.get(key) ?? { usdgIn: BigInt(0), usdgOut: BigInt(0), tokIn: BigInt(0), tokOut: BigInt(0), block: l.blockNumber! };
        f[k] += l.args.value!;
        if (k === "tokOut") f.buyer ??= l.args.to!.toLowerCase();
        if (k === "tokIn") f.seller ??= l.args.from!.toLowerCase();
        flows.set(key, f);
      }
    };
    add(usdgIn, (l) => l.args.to!, "usdgIn"); add(usdgOut, (l) => l.args.from!, "usdgOut");
    add(tokIn, (l) => l.args.to!, "tokIn"); add(tokOut, (l) => l.args.from!, "tokOut");
  }
  const times = new Map<bigint, Date>();
  let n = 0;
  for (const [key, f] of flows) {
    const [tx, curve] = key.split(":");
    const buy = f.usdgIn > BigInt(0) && f.tokOut > BigInt(0), sell = f.tokIn > BigInt(0) && f.usdgOut > BigInt(0);
    if (buy === sell) continue; // seeding, graduation and other non trade moves
    if (!times.has(f.block)) times.set(f.block, new Date(Number((await client.getBlock({ blockNumber: f.block })).timestamp) * 1000));
    await sql`
      INSERT INTO launch_trades (tx_hash, token, block_number, ts, side, wallet, usdg_micros, tokens)
      VALUES (${tx}, ${byCurve.get(curve)!}, ${f.block.toString()}, ${times.get(f.block)!}, ${buy ? "buy" : "sell"},
              ${(buy ? f.buyer : f.seller) ?? ""}, ${(buy ? f.usdgIn : f.usdgOut).toString()}, ${(buy ? f.tokOut : f.tokIn).toString()})
      ON CONFLICT DO NOTHING`;
    n++;
  }
  await setSetting("launch_trade_cursor", { block: head.toString() });
  return n;
}

/** Indexes launches and harvests. Cheap to call often: a cursor keeps each run to the new blocks. */
export async function syncLaunchpad() {
  const state = await launcherState();
  if (!state) return { deployed: false as const };
  const head = await client.getBlockNumber({ cacheTime: 0 });
  const launches = await syncLaunches(state.fromBlock, head);
  const paid = await syncHarvests(state.fromBlock, head);
  const trades = await syncTrades(state.fromBlock, head);
  return { deployed: true as const, launches, paid, trades };
}

const MIN_SYNC_GAP_MS = 20_000;

/** Runs the indexer at most once per MIN_SYNC_GAP_MS across all visitors. */
export async function syncThrottled() {
  const claimed = await sql`
    INSERT INTO app_settings (key, value) VALUES ('launch_synced_at', ${sql.json({ at: Date.now() })})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    WHERE (app_settings.value->>'at')::bigint < ${Date.now() - MIN_SYNC_GAP_MS}
    RETURNING key`;
  return claimed.length ? syncLaunchpad() : { skipped: "recently synced" };
}

/** Server wallet harvests every coin (anyone may; this is the daily keeper). */
export async function harvestAll(limit = 100) {
  if (!walletClient) return { harvested: 0, skipped: "no server wallet" };
  const coins = await sql<{ router: string }[]>`SELECT router FROM launch_coins ORDER BY id LIMIT ${limit}`;
  let harvested = 0;
  for (const c of coins) {
    try {
      const hash = await walletClient.writeContract({ address: getAddress(c.router), abi: ROUTER_ABI, functionName: "harvest", account: walletClient.account!, chain: robinhood });
      await client.waitForTransactionReceipt({ hash });
      harvested++;
    } catch (e) { console.error("[launch] harvest failed", c.router, (e as Error).message.slice(0, 200)); }
  }
  return { harvested };
}

/** Credits a newly linked wallet's waiting launchpad rewards to its account. */
export async function claimWallet(userId: string, wallet: string) {
  return sql.begin(async (q) => {
    const rows = await q<{ amount_micros: string }[]>`
      UPDATE launch_rewards SET user_id = ${userId}, claimed_at = now()
      WHERE wallet = ${wallet.toLowerCase()} AND claimed_at IS NULL RETURNING amount_micros`;
    const sum = rows.reduce((s, r) => s + BigInt(r.amount_micros), BigInt(0));
    if (sum > BigInt(0)) await addToBalance(q, userId, sum, "launch", `claim:${wallet.toLowerCase()}:${Date.now()}`);
    return Number(sum) / 1e6;
  });
}

export async function coinsWithStats() {
  return sql<{ id: number; token: string; curve: string; router: string; creator: string; model: string; name: string; symbol: string; logo: string;
    description: string; socials: Record<string, string>; tax_bps: number; created_at: Date; paid: string; harvests: string; holders: number | null }[]>`
    SELECT c.*, coalesce(sum(h.paid_micros), 0) AS paid, count(h.tx_hash) AS harvests,
      (SELECT holders FROM launch_harvests WHERE token = c.token ORDER BY block_number DESC LIMIT 1) AS holders
    FROM launch_coins c LEFT JOIN launch_harvests h ON h.token = c.token
    GROUP BY c.id ORDER BY c.id DESC`;
}
