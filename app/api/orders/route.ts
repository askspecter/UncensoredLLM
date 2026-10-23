import { NextResponse } from "next/server";
import { MAX_PURCHASE, MIN_PURCHASE, quote } from "@/lib/data";
import { requireUser } from "@/lib/auth";
import { sql, toMicros, fromMicros } from "@/lib/db";
import { settleOrder } from "@/lib/billing";
import { createApiKey, newId } from "@/lib/keys";

// Until a payment provider is connected, PAYMENTS_MODE=test settles orders instantly (for testing only).
const TEST_PAYMENTS = process.env.PAYMENTS_MODE === "test";

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const { userId } = auth;

  const body = await req.json().catch(() => null);
  const credit = Number(body?.credit);
  const method = body?.payment === "card" ? "card" : "crypto";
  if (!Number.isFinite(credit) || credit < MIN_PURCHASE || credit > MAX_PURCHASE) {
    return NextResponse.json({ error: `Amount must be between $${MIN_PURCHASE} and $${MAX_PURCHASE}` }, { status: 400 });
  }

  const q = quote(credit);
  const id = newId("ord");
  const cents = (n: number) => Math.round(n * 100);
  await sql`
    INSERT INTO orders (id, user_id, credit_micros, subtotal_cents, fee_cents, total_cents, payment_method)
    VALUES (${id}, ${userId}, ${toMicros(credit)}, ${cents(q.subtotal)}, ${cents(q.fee)}, ${cents(q.total)}, ${method})`;

  if (!TEST_PAYMENTS) {
    // TODO(payments): create a checkout with the payment provider and return its URL.
    return NextResponse.json({ id, status: "pending", credit, total: q.total, checkoutUrl: null }, { status: 201 });
  }

  await settleOrder(id, "test");
  const [{ count }] = await sql<{ count: string }[]>`SELECT count(*) FROM api_keys WHERE user_id = ${userId} AND revoked_at IS NULL`;
  const firstKey = Number(count) === 0 ? await createApiKey(userId, "Default") : null;
  const [{ balance_micros }] = await sql<{ balance_micros: string }[]>`SELECT balance_micros FROM users WHERE id = ${userId}`;

  return NextResponse.json({
    id, status: "paid", credit, total: q.total,
    balance: fromMicros(balance_micros),
    apiKey: firstKey?.key ?? null,
  }, { status: 201 });
}
