// Beeper launchpad (contracts/src/launch): coins paired with USDG whose fees become AI credit for their holders.
// Two launchers: the original one on Pons V2 curves, and BeeperCurveLauncher on Beeper's own curve with anti sniper
// protection and Uniswap v4 graduation. Shared by the pages (launch, trade, admin deploy) and the server.
import { concat, encodeAbiParameters, encodeFunctionData, getAddress, keccak256, parseAbi, type Hex } from "viem";
import { USDG } from "./chain";

export const PONS_FACTORY = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e" as const;
export const PONS_ESCROW = "0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e" as const;
const CREATE2_DEPLOYER = "0x4e59b44847b379578588920cA78FbF26c0B4956C" as const;
/** Signs the two deploy transactions (same admin wallet as BeeperHook). */
export const LAUNCH_ADMIN = getAddress(process.env.NEXT_PUBLIC_HOOK_ADMIN || "0x4D08af32D60a90Eb5DE76438700F0D9A73D260d4");
/** Receives the holders' 80% in USDG; Beeper pays it out as credit. */
export const CREDIT_SINK = getAddress(process.env.NEXT_PUBLIC_LAUNCH_CREDIT_SINK || "0x4D08af32D60a90Eb5DE76438700F0D9A73D260d4");
/** Receives the protocol's 20%. */
export const LAUNCH_TREASURY = getAddress(process.env.NEXT_PUBLIC_LAUNCH_TREASURY || "0x4D08af32D60a90Eb5DE76438700F0D9A73D260d4");
export const CREDIT_BPS = 8_000;
const SALT = keccak256(new TextEncoder().encode("beeper-launchpad-v1"));
const CURVE_SALT = keccak256(new TextEncoder().encode("beeper-curve-v1"));
export const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951" as const;

export const LAUNCHER_ABI = parseAbi([
  "struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }",
  "struct LaunchParams { string name; string symbol; string logo; string description; Socials socials; uint16 creatorTaxBps; uint256 launchConfigId; bytes32 expectedEconomics; bytes32 salt; string model; }",
  "function launch(LaunchParams p) payable returns (uint256 id)",
  "function launchCount() view returns (uint256)",
  "event Launched(uint256 indexed id, address indexed creator, address indexed token, address curve, address router, string model)",
]);
export const ROUTER_ABI = parseAbi([
  "function harvest()",
  "function pending() view returns (uint256)",
  "event Harvested(uint256 toCredit, uint256 toTreasury)",
]);
export const PONS_ABI = parseAbi([
  "function launchFee() view returns (uint256)",
  "function previewLaunchEconomics(uint256 launchConfigId, address pairToken) view returns (bytes32)",
]);
export const CURVE_ABI = parseAbi([
  "function buy(uint256 quoteIn, uint256 minTokensOut, address recipient) returns (uint256 tokensOut)",
  "function sell(uint256 tokensIn, uint256 minQuoteOut, address recipient) returns (uint256 quoteOut)",
]);
export const CURVE_LAUNCHER_ABI = parseAbi([
  "struct LaunchParams { string name; string symbol; string logo; string description; string twitter; string telegram; string website; string model; uint16 feeBps; uint32 protectFor; uint16 sniperStartBps; uint16 maxWalletBps; uint256 creatorBuy; uint256 minCreatorTokens; }",
  "function launch(LaunchParams p) returns (uint256 id)",
  "function guard() view returns (address)",
  "function deployGuard(bytes32 salt) returns (address)",
  "event Launched(uint256 indexed id, address indexed creator, address indexed token, address curve, address router, string model)",
]);
/** Beeper's own curve: Pons compatible buy/sell plus protection and graduation state. */
export const BEEPER_CURVE_ABI = parseAbi([
  "function buy(uint256 quoteIn, uint256 minTokensOut, address recipient) returns (uint256 tokensOut)",
  "function sell(uint256 tokensIn, uint256 minQuoteOut, address recipient) returns (uint256 quoteOut)",
  "function protectionActive() view returns (bool)",
  "function protectUntil() view returns (uint64)",
  "function sniperFeeBps() view returns (uint256)",
  "function maxWallet() view returns (uint256)",
  "function feeBps() view returns (uint16)",
  "function tokensSold() view returns (uint256)",
  "function complete() view returns (bool)",
  "function graduated() view returns (bool)",
  "function graduate()",
]);
export const CURVE_SUPPLY = BigInt("793100000000000000000000000"); // 793.1M coins sell on the curve
/** Launch ids from the curve launcher are stored above this, so both launchers share launch_coins. */
export const CURVE_ID_OFFSET = 1_000_000;

