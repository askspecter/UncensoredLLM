import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { fromMicros, sql } from "@/lib/db";
import { cashbackSummary } from "@/lib/trade-server";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const [{ balance_micros }] = await sql<{ balance_micros: string }[]>`SELECT balance_micros FROM users WHERE id = ${auth.userId}`;
  return NextResponse.json({ balance: fromMicros(balance_micros), ...(await cashbackSummary(auth.userId)) });
}
