// beeper.trade, server side: quotes, cashback claims and the Hook Scan.
import { randomBytes } from "crypto";
import { createPublicClient, decodeEventLog, getAddress, http, isHash, parseAbi, parseAbiItem, toHex, type Address, type Hex } from "viem";
import { PAY_TO, USDG, robinhood } from "./chain";
import { sql } from "./db";
import { addToBalance } from "./billing";
import { POOL_MANAGER } from "./hook";
import { ERC20_ABI, PERMIT2, PERMIT2_ABI, UNIVERSAL_ROUTER, V4_QUOTER, poolKey, stockBySymbol, type Stock } from "./stocks";
import { TRADE_FEE_BPS, buyFee, decodeTrade, withFloor, type Side } from "./trade";

// The public RPC rate limits bursts (429), so back off and retry instead of failing the request.
const client = createPublicClient({ chain: robinhood, transport: http(process.env.ROBINHOOD_RPC_URL || undefined, { retryCount: 6, retryDelay: 800 }) });
const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
// The quoter is not a view function, but eth_call runs it fine; declaring it view lets it ride in a multicall.
const QUOTE_IN_ABI = parseAbi([
  "function quoteExactInputSingle(((address,address,uint24,int24,address) poolKey, bool zeroForOne, uint128 exactAmount, bytes hookData) params) view returns (uint256 amountOut, uint256 gasEstimate)",
]);
const STATE_VIEW = "0xf3334192d15450cdd385c8b70e03f9a6bd9e673b" as const;
const STATE_ABI = parseAbi([
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) view returns (uint128)",
]);

export const tradeEnabled = Boolean(PAY_TO);
const MAX_USDG = BigInt(50_000) * BigInt(1_000_000);

/** Best hookless pool for an exact-in swap, the fee, and the output after fee. */
export async function quoteTrade(stock: Stock, side: Side, amountIn: bigint) {
  let best: { pool: [number, number]; gross: bigint } | null = null;
  await Promise.all(stock.pools.map(async (pool) => {
    const { key, stockIn } = poolKey(stock, pool);
    try {
      const [gross] = await client.readContract({
        address: V4_QUOTER, abi: QUOTE_IN_ABI, functionName: "quoteExactInputSingle",
        args: [{ poolKey: key, zeroForOne: side === "sell" ? stockIn : !stockIn, exactAmount: amountIn, hookData: "0x" }],
      });
      if (!best || gross > best.gross) best = { pool, gross };
    } catch { /* too shallow for this size */ }
  }));
  const q = best as { pool: [number, number]; gross: bigint } | null;
  if (!q) return null;
  const fee = side === "sell" ? (q.gross * BigInt(TRADE_FEE_BPS)) / BigInt(10_000) : buyFee(amountIn);
  const out = side === "sell" ? q.gross - fee : q.gross;
  return { pool: q.pool, out, minOut: withFloor(out), fee, spend: side === "buy" ? amountIn + fee : amountIn };
}

/** What `owner` still has to approve before spending `amount` of `token` through the router. */
export async function approvalsNeeded(owner: Address, token: Address, amount: bigint) {
  const [erc, p2, balance] = await Promise.all([
    client.readContract({ address: token, abi: ERC20_ABI, functionName: "allowance", args: [owner, PERMIT2] }),
    client.readContract({ address: PERMIT2, abi: PERMIT2_ABI, functionName: "allowance", args: [owner, token, UNIVERSAL_ROUTER] }),
    client.readContract({ address: token, abi: ERC20_ABI, functionName: "balanceOf", args: [owner] }),
  ]);
  return { permit2: erc < amount, router: p2[0] < amount || p2[1] < Math.floor(Date.now() / 1000) + 600, balance };
}

export const usdgLimit = (side: Side, amountIn: bigint, out: bigint) => (side === "buy" ? amountIn : out) <= MAX_USDG;

export async function createIntent(userId: string): Promise<Hex> {
  const id = toHex(randomBytes(32));
  await sql`INSERT INTO trade_intents (id, user_id) VALUES (${id}, ${userId})`;
  return id;
}

export type Claim = { ok: true; fee: number; symbol: string; side: Side } | { ok: false; error: string; pending?: boolean };

/**
 * Pays a swap's fee back as credit, once. The swap must be a beeper.trade swap (decoded from its calldata),
 * carry an intent id this user created, and have sent its fee in USDG to the treasury.
 */