/** Most creators keep tax low; Pons caps it, the form caps it at 5%. */
export const MAX_CREATOR_TAX_BPS = 500;

type Bytecode = { router: Hex; launcher: Hex; curve?: Hex; curveLauncher?: Hex; guard?: Hex };

export function routerInitCode(code: Bytecode): Hex {
  const args = encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "address" }, { type: "address" }],
    [PONS_ESCROW, USDG, CREDIT_SINK, LAUNCH_TREASURY],
  );
  return concat([code.router, args]);
}
export function launcherInitCode(code: Bytecode, router: `0x${string}`): Hex {
  return concat([code.launcher, encodeAbiParameters([{ type: "address" }, { type: "address" }], [PONS_FACTORY, router])]);
}
const create2 = (init: Hex) => getAddress(`0x${keccak256(concat(["0xff", CREATE2_DEPLOYER, SALT, keccak256(init)])).slice(26)}`);

/** Deterministic addresses and the two deploy transactions (CREATE2, so anyone can check them before signing). */
export function deployPlan(code: Bytecode) {
  const rInit = routerInitCode(code);
  const router = create2(rInit);
  const lInit = launcherInitCode(code, router);
  const launcher = create2(lInit);
  return {
    router, launcher,
    steps: [
      { id: "router", label: "Deploy CreditRouter (implementation)", to: CREATE2_DEPLOYER, data: concat([SALT, rInit]) },
      { id: "launcher", label: "Deploy BeeperLauncher", to: CREATE2_DEPLOYER, data: concat([SALT, lInit]) },
    ] as { id: string; label: string; to: `0x${string}`; data: Hex }[],
  };
}

const GUARD_SALT = 0x7bc3;
const create2From = (deployer: `0x${string}`, salt: Hex, init: Hex) =>
  getAddress(`0x${keccak256(concat(["0xff", deployer, salt, keccak256(init)])).slice(26)}`);

/**
 * Beeper curve launchpad: curve implementation, launcher (reusing the CreditRouter implementation above) and the
 * GraduationGuard hook, whose salt is mined so it lands on an address with only the beforeInitialize flag.
 */
export function curvePlan(code: Bytecode) {
  if (!code.curve || !code.curveLauncher || !code.guard) throw new Error("curve bytecode missing: run scripts/export-launch-artifacts.mjs");
  const router = create2(routerInitCode(code));
  const curveInit = concat([code.curve, encodeAbiParameters([{ type: "address" }, { type: "address" }], [POOL_MANAGER, USDG])]);
  const curveImpl = create2From(CREATE2_DEPLOYER, CURVE_SALT, curveInit);
  const launcherInit = concat([code.curveLauncher, encodeAbiParameters([{ type: "address" }, { type: "address" }], [curveImpl, router])]);
  const launcher = create2From(CREATE2_DEPLOYER, CURVE_SALT, launcherInit);
  const guardInit = concat([code.guard, encodeAbiParameters([{ type: "address" }], [launcher])]);
  // Mined once (about 30k tries); rerun the search in this file's history if the bytecode ever changes.
  const guardSalt: Hex = `0x${GUARD_SALT.toString(16).padStart(64, "0")}`;
  const guard = create2From(launcher, guardSalt, guardInit);
  if ((BigInt(guard) & BigInt(0x3fff)) !== BigInt(1 << 13)) throw new Error("guard salt no longer matches the bytecode");
  return {
    router, curveImpl, launcher, guard,
    steps: [
      { id: "curve", label: "Deploy BeeperCurve (implementation)", to: CREATE2_DEPLOYER, data: concat([CURVE_SALT, curveInit]), address: curveImpl },
      { id: "curveLauncher", label: "Deploy BeeperCurveLauncher", to: CREATE2_DEPLOYER, data: concat([CURVE_SALT, launcherInit]), address: launcher },
      { id: "guard", label: "Deploy GraduationGuard hook", to: launcher, data: encodeFunctionData({ abi: CURVE_LAUNCHER_ABI, functionName: "deployGuard", args: [guardSalt] }), address: guard },
    ] as { id: string; label: string; to: `0x${string}`; data: Hex; address: `0x${string}` }[],
  };
}
