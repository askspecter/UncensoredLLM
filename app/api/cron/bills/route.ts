import { NextResponse } from "next/server";
import { anchorDay } from "@/lib/bills";

export const maxDuration = 300;

/** Daily job (Vercel Cron): commits the previous UTC day's bill receipts on chain. Optional ?day=YYYY-MM-DD. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("day");
  const day = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  if (day >= new Date().toISOString().slice(0, 10)) return NextResponse.json({ error: "Can only anchor completed days" }, { status: 400 });
  return NextResponse.json(await anchorDay(day));
}
