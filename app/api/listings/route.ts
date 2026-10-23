import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { newId } from "@/lib/keys";

const SOURCES = ["openrouter", "together", "fireworks", "deepinfra", "groq", "other"];

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const rows = await sql`SELECT id, source, credit_cents, discount_bps, status, created_at FROM listings WHERE user_id = ${auth.userId} ORDER BY created_at DESC`;
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const b = await req.json().catch(() => null);
  const credit = Number(b?.credit);
  const discount = Number(b?.discount);
  const source = String(b?.source ?? "");
  const payout = String(b?.payout ?? "").trim();
  if (!SOURCES.includes(source)) return NextResponse.json({ error: "Unknown credit source" }, { status: 400 });
  if (!Number.isFinite(credit) || credit < 50 || credit > 1_000_000) return NextResponse.json({ error: "Listing must be $50 – $1,000,000" }, { status: 400 });
  if (!Number.isFinite(discount) || discount < 0.05 || discount > 0.7) return NextResponse.json({ error: "Discount must be 5–70%" }, { status: 400 });
  if (payout.length < 10 || payout.length > 120) return NextResponse.json({ error: "Enter a valid payout address" }, { status: 400 });

  const id = newId("lst");
  await sql`
    INSERT INTO listings (id, user_id, source, credit_cents, discount_bps, payout)
    VALUES (${id}, ${auth.userId}, ${source}, ${Math.round(credit * 100)}, ${Math.round(discount * 10_000)}, ${payout})`;
  return NextResponse.json({ id, status: "pending_verification" }, { status: 201 });
}
