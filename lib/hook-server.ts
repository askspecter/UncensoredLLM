// Server side of BeeperHook: which hook is live (set once from the admin page, or env) and on-chain checks.
import { createPublicClient, getAddress, http, isAddress } from "viem";
import { robinhood } from "./chain";
import { dbEnabled, sql } from "./db";
import { HOOK_ABI, HOOK_ADMIN, HOOK_VAULT, POOL_MANAGER } from "./hook";

const client = createPublicClient({ chain: robinhood, transport: http(process.env.ROBINHOOD_RPC_URL || undefined) });

export type LiveHook = { address: `0x${string}`; fromBlock: bigint };

export async function liveHook(): Promise<LiveHook | null> {
  if (dbEnabled) {
    const [row] = await sql<{ value: { address: string; fromBlock: string } }[]>`SELECT value FROM app_settings WHERE key = 'beeper_hook'`;
    if (row) return { address: getAddress(row.value.address), fromBlock: BigInt(row.value.fromBlock) };
  }
  const env = process.env.BEEPER_HOOK;
  return env && isAddress(env) ? { address: getAddress(env), fromBlock: BigInt(process.env.BEEPER_HOOK_FROM_BLOCK || 0) } : null;
}

/** Throws unless `address` is a BeeperHook deployed at `fromBlock` by the admin wallet, paying the official vault, with its pool created. */
export async function verifyHook(address: `0x${string}`, fromBlock: bigint) {
  const [before, after] = await Promise.all([
    client.getCode({ address, blockNumber: fromBlock - BigInt(1) }),
    client.getCode({ address, blockNumber: fromBlock }),
  ]);
  if (!after || after === "0x") throw new Error("No contract at that address in that block");
  if (before && before !== "0x") throw new Error("Contract existed before that block");
  const read = (functionName: "vault" | "initializer" | "poolManager" | "launchedAt") => client.readContract({ address, abi: HOOK_ABI, functionName });
  const [vault, initializer, pm, launchedAt] = await Promise.all([read("vault"), read("initializer"), read("poolManager"), read("launchedAt")]);
  if (getAddress(vault as string) !== HOOK_VAULT) throw new Error("Wrong vault");
  if (getAddress(initializer as string) !== HOOK_ADMIN) throw new Error("Not deployed for the admin wallet");
  if (getAddress(pm as string) !== getAddress(POOL_MANAGER)) throw new Error("Wrong PoolManager");
  if (launchedAt === BigInt(0)) throw new Error("Pool not created yet");
}

/** Live numbers for the /hook page. */
export async function hookState(h: LiveHook) {
  const read = (functionName: "feeBps" | "launchedAt" | "poolId") => client.readContract({ address: h.address, abi: HOOK_ABI, functionName });
  const [feeBps, launchedAt, poolId] = await Promise.all([read("feeBps"), read("launchedAt"), read("poolId")]);
  return { address: h.address, feeBps: Number(feeBps), launchedAt: Number(launchedAt), poolId: poolId as string };
}
