import { randomInt } from "crypto";
import { NextResponse } from "next/server";
import { MAX_PURCHASE, MIN_PURCHASE } from "@/lib/data";
import { requireUser } from "@/lib/auth";
import { sql, toMicros, fromMicros } from "@/lib/db";
import { ORDER_TTL_MINUTES, expireStale, failOrder, reserve, settleOrder } from "@/lib/market";
import { createApiKey, newId } from "@/lib/keys";
import { PAY_TO, USDG, formatUsdg, robinhood } from "@/lib/chain";
import { latestBlock, usdgEnabled } from "@/lib/usdg";
import { createCheckout, whopEnabled } from "@/lib/whop";

// PAYMENTS_MODE=test settles orders instantly without payment — local testing only.
const TEST_PAYMENTS = process.env.PAYMENTS_MODE === "test";
const cents = (n: number) => Math.round(n * 100);
const MAX_OPEN_ORDERS = 3;

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

  await expireStale();
  const [{ open }] = await sql<{ open: string }[]>`SELECT count(*) AS open FROM orders WHERE user_id = ${userId} AND status = 'pending'`;
  if (Number(open) >= MAX_OPEN_ORDERS) {
    return NextResponse.json({ error: "You have unpaid orders open — pay or wait for them to expire first" }, { status: 429 });
  }

  // Create the order and reserve its order-book fills atomically, so the quoted price holds until it expires.
  const id = newId("ord");
  const q = await sql.begin(async (tx) => {
    await tx`
      INSERT INTO orders (id, user_id, credit_micros, subtotal_cents, fee_cents, total_cents, payment_method, expires_at)
      VALUES (${id}, ${userId}, ${toMicros(credit)}, 0, 0, 0, ${method}, now() + make_interval(mins => ${ORDER_TTL_MINUTES}))`;
    const q = await reserve(tx, id, userId, credit);
    await tx`UPDATE orders SET subtotal_cents = ${cents(q.subtotal)}, fee_cents = ${cents(q.fee)}, total_cents = ${cents(q.total)} WHERE id = ${id}`;
    return q;
  });

  if (TEST_PAYMENTS) return settleForTest(id, userId, credit, q.total);

  if (method === "card") {
    const siteUrl = process.env.SITE_URL?.replace(/\/$/, "") ?? new URL(req.url).origin;
    try {
      const co = await createCheckout({ orderId: id, usd: q.total, credit, siteUrl });
      await sql`UPDATE orders SET provider_ref = ${`whop:${co.id}`}, checkout_url = ${co.purchase_url} WHERE id = ${id}`;
      return NextResponse.json({ id, method, status: "pending", credit, total: q.total, quote: q, checkoutUrl: co.purchase_url }, { status: 201 });
    } catch (e) {
      console.error("[orders] whop checkout failed", e);
      await failOrder(id);
      return NextResponse.json({ error: `Could not start card checkout: ${whopReason(e)}` }, { status: 502 });
    }
  }

  // USDG: ask for the total plus a random sub-cent suffix so each open order has a unique amount.
  const startBlock = (await latestBlock()) - BigInt(50);
  for (let attempt = 0; attempt < 5; attempt++) {
    const units = BigInt(cents(q.total)) * BigInt(10_000) + BigInt(randomInt(1, 10_000));
    try {
      await sql`UPDATE orders SET pay_units = ${units.toString()}, pay_to = ${PAY_TO!}, start_block = ${startBlock.toString()} WHERE id = ${id}`;
      return NextResponse.json({
        id, method, status: "pending", credit, total: q.total, quote: q,
        pay: { to: PAY_TO, token: USDG, chainId: robinhood.id, units: units.toString(), amount: formatUsdg(units) },
      }, { status: 201 });
    } catch (e) {
      if ((e as { code?: string }).code !== "23505") throw e; // unique amount collision → retry
    }
  }
  await failOrder(id);
  return NextResponse.json({ error: "Busy, please try again" }, { status: 503 });
}

/** Short, user-safe reason from a Whop API error (no keys or ids). */
function whopReason(e: unknown) {
  const msg = (e as Error).message ?? "";
  const status = msg.match(/ (\d{3}): /)?.[1];
  const detail = msg.match(/"message":"([^"]{1,160})"/)?.[1];
  if (status === "401") return "Whop API key is invalid.";
  if (status === "403") return `Whop API key is missing a permission${detail ? ` (${detail})` : ""}.`;
  return detail ?? (status ? `Whop returned ${status}.` : "Whop is unreachable.");
}

async function settleForTest(id: string, userId: string, credit: number, total: number) {
  await settleOrder(id, "test");
  const [{ count }] = await sql<{ count: string }[]>`SELECT count(*) FROM api_keys WHERE user_id = ${userId} AND revoked_at IS NULL`;
  const firstKey = Number(count) === 0 ? await createApiKey(userId, "Default") : null;
  const [{ balance_micros }] = await sql<{ balance_micros: string }[]>`SELECT balance_micros FROM users WHERE id = ${userId}`;
  return NextResponse.json({ id, status: "paid", credit, total, balance: fromMicros(balance_micros), apiKey: firstKey?.key ?? null }, { status: 201 });
}
