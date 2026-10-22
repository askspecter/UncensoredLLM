import { NextResponse } from "next/server";
import { MAX_PURCHASE, MIN_PURCHASE, quote } from "@/lib/data";

export function GET(req: Request) {
  const credit = Number(new URL(req.url).searchParams.get("credit"));
  if (!Number.isFinite(credit) || credit < MIN_PURCHASE || credit > MAX_PURCHASE) {
    return NextResponse.json({ error: `credit must be between ${MIN_PURCHASE} and ${MAX_PURCHASE}` }, { status: 400 });
  }
  return NextResponse.json(quote(credit));
}
