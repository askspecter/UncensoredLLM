import { NextResponse } from "next/server";
import { MAX_PURCHASE, MIN_PURCHASE } from "@/lib/data";
import { dbEnabled } from "@/lib/db";
import { expireStale, quoteBook } from "@/lib/market";
import { verifyRequest } from "@/lib/auth";

export async function GET(req: Request) {
  const credit = Number(new URL(req.url).searchParams.get("credit"));
  if (!Number.isFinite(credit) || credit < MIN_PURCHASE || credit > MAX_PURCHASE) {
    return NextResponse.json({ error: `credit must be between ${MIN_PURCHASE} and ${MAX_PURCHASE}` }, { status: 400 });
  }
  if (!dbEnabled) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  await expireStale();
  // Signed-in buyers never fill against their own offers.
  return NextResponse.json(await quoteBook(credit, await verifyRequest(req)));
}
