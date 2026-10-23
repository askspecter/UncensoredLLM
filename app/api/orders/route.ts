import { NextResponse } from "next/server";
import { MAX_PURCHASE, MIN_PURCHASE, quote } from "@/lib/data";
import { requireUser } from "@/lib/auth";
import { sql, toMicros, fromMicros } from "@/lib/db";
import { settleOrder } from "@/lib/billing";
import { createApiKey, newId } from "@/lib/keys";
import { createInvoice, nowpaymentsEnabled } from "@/lib/nowpayments";

// Until a payment provider is connected, PAYMENTS_MODE=test settles orders instantly (for testing only).
const TEST_PAYMENTS = process.env.PAYMENTS_MODE === "test";

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const { userId } = auth;

  if (!TEST_PAYMENTS && !nowpaymentsEnabled) {
    return NextResponse.json({ error: "Payments are not configured yet" }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const credit = Number(body?.credit);
  if (body?.payment === "card") return NextResponse.json({ error: "Card payments are coming soon — pay with crypto" }, { status: 400 });
  const method = "crypto";
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
    const siteUrl = process.env.SITE_URL?.replace(/\/$/, "") ?? new URL(req.url).origin;
    try {
      const inv = await createInvoice({ orderId: id, usd: q.total, description: `Beeper credit $${credit}`, siteUrl });
      await sql`UPDATE orders SET provider_ref = ${`np-inv:${inv.id}`}, checkout_url = ${inv.invoice_url} WHERE id = ${id}`;
      return NextResponse.json({ id, status: "pending", credit, total: q.total, checkoutUrl: inv.invoice_url }, { status: 201 });
    } catch (e) {
      console.error("[orders] invoice failed", e);
      await sql`UPDATE orders SET status = 'failed' WHERE id = ${id}`;
      return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 502 });
    }
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
