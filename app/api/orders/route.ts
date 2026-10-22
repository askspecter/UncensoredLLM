import { NextResponse } from "next/server";
import { MAX_PURCHASE, MIN_PURCHASE, quote } from "@/lib/data";
import { db, hashKey, newApiKey, newId } from "@/lib/store";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const credit = Number(body?.credit);
  const payment = body?.payment === "card" ? "card" : "crypto";
  if (!Number.isFinite(credit) || credit < MIN_PURCHASE || credit > MAX_PURCHASE) {
    return NextResponse.json({ error: `Amount must be between $${MIN_PURCHASE} and $${MAX_PURCHASE}` }, { status: 400 });
  }
  // TODO: create a payment intent (e.g. BTCPay Server / NOWPayments / Stripe) and only issue the key on confirmation.
  const q = quote(credit);
  const apiKey = newApiKey();
  const order = { id: newId("ord"), keyHash: hashKey(apiKey), credit, total: q.total, payment, createdAt: Date.now() };
  db.orders.push(order);
  return NextResponse.json({ id: order.id, apiKey, credit, total: q.total }, { status: 201 });
}
