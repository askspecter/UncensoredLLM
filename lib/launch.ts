// Beeper launchpad (contracts/src/launch): Pons V2 coins paired with USDG whose creator fees become AI credit for
// their holders. Shared by the pages (launch, trade, admin deploy) and the server (indexing, payouts).
import { concat, encodeAbiParameters, getAddress, keccak256, parseAbi, type Hex } from "viem";
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

/** Most creators keep tax low; Pons caps it, the form caps it at 5%. */
export const MAX_CREATOR_TAX_BPS = 500;

type Bytecode = { router: Hex; launcher: Hex };

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
