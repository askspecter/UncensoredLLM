// Robinhood Chain (Arbitrum Orbit L2) + USDG. Shared by client and server.
import { defineChain } from "viem";

export const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
});

// Paxos Global Dollar on Robinhood Chain (6 decimals), https://docs.paxos.com/guides/stablecoin/usdg/mainnet
export const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as const;
export const USDG_DECIMALS = 6;

/** Treasury wallet that receives USDG payments. */
export const PAY_TO = process.env.NEXT_PUBLIC_PAYMENT_ADDRESS as `0x${string}` | undefined;

export const explorerTx = (hash: string) => `${robinhood.blockExplorers.default.url}/tx/${hash}`;

/** 52501234 -> "52.501234" */
export function formatUsdg(units: string | bigint) {
  const s = BigInt(units).toString().padStart(USDG_DECIMALS + 1, "0");
  return `${s.slice(0, -USDG_DECIMALS)}.${s.slice(-USDG_DECIMALS)}`;
}
