import { NextResponse } from "next/server";
import { db, newId } from "@/lib/store";

const SOURCES = ["openrouter", "together", "fireworks", "deepinfra", "groq", "other"];

export function GET() {
  return NextResponse.json(db.listings.map(({ payout: _p, ...l }) => l));
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  const credit = Number(b?.credit);
  const discount = Number(b?.discount);
  const source = String(b?.source ?? "");
  const payout = String(b?.payout ?? "").trim();
  if (!SOURCES.includes(source)) return NextResponse.json({ error: "Unknown credit source" }, { status: 400 });
  if (!Number.isFinite(credit) || credit < 50) return NextResponse.json({ error: "Minimum listing is $50" }, { status: 400 });
  if (!Number.isFinite(discount) || discount < 0.05 || discount > 0.7) return NextResponse.json({ error: "Discount must be 5–70%" }, { status: 400 });
  if (payout.length < 10) return NextResponse.json({ error: "Enter a valid payout address" }, { status: 400 });

  const listing = { id: newId("lst"), source, credit, discount, payout, status: "pending_verification" as const, createdAt: Date.now() };
  db.listings.push(listing);
  return NextResponse.json({ id: listing.id, status: listing.status }, { status: 201 });
}
