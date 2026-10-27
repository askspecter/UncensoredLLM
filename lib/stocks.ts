// Pay for AI with tokenized stocks. Shared by the buy form (builds the swap) and the server (quotes it).
// The user's wallet swaps its stock token for the order's exact USDG amount on Uniswap v4 and sends that USDG
// straight to the treasury, in one transaction. Beeper never holds the stock; the order confirms like a USDG payment.
import { encodeAbiParameters, encodeFunctionData, getAddress, maxUint160, maxUint256, parseAbi, type Hex } from "viem";
import { USDG } from "./chain";

// Uniswap v4 on Robinhood Chain (4663), https://developers.uniswap.org/docs/protocols/v4/deployments
export const UNIVERSAL_ROUTER = "0x8876789976decbfcbbbe364623c63652db8c0904" as const;
export const V4_QUOTER = "0x8dc178efb8111bb0973dd9d722ebeff267c98f94" as const;
export const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;

/** Every official Robinhood stock token is a beacon proxy on this beacon; lookalike tokens with the same name are not. */
export const STOCK_BEACON = "0xe10b6f6b275de231345c20d14ab812db62151b00";

export type Stock = { symbol: string; name: string; address: `0x${string}`; pools: [fee: number, tickSpacing: number][] };

// Checked on chain: beacon above, 18 decimals, and the deepest hookless USDG pools (fee 1% or less) for each.
export const STOCKS: Stock[] = [
  { symbol: "NVDA", name: "NVIDIA", address: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC", pools: [[3000, 60], [100, 1], [50, 1], [375, 4]] },
  { symbol: "TSLA", name: "Tesla", address: "0x322F0929c4625eD5bAd873c95208D54E1c003b2d", pools: [[3000, 60]] },
  { symbol: "AAPL", name: "Apple", address: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9", pools: [[3000, 60], [10000, 200], [3100, 60]] },
  { symbol: "SPY", name: "SPDR S&P 500 ETF Trust", address: "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C", pools: [[500, 5], [3000, 60], [100, 1], [9000, 90]] },
  { symbol: "META", name: "Meta Platforms", address: "0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35", pools: [[3000, 60], [310, 3], [210, 2], [2000, 10]] },
  { symbol: "PLTR", name: "Palantir Technologies", address: "0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A", pools: [[10000, 200], [1500, 15]] },
  { symbol: "MSFT", name: "Microsoft", address: "0xe93237C50D904957Cf27E7B1133b510C669c2e74", pools: [[3000, 60], [900, 9]] },
  { symbol: "GOOGL", name: "Alphabet Class A", address: "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3", pools: [[3000, 60], [3499, 60], [300, 3]] },
  { symbol: "AMZN", name: "Amazon", address: "0x12f190a9F9d7D37a250758b26824B97CE941bF54", pools: [[2400, 24], [3000, 60], [2500, 25]] },
  { symbol: "COIN", name: "Coinbase", address: "0x6330D8C3178a418788dF01a47479c0ce7CCF450b", pools: [[10000, 200], [2500, 25]] },
  { symbol: "MSTR", name: "Strategy Inc.", address: "0xec262a75e413fAfD0dF80480274532C79D42da09", pools: [[2500, 25], [2400, 24], [2010, 20]] },
  { symbol: "AMD", name: "AMD", address: "0x86923f96303D656E4aa86D9d42D1e57ad2023fdC", pools: [[10000, 200]] },
  { symbol: "NFLX", name: "Netflix", address: "0xE0444EF8BF4eD74f74FD73686e2ddF4C1c5591E8", pools: [[10000, 100], [1500, 15]] },
  { symbol: "QQQ", name: "Invesco QQQ", address: "0xD5f3879160bc7c32ebb4dC785F8a4F505888de68", pools: [[3000, 60], [10000, 200]] },
  { symbol: "CRCL", name: "Circle Internet Group", address: "0xdF0992E440dD0be65BD8439b609d6D4366bf1CB5", pools: [[3000, 30], [1500, 15], [2500, 25], [2450, 25]] },
  { symbol: "AVGO", name: "Broadcom", address: "0x156E175DD063a8cE274C50654eF40e0032b3fbcF", pools: [[10000, 100]] },];
export const STOCK_DECIMALS = 18;
/** Extra stock the swap may spend over the quote before it reverts. */
export const SLIPPAGE_BPS = 100;

export const stockBySymbol = (s: string) => STOCKS.find((x) => x.symbol === s.toUpperCase());

const ZERO = "0x0000000000000000000000000000000000000000";
export type PoolKey = readonly [`0x${string}`, `0x${string}`, number, number, `0x${string}`];

/** v4 sorts currencies by address; `stockIn` says which side the stock is on. */
export function poolKey(stock: Stock, [fee, tickSpacing]: [number, number]): { key: PoolKey; stockIn: boolean } {
  const s = getAddress(stock.address), u = getAddress(USDG);
  return BigInt(s) < BigInt(u)
    ? { key: [s, u, fee, tickSpacing, ZERO], stockIn: true }
    : { key: [u, s, fee, tickSpacing, ZERO], stockIn: false };
}

export const QUOTER_ABI = parseAbi([
  "function quoteExactOutputSingle(((address,address,uint24,int24,address) poolKey, bool zeroForOne, uint128 exactAmount, bytes hookData) params) returns (uint256 amountIn, uint256 gasEstimate)",
]);
export const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);
export const PERMIT2_ABI = parseAbi([
  "function approve(address token, address spender, uint160 amount, uint48 expiration)",
  "function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)",
]);
const ROUTER_ABI = parseAbi(["function execute(bytes commands, bytes[] inputs, uint256 deadline) payable"]);

type Tx = { to: `0x${string}`; data: Hex };

/** One-time approvals: the stock to Permit2, then Permit2 to the router. */
export const approvePermit2 = (stock: Stock): Tx => ({
  to: stock.address,
  data: encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [PERMIT2, maxUint256] }),
});
export const approveRouter = (stock: Stock, nowSec: number): Tx => ({
  to: PERMIT2,
  data: encodeFunctionData({ abi: PERMIT2_ABI, functionName: "approve", args: [stock.address, UNIVERSAL_ROUTER, maxUint160, nowSec + 30 * 86400] }),
});

