import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { settleOrder } from "@/lib/billing";
import { getPayment, verifyWebhook } from "@/lib/whop";

// Whop webhook. Retries until 2xx, so every branch is idempotent.
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhook(raw, req.headers)) return NextResponse.json({ error: "bad signature" }, { status: 401 });

  const event = JSON.parse(raw) as { type: string; data?: { id?: string; metadata?: { order_id?: string } | null } };
  const orderId = event.data?.metadata?.order_id;
  if (!event.data?.id || !orderId) return NextResponse.json({ ok: true, ignored: "no order" });

  const [order] = await sql<{ status: string; total_cents: number; provider_ref: string | null }[]>`
    SELECT status, total_cents, provider_ref FROM orders WHERE id = ${orderId} AND payment_method = 'card'`;
  if (!order) return NextResponse.json({ ok: true, ignored: "unknown order" });
  if (order.status === "paid") return NextResponse.json({ ok: true, duplicate: true });

  if (event.type === "payment.succeeded") {
    // Re-read the payment from Whop instead of trusting the webhook body alone.
    const p = await getPayment(event.data.id);
    const ok = p.substatus === "succeeded"
      && p.metadata?.order_id === orderId
      && `whop:${p.checkout_configuration_id}` === order.provider_ref
      && (p.currency ?? "usd").toLowerCase() === "usd"
      && Math.round(Number(p.total) * 100) >= order.total_cents;
    if (!ok) {
      console.error("[whop] payment mismatch", { orderId, payment: p.id, substatus: p.substatus, total: p.total });
      return NextResponse.json({ ok: true, ignored: "mismatch" });
    }
    const settled = await settleOrder(orderId); // keep provider_ref = the checkout id
    return NextResponse.json({ ok: true, settled });
  }

  // A failed attempt leaves the order pending: the buyer can retry on the same checkout.
  return NextResponse.json({ ok: true });
}
