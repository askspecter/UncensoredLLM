// BeeperHook deployment, shared by the admin page (builds and signs the transactions) and the server (verifies them).
import { concat, encodeAbiParameters, encodeFunctionData, getAddress, keccak256, maxUint160, maxUint256, numberToHex, parseAbi, type Hex } from "viem";
import { USDG } from "./chain";
import { BEEP } from "./token";
import { fullRangeLiquidity, sqrtPriceFromAmounts } from "./hook-sim";
import artifact from "./beeper-hook-bytecode.json";

/** The only wallet that may deploy and create the pool, and the vault that receives USDG fees for bCREDIT. */
export const HOOK_ADMIN = getAddress(process.env.NEXT_PUBLIC_HOOK_ADMIN || "0x4D08af32D60a90Eb5DE76438700F0D9A73D260d4");
export const HOOK_VAULT = getAddress(process.env.NEXT_PUBLIC_HOOK_VAULT || "0x4D08af32D60a90Eb5DE76438700F0D9A73D260d4");

// Uniswap v4 on Robinhood Chain (4663), https://developers.uniswap.org/docs/protocols/v4/deployments
export const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951" as const;
export const POSITION_MANAGER = "0x58daec3116aae6D93017bAAea7749052E8a04fA7" as const;
export const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;
export const CREATE2_DEPLOYER = "0x4e59b44847b379578588920cA78FbF26c0B4956C" as const;

const SPACING = 200;
const MIN_TICK = -887200, MAX_TICK = 887200;
// beforeInitialize | afterSwap | afterSwapReturnDelta, encoded in the hook address's low 14 bits.
const FLAGS = (1 << 13) | (1 << 6) | (1 << 2);
const FLAG_MASK = (1 << 14) - 1;

export const HOOK_ABI = parseAbi([
  "function vault() view returns (address)",
  "function initializer() view returns (address)",
  "function poolManager() view returns (address)",
  "function launchedAt() view returns (uint256)",
  "function poolId() view returns (bytes32)",
  "function feeBps() view returns (uint256)",
  "function baseFeeBps() view returns (uint256)",
  "function launchFeeBps() view returns (uint256)",
  "function launchWindow() view returns (uint256)",
  "function maxSwapUsdg() view returns (uint256)",
]);
const PM_ABI = parseAbi(["function initialize((address,address,uint24,int24,address) key, uint160 sqrtPriceX96) returns (int24)"]);
const PERMIT2_ABI = parseAbi([
  "function approve(address token, address spender, uint160 amount, uint48 expiration)",
  "function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)",
]);
const POSM_ABI = parseAbi(["function modifyLiquidities(bytes unlockData, uint256 deadline) payable"]);
const ERC20_ABI = parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]);

export type HookParams = {
  baseFeeBps: number; launchFeeBps: number; launchWindow: number; maxSwapUsdg: bigint; lpFee: number;
  beepAmount: bigint; usdgAmount: bigint; // seed liquidity, 18 and 6 decimals; their ratio sets the start price
};
export type Step = { id: string; label: string; to: `0x${string}`; data: Hex };

export function initCode(p: HookParams): Hex {
  const args = encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "address" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "address" }],
    [POOL_MANAGER, BEEP.address, USDG, HOOK_VAULT, BigInt(p.baseFeeBps), BigInt(p.launchFeeBps), BigInt(p.launchWindow), p.maxSwapUsdg, HOOK_ADMIN],
  );
  return concat([artifact.bytecode as Hex, args]);
}

/** Finds a CREATE2 salt whose hook address carries the permission flags (about 16k tries on average). */
export function mineSalt(code: Hex, start = 0): { salt: Hex; hook: `0x${string}` } {
  const codeHash = keccak256(code);
  for (let i = start; i < start + 2_000_000; i++) {
    const salt = numberToHex(i, { size: 32 });
    const addr = `0x${keccak256(concat(["0xff", CREATE2_DEPLOYER, salt, codeHash])).slice(26)}` as const;
    if ((parseInt(addr.slice(-4), 16) & FLAG_MASK) === FLAGS) return { salt, hook: getAddress(addr) };
  }
  throw new Error("No salt found");
}

export function poolKey(hook: `0x${string}`, lpFee: number) {
  // currency0 must be the lower address: BEEP (0x3163…) < USDG (0x5fc5…)
  return [BEEP.address, USDG, lpFee, SPACING, hook] as const;
}

/** Every transaction the admin wallet signs, in order. */
export function deploySteps(p: HookParams, salt: Hex, hook: `0x${string}`, deadline: bigint): Step[] {
  const key = poolKey(hook, p.lpFee);
  const sqrtPrice = sqrtPriceFromAmounts(p.beepAmount, p.usdgAmount);
  const liquidity = fullRangeLiquidity(sqrtPrice, p.beepAmount, p.usdgAmount);
  const mint = encodeAbiParameters(
    [{ type: "tuple", components: [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }] },
      { type: "int24" }, { type: "int24" }, { type: "uint256" }, { type: "uint128" }, { type: "uint128" }, { type: "address" }, { type: "bytes" }],
    [key, MIN_TICK, MAX_TICK, liquidity, p.beepAmount + BigInt(1), p.usdgAmount + BigInt(1), HOOK_ADMIN, "0x"],
  );
  const settle = encodeAbiParameters([{ type: "address" }, { type: "address" }], [key[0], key[1]]);
  const unlockData = encodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], ["0x020d", [mint, settle]]);
  const expiry = Number(deadline) + 86_400;
  return [
    { id: "deploy", label: "Deploy BeeperHook", to: CREATE2_DEPLOYER, data: concat([salt, initCode(p)]) },
    { id: "init", label: "Create the $BEEP / USDG pool", to: POOL_MANAGER, data: encodeFunctionData({ abi: PM_ABI, functionName: "initialize", args: [key, sqrtPrice] }) },
    { id: "approve-beep", label: "Approve $BEEP for Permit2", to: BEEP.address, data: encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [PERMIT2, maxUint256] }) },
    { id: "approve-usdg", label: "Approve USDG for Permit2", to: USDG, data: encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [PERMIT2, maxUint256] }) },
    { id: "permit-beep", label: "Let Uniswap use $BEEP", to: PERMIT2, data: encodeFunctionData({ abi: PERMIT2_ABI, functionName: "approve", args: [BEEP.address, POSITION_MANAGER, maxUint160, expiry] }) },
    { id: "permit-usdg", label: "Let Uniswap use USDG", to: PERMIT2, data: encodeFunctionData({ abi: PERMIT2_ABI, functionName: "approve", args: [USDG, POSITION_MANAGER, maxUint160, expiry] }) },
    { id: "liquidity", label: "Add full-range liquidity", to: POSITION_MANAGER, data: encodeFunctionData({ abi: POSM_ABI, functionName: "modifyLiquidities", args: [unlockData, deadline] }) },
  ];
}
