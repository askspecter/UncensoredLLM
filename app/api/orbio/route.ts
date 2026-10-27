import { NextResponse } from "next/server";
import { ORBIO_ACCOUNT, ORBIO_EXCHANGE, ORBIO_EXCHANGE_ABI, ORBIO_MAX_FILLS, orbioBalance, orbioEnabled } from "@/lib/orbio";
import { chainClient } from "@/lib/server-wallet";

export const dynamic = "force-dynamic";

/** Beeper's Orbio supply: whether routing is on, the account and its balance, and what 100 USDG buys on the book now. */
export async function GET() {
  const [balance, quote] = await Promise.all([
    orbioBalance(),
    chainClient.readContract({ address: ORBIO_EXCHANGE, abi: ORBIO_EXCHANGE_ABI, functionName: "getActivationQuote", args: [BigInt(100_000_000), ORBIO_MAX_FILLS] }).catch(() => null),
  ]);
  return NextResponse.json({
    enabled: orbioEnabled, account: ORBIO_ACCOUNT, balance,
    book: quote ? { usdgIn: 100, credited: Number(quote[1]) / 1e6, fills: Number(quote[0].fills) } : null,
  });
}
