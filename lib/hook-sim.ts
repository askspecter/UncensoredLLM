// Replays swaps through a full-range Uniswap v4 position with BeeperHook attached, using the contract's integer math.
// Mirrors SwapMath/SqrtPriceMath (single price range, exact-input swaps) and BeeperHook.afterSwap.

const Q96 = BigInt(2) ** BigInt(96);
const PIPS = BigInt(1_000_000);
const BPS = BigInt(10_000);

const mulDiv = (a: bigint, b: bigint, d: bigint) => (a * b) / d;
const mulDivUp = (a: bigint, b: bigint, d: bigint) => { const p = a * b; return p / d + (p % d > BigInt(0) ? BigInt(1) : BigInt(0)); };
const divUp = (a: bigint, d: bigint) => a / d + (a % d > BigInt(0) ? BigInt(1) : BigInt(0));

function amount0Delta(a: bigint, b: bigint, liq: bigint, up: boolean) {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  const n1 = liq << BigInt(96), n2 = hi - lo;
  return up ? divUp(mulDivUp(n1, n2, hi), lo) : mulDiv(n1, n2, hi) / lo;
}
function amount1Delta(a: bigint, b: bigint, liq: bigint, up: boolean) {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return up ? mulDivUp(liq, hi - lo, Q96) : mulDiv(liq, hi - lo, Q96);
}
const nextFromAmount0 = (p: bigint, liq: bigint, amt: bigint) => { const n1 = liq << BigInt(96); return mulDivUp(n1, p, n1 + amt * p); };
const nextFromAmount1 = (p: bigint, liq: bigint, amt: bigint) => p + (amt << BigInt(96)) / liq;

export type HookConfig = { baseFeeBps: number; launchFeeBps: number; launchWindow: number; maxSwapUsdg: bigint; lpFeePips: number };
export type Swap = { at: number; buy: boolean; amount: bigint };
export type SwapResult = Swap & {
  feeBps: number; refused: boolean;
  /** Trader's net amounts: positive = received. BEEP has 18 decimals, USDG 6. */
  beep: bigint; usdg: bigint;
  lpFee: bigint; hookFee: bigint; burnedBeep: bigint; toBcredit: bigint; priceAfter: number;
};

/** Hook fee in bps, `t` seconds after the pool opened. */
export function hookFeeBps(c: HookConfig, t: number) {
  if (t >= c.launchWindow) return c.baseFeeBps;
  return c.launchFeeBps - Math.floor(((c.launchFeeBps - c.baseFeeBps) * t) / c.launchWindow);
}

/** USDG per BEEP for a sqrtPriceX96 (currency0 = BEEP 18 dp, currency1 = USDG 6 dp). */
export const priceOf = (sqrtP: bigint) => { const r = Number(sqrtP) / 2 ** 96; return (r * r * 1e18) / 1e6; };

export function simulate(c: HookConfig, sqrtPrice: bigint, liquidity: bigint, swaps: Swap[]): SwapResult[] {
  let p = sqrtPrice;
  const fee = BigInt(c.lpFeePips);
  return swaps.map((s) => {
    const bps = hookFeeBps(c, s.at);
    const lessFee = mulDiv(s.amount, PIPS - fee, PIPS);
    let next: bigint, out: bigint;
    if (s.buy) { next = nextFromAmount1(p, liquidity, lessFee); out = amount0Delta(p, next, liquidity, false); }
    else { next = nextFromAmount0(p, liquidity, lessFee); out = amount1Delta(next, p, liquidity, false); }
    const amountIn = s.buy ? amount1Delta(p, next, liquidity, true) : amount0Delta(next, p, liquidity, true);
    const usdgMoved = s.buy ? s.amount : out;
    const base = { ...s, feeBps: bps, lpFee: s.amount - amountIn };
    if (s.at < c.launchWindow && usdgMoved > c.maxSwapUsdg) {
      return { ...base, refused: true, beep: BigInt(0), usdg: BigInt(0), lpFee: BigInt(0), hookFee: BigInt(0), burnedBeep: BigInt(0), toBcredit: BigInt(0), priceAfter: priceOf(p) };
    }
    const hookFee = (out * BigInt(bps)) / BPS;
    p = next;
    return {
      ...base, refused: false, hookFee,
      beep: s.buy ? out - hookFee : -s.amount,
      usdg: s.buy ? -s.amount : out - hookFee,
      burnedBeep: s.buy ? hookFee : BigInt(0),
      toBcredit: s.buy ? BigInt(0) : hookFee,
      priceAfter: priceOf(p),
    };
  });
}

// Full-range bounds for tick spacing 200 (TickMath.getSqrtPriceAtTick(±887200)).
const MIN_SQRT = BigInt("4310618292");
const MAX_SQRT = BigInt("1456195216270955103206513029158776779468408838535");

function isqrt(n: bigint) {
  if (n < BigInt(2)) return n;
  let x = n, y = (x + BigInt(1)) / BigInt(2);
  while (y < x) { x = y; y = (x + n / x) / BigInt(2); }
  return x;
}

/** Starting sqrtPriceX96 the deploy script derives from the seed amounts. */
export const sqrtPriceFromAmounts = (beep: bigint, usdg: bigint) => isqrt((usdg << BigInt(192)) / beep);

/** LiquidityAmounts.getLiquidityForAmounts for a full-range position. */
export function fullRangeLiquidity(sqrtP: bigint, beep: bigint, usdg: bigint) {
  const l0 = mulDiv(beep, mulDiv(sqrtP, MAX_SQRT, Q96), MAX_SQRT - sqrtP);
  const l1 = mulDiv(usdg, Q96, sqrtP - MIN_SQRT);
  return l0 < l1 ? l0 : l1;
}
