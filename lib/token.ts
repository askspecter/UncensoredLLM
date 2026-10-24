// Official $BEEP token on Robinhood Chain.
import { createPublicClient, erc20Abi, http } from "viem";
import { robinhood } from "./chain";

export const BEEP = {
  address: "0x316353b8ab5f1375e59c793d5903dadecf0f817e" as const,
  symbol: "BEEP",
  name: "Beeper",
  decimals: 18,
  explorer: "https://robinhoodchain.blockscout.com/token/0x316353b8ab5f1375e59c793d5903dadecf0f817e",
};

const DEAD = "0x000000000000000000000000000000000000dEaD" as const;
const client = createPublicClient({ chain: robinhood, transport: http(process.env.ROBINHOOD_RPC_URL || undefined) });

/** Total supply and amount held by the burn address, in whole tokens. */
export async function beepStats() {
  try {
    const [supply, burned] = await Promise.all([
      client.readContract({ address: BEEP.address, abi: erc20Abi, functionName: "totalSupply" }),
      client.readContract({ address: BEEP.address, abi: erc20Abi, functionName: "balanceOf", args: [DEAD] }),
    ]);
    const whole = (v: bigint) => Number(v / BigInt(10) ** BigInt(BEEP.decimals));
    return { supply: whole(supply), burned: whole(burned) };
  } catch {
    return null;
  }
}
