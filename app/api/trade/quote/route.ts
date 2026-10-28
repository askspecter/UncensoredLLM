import { NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { USDG } from "@/lib/chain";
import { stockBySymbol } from "@/lib/stocks";
import { approvalsNeeded, quoteTrade, usdgLimit } from "@/lib/trade-server";

/** GET ?symbol=NVDA&side=sell|buy&amount=<input units>[&address=0x…] → best route, output after fee, cashback, approvals. */
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const stock = stockBySymbol(u.get("symbol") ?? "");
  const side = u.get("side") === "buy" ? "buy" : u.get("side") === "sell" ? "sell" : null;
  const raw = u.get("amount") ?? "";
  if (!stock || !side || !/^\d{1,30}$/.test(raw) || BigInt(raw) <= BigInt(0)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const amountIn = BigInt(raw);
  try {
    const q = await quoteTrade(stock, side, amountIn);
    if (!q) return NextResponse.json({ error: "No honest pool can fill that size" }, { status: 404 });
    if (!usdgLimit(side, amountIn, q.out)) return NextResponse.json({ error: "Max $50,000 per swap" }, { status: 400 });
    const owner = u.get("address");
    const token = (side === "sell" ? stock.address : USDG) as Address;
    const needs = owner && isAddress(owner) ? await approvalsNeeded(owner, token, q.spend) : null;
    return NextResponse.json({
      symbol: stock.symbol, side, amountIn: raw, pool: q.pool,
      out: q.out.toString(), minOut: q.minOut.toString(), fee: q.fee.toString(), spend: q.spend.toString(),
      needs: needs && { permit2: needs.permit2, router: needs.router, enough: needs.balance >= q.spend, balance: needs.balance.toString() },
    });
  } catch (e) {
    console.error("[trade/quote]", e);
    return NextResponse.json({ error: "Network busy, try again" }, { status: 503 });
  }
}
