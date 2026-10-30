import { NextResponse } from "next/server";
import { anchorDay } from "@/lib/bills";
import { harvestAll, syncLaunchpad } from "@/lib/launch-server";

export const maxDuration = 300;

/** Daily job (Vercel Cron): commits the previous UTC day's bill receipts on chain, then runs the launchpad keeper. Optional ?day=YYYY-MM-DD. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("day");
  const day = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  if (day >= new Date().toISOString().slice(0, 10)) return NextResponse.json({ error: "Can only anchor completed days" }, { status: 400 });
  const bills = await anchorDay(day);
  // Same daily slot: harvest every launchpad coin, then pay the harvests to holders.
  const launchpad = await harvestAll().then(async (h) => ({ ...h, sync: await syncLaunchpad() })).catch((e) => ({ error: (e as Error).message }));
  return NextResponse.json({ ...bills, launchpad });
}
