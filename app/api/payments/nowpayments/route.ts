import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { settleOrder } from "@/lib/billing";
import { FAILED_STATUSES, PAID_STATUSES, getPayment, verifyIpn, type Payment } from "@/lib/nowpayments";

// IPN webhook. NOWPayments retries until it gets a 2xx, so every branch must be idempotent.
export async function POST(req: Request) {
  const raw = await req.text();
  let body: Payment;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  if (!verifyIpn(body, req.headers.get("x-nowpayments-sig"))) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  const orderId = body.order_id;
  if (!orderId) return NextResponse.json({ ok: true, ignored: "no order_id" });
  const [order] = await sql<{ status: string; total_cents: number }[]>`SELECT status, total_cents FROM orders WHERE id = ${orderId}`;
  if (!order) return NextResponse.json({ ok: true, ignored: "unknown order" });

  if (PAID_STATUSES.has(body.payment_status)) {
    // Re-read the payment from the API rather than trusting the callback body alone.
    const p = await getPayment(body.payment_id);
    const priceOk = p.order_id === orderId && p.price_currency?.toLowerCase() === "usd" && Math.round(Number(p.price_amount) * 100) >= order.total_cents;
    if (!PAID_STATUSES.has(p.payment_status) || !priceOk) {
      console.error("[nowpayments] payment mismatch", { orderId, payment: p.payment_id, status: p.payment_status, price: p.price_amount });
      return NextResponse.json({ ok: true, ignored: "mismatch" });
    }
    const settled = await settleOrder(orderId, `np:${p.payment_id}`);
    return NextResponse.json({ ok: true, settled, duplicate: !settled });
  }

  const failed = FAILED_STATUSES.get(body.payment_status);
  if (failed) await sql`UPDATE orders SET status = ${failed} WHERE id = ${orderId} AND status = 'pending'`;
  return NextResponse.json({ ok: true, status: body.payment_status });
}
