import { NextResponse } from "next/server";
import { LAUNCHER, coinsWithStats, launcherState, syncThrottled } from "@/lib/launch-server";

export const maxDuration = 60;

/** Launchpad overview: whether the launcher is live, and every coin with what it has paid its holders. */
export async function GET() {
  try {
    const state = await launcherState();
    if (state) await syncThrottled().catch((e) => console.error("[launch] sync", e));
    const coins = await coinsWithStats();
    return NextResponse.json({
      launcher: LAUNCHER, deployed: Boolean(state),
      coins: coins.map((c) => ({ ...c, paid: Number(c.paid) / 1e6, harvests: Number(c.harvests) })),
    }, { headers: { "cache-control": "public, s-maxage=20, stale-while-revalidate=120" } });
  } catch (e) {
    console.error("[launch]", e);
    return NextResponse.json({ error: "Network busy, try again" }, { status: 503 });
  }
}