export async function claimCashback(userId: string, intentId: string, txHash: string): Promise<Claim> {
  if (!isHash(txHash) || !/^0x[0-9a-f]{64}$/i.test(intentId)) return { ok: false, error: "Bad request" };
  const hash = txHash.toLowerCase() as Hex;
  const [intent] = await sql<{ user_id: string }[]>`SELECT user_id FROM trade_intents WHERE id = ${intentId.toLowerCase()}`;
  if (!intent || intent.user_id !== userId) return { ok: false, error: "Unknown trade" };

  const [tx, receipt] = await Promise.all([
    client.getTransaction({ hash }).catch(() => null),
    client.getTransactionReceipt({ hash }).catch(() => null),
  ]);
  if (!tx || !receipt) return { ok: false, error: "Not confirmed yet", pending: true };
  if (receipt.status !== "success") return { ok: false, error: "The swap failed on chain" };
  if (!tx.to || getAddress(tx.to) !== getAddress(UNIVERSAL_ROUTER)) return { ok: false, error: "Not a beeper.trade swap" };
  const trade = decodeTrade(tx.input);
  if (!trade || trade.tag.toLowerCase() !== intentId.toLowerCase() || trade.feeTo !== getAddress(PAY_TO!)) {
    return { ok: false, error: "Not a beeper.trade swap" };
  }

  // The fee is the one USDG transfer from the pool manager to the treasury in this transaction.
  const fees = receipt.logs.flatMap((l) => {
    if (getAddress(l.address) !== getAddress(USDG)) return [];
    try {
      const e = decodeEventLog({ abi: [TRANSFER], data: l.data, topics: l.topics });
      return getAddress(e.args.from) === getAddress(POOL_MANAGER) && getAddress(e.args.to) === getAddress(PAY_TO!) ? [e.args.value] : [];
    } catch { return []; }
  });
  if (fees.length !== 1 || fees[0] <= BigInt(0)) return { ok: false, error: "No fee found in that swap" };
  if (trade.buyFee !== null && fees[0] !== trade.buyFee) return { ok: false, error: "Fee does not match the swap" };
  const fee = fees[0];

  return sql.begin(async (q) => {
    // Same lock as order confirmation, so one transfer can never be both a payment and a cashback.
    await q`SELECT pg_advisory_xact_lock(hashtext(${hash}))`;
    const [order] = await q`SELECT 1 FROM orders WHERE lower(tx_hash) = ${hash}`;
    if (order) return { ok: false as const, error: "That transaction paid an order" };
    const done = await q`SELECT 1 FROM trade_cashback WHERE tx_hash = ${hash} OR intent_id = ${intentId.toLowerCase()}`;
    if (done.length) return { ok: false as const, error: "Already claimed" };
    await q`INSERT INTO trade_cashback (tx_hash, intent_id, user_id, wallet, symbol, side, fee_micros)
            VALUES (${hash}, ${intentId.toLowerCase()}, ${userId}, ${getAddress(tx.from)}, ${trade.stock.symbol}, ${trade.side}, ${fee.toString()})`;
    await addToBalance(q, userId, fee, "cashback", hash);
    return { ok: true as const, fee: Number(fee) / 1e6, symbol: trade.stock.symbol, side: trade.side };
  });
}

export async function cashbackSummary(userId: string) {
  const [t] = await sql<{ total: string | null; n: string }[]>`SELECT sum(fee_micros) AS total, count(*) AS n FROM trade_cashback WHERE user_id = ${userId}`;
  const recent = await sql<{ tx_hash: string; symbol: string; side: string; fee_micros: string; created_at: Date }[]>`
    SELECT tx_hash, symbol, side, fee_micros, created_at FROM trade_cashback WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 10`;
  return {
    total: Number(t.total ?? 0) / 1e6, trades: Number(t.n),
    recent: recent.map((r) => ({ txHash: r.tx_hash, symbol: r.symbol, side: r.side, fee: Number(r.fee_micros) / 1e6, at: r.created_at })),
  };
}

// ---------------------------------------------------------------- Hook Scan

const INITIALIZE = parseAbiItem("event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)");
const SCAN_TTL_MS = 15 * 60_000;
const PROBE_USDG = BigInt(20_000_000); // $20
const LOG_SPAN = BigInt(9_999_000);
const ZERO = "0x0000000000000000000000000000000000000000";
const inflight = new Map<string, Promise<void>>();

export type PoolScan = {
  poolId: string; fee: number; tickSpacing: number; hooks: string; liquidity: string;
  declaredBps: number | null; costBps: number | null; impactBps: number | null; hiddenBps: number | null;
  status: "honest" | "hidden" | "extreme" | "shallow" | "empty" | "reverts" | "new"; routed: boolean; scannedAt: Date | null;
};

