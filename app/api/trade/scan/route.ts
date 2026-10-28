import { NextResponse } from "next/server";
import { hookScan } from "@/lib/trade-server";

export const maxDuration = 60;

/** GET ?symbol=NVDA → every NVDA/USDG pool with its declared fee, real cost and hidden fee. */
export async function GET(req: Request) {
  try {
    const scan = await hookScan(new URL(req.url).searchParams.get("symbol") ?? "");
    if (!scan) return NextResponse.json({ error: "Unknown stock" }, { status: 404 });
    return NextResponse.json(scan, { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=600" } });
  } catch (e) {
    console.error("[trade/scan]", e);
    return NextResponse.json({ error: "Network busy, try again" }, { status: 503 });
  }
}
