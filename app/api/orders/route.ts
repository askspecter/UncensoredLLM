import { randomInt } from "crypto";
import { NextResponse } from "next/server";
import { MAX_PURCHASE, MIN_PURCHASE, quote } from "@/lib/data";
import { requireUser } from "@/lib/auth";
import { sql, toMicros, fromMicros } from "@/lib/db";
import { settleOrder } from "@/lib/billing";
import { createApiKey, newId } from "@/lib/keys";
import { PAY_TO, USDG, formatUsdg, robinhood } from "@/lib/chain";
import { latestBlock, usdgEnabled } from "@/lib/usdg";
import { createCheckout, whopEnabled } from "@/lib/whop";

// PAYMENTS_MODE=test settles orders instantly without payment — local testing only.
const TEST_PAYMENTS = process.env.PAYMENTS_MODE === "test";
const cents = (n: number) => Math.round(n * 100);

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const { userId } = auth;

  const body = await req.json().catch(() => null);
  const credit = Number(body?.credit);
  const method: "usdg" | "card" = body?.payment === "card" ? "card" : "usdg";
  if (!Number.isFinite(credit) || credit < MIN_PURCHASE || credit > MAX_PURCHASE) {
    return NextResponse.json({ error: `Amount must be between $${MIN_PURCHASE} and $${MAX_PURCHASE}` }, { status: 400 });
  }
  if (!TEST_PAYMENTS && method === "usdg" && !usdgEnabled) return NextResponse.json({ error: "USDG payments are not configured yet" }, { status: 503 });
  if (!TEST_PAYMENTS && method === "card" && !whopEnabled) return NextResponse.json({ error: "Card payments are not configured yet" }, { status: 503 });

  const q = quote(credit);
  const id = newId("ord");
  await sql`
    INSERT INTO orders (id, user_id, credit_micros, subtotal_cents, fee_cents, total_cents, payment_method)
    VALUES (${id}, ${userId}, ${toMicros(credit)}, ${cents(q.subtotal)}, ${cents(q.fee)}, ${cents(q.total)}, ${method})`;

  if (TEST_PAYMENTS) return settleForTest(id, userId, credit, q.total);

  if (method === "card") {
    const siteUrl = process.env.SITE_URL?.replace(/\/$/, "") ?? new URL(req.url).origin;
    try {
      const co = await createCheckout({ orderId: id, usd: q.total, credit, siteUrl });
      await sql`UPDATE orders SET provider_ref = ${`whop:${co.id}`}, checkout_url = ${co.purchase_url} WHERE id = ${id}`;
      return NextResponse.json({ id, method, status: "pending", credit, total: q.total, checkoutUrl: co.purchase_url }, { status: 201 });
    } catch (e) {
      console.error("[orders] whop checkout failed", e);
      await sql`UPDATE orders SET status = 'failed' WHERE id = ${id}`;
      return NextResponse.json({ error: "Could not start card checkout. Please try again." }, { status: 502 });
    }
  }

  // USDG: ask for the total plus a random sub-cent suffix so each open order has a unique amount.
  await sql`UPDATE orders SET status = 'expired' WHERE status = 'pending' AND payment_method = 'usdg' AND created_at < now() - interval '24 hours'`;
  const startBlock = (await latestBlock()) - BigInt(50);
  for (let attempt = 0; attempt < 5; attempt++) {
    const units = BigInt(cents(q.total)) * BigInt(10_000) + BigInt(randomInt(1, 10_000));
    try {
      await sql`UPDATE orders SET pay_units = ${units.toString()}, pay_to = ${PAY_TO!}, start_block = ${startBlock.toString()} WHERE id = ${id}`;
      return NextResponse.json({
        id, method, status: "pending", credit, total: q.total,
        pay: { to: PAY_TO, token: USDG, chainId: robinhood.id, units: units.toString(), amount: formatUsdg(units) },
      }, { status: 201 });
    } catch (e) {
      if ((e as { code?: string }).code !== "23505") throw e; // unique amount collision → retry
    }
  }
  return NextResponse.json({ error: "Busy, please try again" }, { status: 503 });
}

async function settleForTest(id: string, userId: string, credit: number, total: number) {
  await settleOrder(id, "test");
  const [{ count }] = await sql<{ count: string }[]>`SELECT count(*) FROM api_keys WHERE user_id = ${userId} AND revoked_at IS NULL`;
  const firstKey = Number(count) === 0 ? await createApiKey(userId, "Default") : null;
  const [{ balance_micros }] = await sql<{ balance_micros: string }[]>`SELECT balance_micros FROM users WHERE id = ${userId}`;
  return NextResponse.json({ id, status: "paid", credit, total, balance: fromMicros(balance_micros), apiKey: firstKey?.key ?? null }, { status: 201 });
}
