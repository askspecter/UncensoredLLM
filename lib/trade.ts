// beeper.trade swaps. Shared by the terminal (builds the swap) and the server (checks it before paying cashback).
// Every swap routes through one hookless Uniswap v4 pool and sends a TRADE_FEE_BPS cut in USDG to the treasury in
// the same transaction; the trader gets that fee back as Beeper credit. The intent id in hookData ties the swap to
// the account that asked for it, so nobody can claim someone else's trade.
import { decodeAbiParameters, decodeFunctionData, encodeAbiParameters, encodeFunctionData, getAddress, parseAbi, type Hex } from "viem";
import { USDG } from "./chain";
import { STOCKS, UNIVERSAL_ROUTER, poolKey, type Stock } from "./stocks";

export const TRADE_FEE_BPS = 25;
/** Lowest output the swap accepts, below the quote. */
export const TRADE_SLIPPAGE_BPS = 100;

export type Side = "sell" | "buy";

// v4 router actions: SWAP_EXACT_IN_SINGLE, SETTLE, SETTLE_ALL, TAKE, TAKE_ALL, TAKE_PORTION.
const SELL_ACTIONS = "0x060c100f"; // swap stock in, pay all stock, fee portion of USDG out, rest of USDG to trader
const BUY_ACTIONS = "0x060b0e0f"; // swap USDG in, pay USDG plus fee, fee to treasury, all stock to trader

const KEY = { type: "tuple", components: [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }] } as const;
// Universal Router 2.1 layout: poolKey, zeroForOne, amountIn, amountOutMinimum, minHopPriceX36 (0 = off), hookData.
const SWAP = [{ type: "tuple", components: [KEY, { type: "bool" }, { type: "uint128" }, { type: "uint128" }, { type: "uint256" }, { type: "bytes" }] }] as const;
const CUR_AMT = [{ type: "address" }, { type: "uint256" }] as const;
const CUR_AMT_BOOL = [{ type: "address" }, { type: "uint256" }, { type: "bool" }] as const;
const CUR_ADDR_AMT = [{ type: "address" }, { type: "address" }, { type: "uint256" }] as const;
const ROUTER_ABI = parseAbi(["function execute(bytes commands, bytes[] inputs, uint256 deadline) payable"]);
const V4_SWAP = "0x10";

/** Fee the buyer adds on top of the USDG they swap. */
export const buyFee = (usdgIn: bigint) => (usdgIn * BigInt(TRADE_FEE_BPS)) / BigInt(10_000);
export const withFloor = (out: bigint) => out - (out * BigInt(TRADE_SLIPPAGE_BPS)) / BigInt(10_000);

export function encodeTrade(t: {
  stock: Stock; pool: [number, number]; side: Side; amountIn: bigint; minOut: bigint;
  payTo: `0x${string}`; tag: Hex; deadline: number;
}): { to: `0x${string}`; data: Hex } {
  const { key, stockIn } = poolKey(t.stock, t.pool);
  const zeroForOne = t.side === "sell" ? stockIn : !stockIn;
  const swap = encodeAbiParameters(SWAP, [[key, zeroForOne, t.amountIn, t.minOut, BigInt(0), t.tag]]);
  let actions: Hex, params: Hex[];
  if (t.side === "sell") {
    actions = SELL_ACTIONS;
    params = [
      swap,
      encodeAbiParameters(CUR_AMT, [t.stock.address, t.amountIn]),
      encodeAbiParameters(CUR_ADDR_AMT, [USDG, t.payTo, BigInt(TRADE_FEE_BPS)]),
      encodeAbiParameters(CUR_AMT, [USDG, t.minOut]),
    ];
  } else {
    const fee = buyFee(t.amountIn);
    actions = BUY_ACTIONS;
    params = [
      swap,
      encodeAbiParameters(CUR_AMT_BOOL, [USDG, t.amountIn + fee, true]),
      encodeAbiParameters(CUR_ADDR_AMT, [USDG, t.payTo, fee]),
      encodeAbiParameters(CUR_AMT, [t.stock.address, t.minOut]),
    ];
  }
  const input = encodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], [actions, params]);
  return {
    to: UNIVERSAL_ROUTER,
    data: encodeFunctionData({ abi: ROUTER_ABI, functionName: "execute", args: [V4_SWAP, [input], BigInt(t.deadline)] }),
  };
}

export type DecodedTrade = { side: Side; stock: Stock; tag: Hex; amountIn: bigint; feeTo: string; buyFee: bigint | null };

/** Reads a beeper.trade swap back out of router calldata, or null if it is anything else. */
export function decodeTrade(data: Hex): DecodedTrade | null {
  try {
    const { args } = decodeFunctionData({ abi: ROUTER_ABI, data });
    if (args[0] !== V4_SWAP || args[1].length !== 1) return null;
    const [actions, params] = decodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], args[1][0]);
    const side: Side | null = actions === SELL_ACTIONS ? "sell" : actions === BUY_ACTIONS ? "buy" : null;
    if (!side || params.length !== 4) return null;

    const [[key, zeroForOne, amountIn, , , tag]] = decodeAbiParameters(SWAP, params[0]);
    const [c0, c1, , , hooks] = key;
    if (BigInt(hooks) !== BigInt(0) || tag.length !== 66) return null;
    const usdg = getAddress(USDG);
    const other = getAddress(c0) === usdg ? getAddress(c1) : getAddress(c1) === usdg ? getAddress(c0) : null;
    const stock = STOCKS.find((s) => getAddress(s.address) === other);
    if (!stock) return null;
    const stockIn = getAddress(c0) !== usdg; // stock is currency0
    if (zeroForOne !== (side === "sell" ? stockIn : !stockIn)) return null;

    if (side === "sell") {
      const [cur, feeTo, bips] = decodeAbiParameters(CUR_ADDR_AMT, params[2]);
      if (getAddress(cur) !== usdg || bips !== BigInt(TRADE_FEE_BPS)) return null;
      return { side, stock, tag, amountIn, feeTo: getAddress(feeTo), buyFee: null };
    }
    const [scur, settleAmt, payerIsUser] = decodeAbiParameters(CUR_AMT_BOOL, params[1]);
    const [tcur, feeTo, fee] = decodeAbiParameters(CUR_ADDR_AMT, params[2]);
    if (getAddress(scur) !== usdg || getAddress(tcur) !== usdg || !payerIsUser) return null;
    if (fee !== buyFee(amountIn) || settleAmt !== amountIn + fee) return null;
    return { side, stock, tag, amountIn, feeTo: getAddress(feeTo), buyFee: fee };
  } catch {
    return null;
  }
}
