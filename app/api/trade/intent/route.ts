import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createIntent, tradeEnabled } from "@/lib/trade-server";

/** A fresh id for the next swap; it goes into the swap's hookData so its cashback lands on this account. */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  if (!tradeEnabled) return NextResponse.json({ error: "Trading is not configured yet" }, { status: 503 });
  return NextResponse.json({ id: await createIntent(auth.userId) });
}
