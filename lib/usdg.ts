// Server-side verification of USDG payments on Robinhood Chain.
import { createPublicClient, decodeEventLog, getAddress, http, isAddress, isHash, parseAbiItem, type Hash } from "viem";
import { PAY_TO, USDG, robinhood } from "./chain";

const client = createPublicClient({ chain: robinhood, transport: http(process.env.ROBINHOOD_RPC_URL || undefined) });
const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

export const usdgEnabled = Boolean(PAY_TO && isAddress(PAY_TO));
const treasury = () => getAddress(PAY_TO!);

export const latestBlock = () => client.getBlockNumber();

export type Found = { txHash: Hash; from: string; blockNumber: bigint };

/** Checks that `txHash` is a successful USDG transfer of exactly `units` to the treasury. */
export async function verifyTx(txHash: string, units: bigint): Promise<Found | null> {
  if (!isHash(txHash)) return null;
  const receipt = await client.getTransactionReceipt({ hash: txHash }).catch(() => null);
  if (!receipt || receipt.status !== "success") return null;
  for (const log of receipt.logs) {
    if (getAddress(log.address) !== getAddress(USDG)) continue;
    try {
      const ev = decodeEventLog({ abi: [TRANSFER], data: log.data, topics: log.topics });
      if (getAddress(ev.args.to) === treasury() && ev.args.value === units) {
        return { txHash, from: ev.args.from, blockNumber: receipt.blockNumber };
      }
    } catch { /* not a Transfer */ }
  }
  return null;
}

/** Finds a USDG transfer of exactly `units` to the treasury since `fromBlock`. */
export async function findTransfer(units: bigint, fromBlock: bigint): Promise<Found | null> {
  const logs = await client.getLogs({ address: USDG, event: TRANSFER, args: { to: treasury() }, fromBlock, toBlock: "latest" });
  const hit = logs.find((l) => l.args.value === units && !l.removed);
  return hit ? { txHash: hit.transactionHash, from: hit.args.from!, blockNumber: hit.blockNumber } : null;
}