/** Every stock/USDG pool for `symbol` with its real cost, rescanned when older than SCAN_TTL_MS. */
export async function hookScan(symbol: string) {
  const stock = stockBySymbol(symbol);
  if (!stock) return null;
  const [last] = await sql<{ at: Date | null }[]>`SELECT max(scanned_at) AS at FROM pool_scans WHERE symbol = ${stock.symbol}`;
  if (!last?.at || Date.now() - last.at.getTime() > SCAN_TTL_MS) {
    if (!inflight.has(stock.symbol)) inflight.set(stock.symbol, rescan(stock).finally(() => inflight.delete(stock.symbol)));
    await inflight.get(stock.symbol);
  }
  const rows = await sql<{
    pool_id: string; fee: number; tick_spacing: number; hooks: string; liquidity: string; declared_bps: string | null;
    cost_bps: string | null; impact_bps: string | null; hidden_bps: string | null; status: PoolScan["status"]; scanned_at: Date | null;
  }[]>`SELECT * FROM pool_scans WHERE symbol = ${stock.symbol} AND status <> 'empty' ORDER BY liquidity DESC LIMIT 60`;
  const [{ total, empty }] = await sql<{ total: string; empty: string }[]>`
    SELECT count(*) AS total, count(*) FILTER (WHERE status = 'empty') AS empty FROM pool_scans WHERE symbol = ${stock.symbol}`;
  const routed = new Set(stock.pools.map((p) => `${p[0]}/${p[1]}`));
  const n = (v: string | null) => (v === null ? null : Number(v));
  return {
    symbol: stock.symbol, total: Number(total), empty: Number(empty),
    pools: rows.map<PoolScan>((r) => ({
      poolId: r.pool_id, fee: r.fee, tickSpacing: r.tick_spacing, hooks: r.hooks, liquidity: r.liquidity,
      declaredBps: n(r.declared_bps), costBps: n(r.cost_bps), impactBps: n(r.impact_bps), hiddenBps: n(r.hidden_bps),
      status: r.status, scannedAt: r.scanned_at, routed: r.hooks === ZERO && routed.has(`${r.fee}/${r.tick_spacing}`),
    })),
  };
}

async function rescan(stock: Stock) {
  await discover(stock);
  const pools = await sql<{ pool_id: string; fee: number; tick_spacing: number; hooks: string }[]>`
    SELECT pool_id, fee, tick_spacing, hooks FROM pool_scans WHERE symbol = ${stock.symbol}`;
  const states = await client.multicall({
    allowFailure: true,
    contracts: pools.flatMap((p) => [
      { address: STATE_VIEW, abi: STATE_ABI, functionName: "getSlot0" as const, args: [p.pool_id as Hex] },
      { address: STATE_VIEW, abi: STATE_ABI, functionName: "getLiquidity" as const, args: [p.pool_id as Hex] },
    ]),
  });
  // StateView reads never revert, so any failure here is the RPC: keep the last scan rather than mark pools empty.
  if (states.some((r) => r.status !== "success")) throw new Error("pool state read failed");
  const live = pools.map((p, i) => {
    const s0 = states[2 * i], liq = states[2 * i + 1];
    return {
      ...p,
      slot0: s0.status === "success" ? (s0.result as readonly [bigint, number, number, number]) : null,
      liquidity: liq.status === "success" ? (liq.result as bigint) : BigInt(0),
    };
  });

  const usdg = getAddress(USDG);
  const toQuote = live.filter((p) => p.liquidity > BigInt(0) && p.slot0 && p.slot0[0] > BigInt(0));
  const quotes: { status: "success" | "failure"; result?: unknown }[] = [];
  for (let i = 0; i < toQuote.length; i += 20) {
    const part = toQuote.slice(i, i + 20);
    quotes.push(...await client.multicall({
      allowFailure: true,
      contracts: part.map((p) => {
        const { key } = poolKey(stock, [p.fee, p.tick_spacing]);
        const k = [key[0], key[1], key[2], key[3], getAddress(p.hooks)] as const;
        return { address: V4_QUOTER, abi: QUOTE_IN_ABI, functionName: "quoteExactInputSingle" as const, args: [{ poolKey: k, zeroForOne: getAddress(k[0]) === usdg, exactAmount: PROBE_USDG, hookData: "0x" as Hex }] };
      }),
    }));
  }

  // A hook that burns gas can starve the rest of its batch, so a failed quote only counts after it fails alone too.
  await Promise.all(toQuote.map(async (p, i) => {
    if (quotes[i]?.status === "success") return;
    const { key } = poolKey(stock, [p.fee, p.tick_spacing]);
    const k = [key[0], key[1], key[2], key[3], getAddress(p.hooks)] as const;
    try {
      const result = await client.readContract({ address: V4_QUOTER, abi: QUOTE_IN_ABI, functionName: "quoteExactInputSingle", args: [{ poolKey: k, zeroForOne: getAddress(k[0]) === usdg, exactAmount: PROBE_USDG, hookData: "0x" }] });
      quotes[i] = { status: "success", result };
    } catch { quotes[i] = { status: "failure" }; }
  }));

  const now = new Date();
  await sql.begin(async (q) => {
    for (const p of live) {
      const qi = toQuote.indexOf(p);
      if (qi < 0) {
        await q`UPDATE pool_scans SET liquidity = ${p.liquidity.toString()}, status = 'empty', declared_bps = NULL, cost_bps = NULL, impact_bps = NULL, hidden_bps = NULL, scanned_at = ${now} WHERE pool_id = ${p.pool_id}`;
        continue;
      }
      const m = measure(p.slot0!, p.liquidity, getAddress(poolKey(stock, [p.fee, p.tick_spacing]).key[0]) === usdg, quotes[qi]);
      await q`UPDATE pool_scans SET liquidity = ${p.liquidity.toString()}, status = ${m.status}, declared_bps = ${m.declared},
              cost_bps = ${m.cost}, impact_bps = ${m.impact}, hidden_bps = ${m.hidden}, scanned_at = ${now} WHERE pool_id = ${p.pool_id}`;
    }
  });
}

