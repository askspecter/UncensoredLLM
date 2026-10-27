import { NextResponse } from "next/server";
import { createPublicClient, http, isAddress, type Address } from "viem";
import { requireUser } from "@/lib/auth";
import { robinhood } from "@/lib/chain";
import { ERC20_ABI, PERMIT2, PERMIT2_ABI, QUOTER_ABI, STOCKS, UNIVERSAL_ROUTER, V4_QUOTER, poolKey, withSlippage } from "@/lib/stocks";

const client = createPublicClient({ chain: robinhood, transport: http(process.env.ROBINHOOD_RPC_URL || undefined) });
const MAX_UNITS = BigInt(20_000) * BigInt(1_000_000);

/** The stock tokens a wallet holds, what each would cost to pay `units` USDG right now, and which approvals are missing. */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const url = new URL(req.url);
  const owner = url.searchParams.get("address") ?? "";
  const units = BigInt(/^\d{1,12}$/.test(url.searchParams.get("units") ?? "") ? url.searchParams.get("units")! : "0");
  if (!isAddress(owner) || units <= BigInt(0) || units > MAX_UNITS) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  try {
    const balances = await client.multicall({
      contracts: STOCKS.map((s) => ({ address: s.address, abi: ERC20_ABI, functionName: "balanceOf" as const, args: [owner as Address] })),
      allowFailure: true,
    });
    const held = STOCKS.map((s, i) => ({ s, balance: balances[i].status === "success" ? (balances[i].result as bigint) : BigInt(0) }))
      .filter((h) => h.balance > BigInt(0));

    const stocks = await Promise.all(held.map(async ({ s, balance }) => {
      // Best of this stock's pools for an exact USDG output.
      let best: { pool: [number, number]; amountIn: bigint } | null = null;
      await Promise.all(s.pools.map(async (pool) => {
        const { key, stockIn } = poolKey(s, pool);
        try {
          const { result } = await client.simulateContract({
            address: V4_QUOTER, abi: QUOTER_ABI, functionName: "quoteExactOutputSingle",
            args: [{ poolKey: key, zeroForOne: stockIn, exactAmount: units, hookData: "0x" }],
          });
          if (!best || result[0] < best.amountIn) best = { pool, amountIn: result[0] };
        } catch { /* pool too shallow for this size */ }
      }));
      const [erc, p2] = await Promise.all([
        client.readContract({ address: s.address, abi: ERC20_ABI, functionName: "allowance", args: [owner as Address, PERMIT2] }),
        client.readContract({ address: PERMIT2, abi: PERMIT2_ABI, functionName: "allowance", args: [owner as Address, s.address, UNIVERSAL_ROUTER] }),
      ]);
      const q = best as { pool: [number, number]; amountIn: bigint } | null;
      const maxIn = q ? withSlippage(q.amountIn) : null;
      const now = Math.floor(Date.now() / 1000);
      return {
        symbol: s.symbol, name: s.name, address: s.address, balance: balance.toString(),
        // USD value of the whole holding at this quote's price.
        valueUsd: q ? Number((units * balance) / q.amountIn) / 1e6 : null,
        quote: q && maxIn ? { pool: q.pool, amountIn: q.amountIn.toString(), maxIn: maxIn.toString(), enough: balance >= maxIn } : null,
        needs: {
          permit2: maxIn ? erc < maxIn : true,
          router: maxIn ? p2[0] < maxIn || p2[1] < now + 600 : true,
        },
      };
    }));
    stocks.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));
    return NextResponse.json({ stocks, supported: STOCKS.map((s) => s.symbol) });
  } catch (e) {
    console.error("[stocks] rpc error", e);
    return NextResponse.json({ error: "Network busy, try again" }, { status: 503 });
  }
}
