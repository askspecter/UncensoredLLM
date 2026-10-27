// Orbio (orbio.so) on Robinhood Chain: an on-chain order book of discounted inference CREDIT.
// Shared by the server (upstream routing) and the admin page (restocking from the book).
import { parseAbi } from "viem";

export const ORBIO_EXCHANGE = "0x6951ffd32630b05e06f50062aea801625a58ebc0" as const;
export const ORBIO_CREDIT = "0xe33322da1380e61e5ae5dfb21e7f62924c73004c" as const;
export const ORBIO_MAX_FILLS = BigInt(64);
/** The message whose signature is the account's Orbio API key (https://www.orbio.so/protocol/agents.md). */
export const orbioKeyMessage = (epoch: number) => `Orbio API key · chain 4663 · epoch ${epoch}`;

export const ORBIO_EXCHANGE_ABI = parseAbi([
  "function getActivationQuote(uint256 usdgIn, uint256 maxFills) view returns ((uint256 creditOut, uint256 usdgSpent, uint256 feeAtoms, uint256 fills, uint8 reason) quote, uint256 credited, uint256 fee)",
  "function buyAndActivate(uint256 usdgIn, uint256 minCreditOut, bytes32 beneficiary, uint256 maxFills) returns (uint256, uint256, uint256)",
]);

/** bytes32 form of an address, as buyAndActivate expects for the beneficiary. */
export const beneficiaryOf = (address: string) => `0x${address.slice(2).toLowerCase().padStart(64, "0")}` as `0x${string}`;
