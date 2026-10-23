import { NextResponse } from "next/server";
import { dbEnabled } from "@/lib/db";
import { bookSummary, expireStale } from "@/lib/market";

export async function GET() {
  if (!dbEnabled) return NextResponse.json({ house: 0, bands: [] });
  await expireStale();
  return NextResponse.json(await bookSummary(), { headers: { "cache-control": "public, max-age=10" } });
}
