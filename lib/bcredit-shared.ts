import { getAddress } from "viem";

/** Message a holder signs to prove they control a wallet. Shared by the page and the API. */
export const linkMessage = (userId: string, address: string, ts: number) =>
  `Link this wallet to my Beeper account to earn bCREDIT.\n\nAccount: ${userId}\nWallet: ${getAddress(address)}\nTime: ${ts}`;