// Universal Router command V4_SWAP, and v4 router actions SWAP_EXACT_OUT_SINGLE, SETTLE_ALL, TAKE.
const V4_SWAP = "0x10";
const ACTIONS = "0x080c0e";

/** Swap at most `maxIn` stock for exactly `usdgOut` USDG, delivered to `payTo`. */
export function swapToUsdg(stock: Stock, pool: [number, number], usdgOut: bigint, maxIn: bigint, payTo: `0x${string}`, deadline: number): Tx {
  const { key, stockIn } = poolKey(stock, pool);
  const swap = encodeAbiParameters(
    [{ type: "tuple", components: [
      { type: "tuple", components: [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }] },
      { type: "bool" }, { type: "uint128" }, { type: "uint128" }, { type: "uint256" }, { type: "bytes" },
    ] }],
    // Universal Router 2.1 layout: poolKey, zeroForOne, amountOut, amountInMaximum, minHopPriceX36 (0 = off), hookData.
    [[key, stockIn, usdgOut, maxIn, BigInt(0), "0x"]],
  );
  const settle = encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [stock.address, maxIn]);
  const take = encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint256" }], [USDG, payTo, usdgOut]);
  const input = encodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], [ACTIONS, [swap, settle, take]]);
  return {
    to: UNIVERSAL_ROUTER,
    data: encodeFunctionData({ abi: ROUTER_ABI, functionName: "execute", args: [V4_SWAP, [input], BigInt(deadline)] }),
  };
}

export const withSlippage = (amountIn: bigint) => amountIn + (amountIn * BigInt(SLIPPAGE_BPS)) / BigInt(10_000);