/**
 * Compares what a $20 swap really returns with the pool's own mid price. What the declared fee and the
 * price impact don't explain was taken somewhere else, usually by the hook.
 */
function measure(slot0: readonly [bigint, number, number, number], liquidity: bigint, usdgIs0: boolean, quote: { status: string; result?: unknown }) {
  const [sqrtP, , protocolFee, lpFee] = slot0;
  const declared = (lpFee + (protocolFee & 0xfff)) / 100; // pips (1e-6) to bps
  if (quote.status !== "success") return { status: declared >= 500 ? "extreme" : "reverts", declared, cost: null, impact: null, hidden: null };
  const out = Number((quote.result as readonly [bigint, bigint])[0]);
  const p = (Number(sqrtP) / 2 ** 96) ** 2; // currency1 per currency0, raw units
  const a = Number(PROBE_USDG);
  const mid = usdgIs0 ? a * p : a / p;
  // Virtual USDG reserve at the current tick: the price impact of a constant-product swap of `a` is a / (x + a).
  const x = usdgIs0 ? (Number(liquidity) * 2 ** 96) / Number(sqrtP) : (Number(liquidity) * Number(sqrtP)) / 2 ** 96;
  const impact = (a / (x + a)) * 10_000;
  const cost = (1 - out / mid) * 10_000;
  const hidden = cost - declared - impact;
  const round = (v: number) => Math.round(v * 100) / 100;
  // Hookless pools land within half a basis point of this model, so anything past 3 bps (or 10% of the impact) is real.
  const status = declared >= 500 ? "extreme" : impact > 100 ? "shallow" : hidden > Math.max(3, impact * 0.1) ? "hidden" : "honest";
  return { status, declared: round(declared), cost: round(cost), impact: round(impact), hidden: round(hidden) };
}

/** Indexes new pools for this stock from the pool manager's Initialize events since the last scan. */
async function discover(stock: Stock) {
  const key = `poolscan:${stock.symbol}`;
  const [row] = await sql<{ value: { block: string } }[]>`SELECT value FROM app_settings WHERE key = ${key}`;
  const head = await client.getBlockNumber();
  let from = BigInt(row?.value.block ?? "0");
  const { key: k } = poolKey(stock, [0, 1]);
  while (from <= head) {
    const to = from + LOG_SPAN > head ? head : from + LOG_SPAN;
    const logs = await client.getLogs({ address: POOL_MANAGER, event: INITIALIZE, args: { currency0: k[0], currency1: k[1] }, fromBlock: from, toBlock: to });
    for (const l of logs) {
      await sql`INSERT INTO pool_scans (pool_id, symbol, fee, tick_spacing, hooks)
                VALUES (${l.args.id!}, ${stock.symbol}, ${l.args.fee!}, ${l.args.tickSpacing!}, ${getAddress(l.args.hooks!)}) ON CONFLICT DO NOTHING`;
    }
    from = to + BigInt(1);
    // Save progress per chunk, so a rate-limited scan resumes here next time.
    await sql`INSERT INTO app_settings (key, value) VALUES (${key}, ${sql.json({ block: from.toString() })})
              ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
  }
}

