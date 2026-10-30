import { NextResponse } from "next/server";
import { syncThrottled } from "@/lib/launch-server";

export const maxDuration = 60;

/** Anyone may nudge the indexer, e.g. right after a launch or a harvest from the page. */
export async function POST() {
  try {
    return NextResponse.json(await syncThrottled());
  } catch (e) {
    console.error("[launch/sync]", e);
    return NextResponse.json({ error: "Network busy, try again" }, { status: 503 });
  }
}
