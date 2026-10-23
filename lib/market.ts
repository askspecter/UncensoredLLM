// Order book: users' resale offers (deepest discount first) plus Beeper's unlimited house liquidity.
import type postgres from "postgres";
import { HOUSE_DISCOUNT, MARKET_FEE, type Fill, type Quote } from "./data";
import { MICROS, sql } from "./db";
import { addToBalance } from "./billing";
import { newId } from "./keys";
import { recordCommission } from "./affiliate";
import { notify } from "./notify";

type Tx = postgres.TransactionSql;
export const ORDER_TTL_MINUTES = 120;
const HOUSE_BPS = Math.round(HOUSE_DISCOUNT * 10_000);

type OfferRow = { id: string; remaining_micros: string; discount_bps: number };

/** Prices a fill list. Fee applies only to credit bought from other users. */
function price(credit: bigint, fills: { offerId: string | null; bps: number; micros: bigint }[]): Quote & { priceMicros: bigint[] } {
  const priceMicros = fills.map((f) => (f.micros * BigInt(10_000 - f.bps)) / BigInt(10_000));
  const offerPrice = fills.reduce((s, f, i) => (f.offerId ? s + priceMicros[i] : s), BigInt(0));
  const subtotal = priceMicros.reduce((a, b) => a + b, BigInt(0));
  const fee = (offerPrice * BigInt(Math.round(MARKET_FEE * 10_000))) / BigInt(10_000);
  const cents = (m: bigint) => Math.round(Number(m) / 10_000) / 100;
  const total = cents(subtotal + fee);
  const c = Number(credit) / MICROS;
  return {
    credit: c,
    fills: fills.map<Fill>((f, i) => ({ offerId: f.offerId, discount: f.bps / 10_000, credit: Number(f.micros) / MICROS, price: cents(priceMicros[i]) })),
    subtotal: cents(subtotal), fee: cents(fee), total,
    savings: Math.round((c - total) * 100) / 100,
    discount: c > 0 ? 1 - total / c : 0,
    priceMicros,
  };
}

function fillFrom(offers: OfferRow[], credit: bigint) {
  let need = credit;
  const fills: { offerId: string | null; bps: number; micros: bigint }[] = [];
  for (const o of offers) {
    if (need <= BigInt(0)) break;
    const take = BigInt(o.remaining_micros) < need ? BigInt(o.remaining_micros) : need;
    if (take > BigInt(0)) { fills.push({ offerId: o.id, bps: o.discount_bps, micros: take }); need -= take; }
  }
  if (need > BigInt(0)) fills.push({ offerId: null, bps: HOUSE_BPS, micros: need });
  return fills;
}

// Only offers deeper than the house discount can ever win a fill.
const bookQuery = (db: postgres.Sql | Tx, excludeUser: string | null, lock: boolean) => lock
  ? db<OfferRow[]>`SELECT id, remaining_micros, discount_bps FROM offers
      WHERE status = 'live' AND remaining_micros > 0 AND discount_bps > ${HOUSE_BPS} AND user_id IS DISTINCT FROM ${excludeUser}
      ORDER BY discount_bps DESC, created_at FOR UPDATE SKIP LOCKED`
  : db<OfferRow[]>`SELECT id, remaining_micros, discount_bps FROM offers
      WHERE status = 'live' AND remaining_micros > 0 AND discount_bps > ${HOUSE_BPS} AND user_id IS DISTINCT FROM ${excludeUser}
      ORDER BY discount_bps DESC, created_at`;

/** Read-only quote against the live book. */
export async function quoteBook(creditUsd: number, excludeUser: string | null = null): Promise<Quote> {
  const credit = BigInt(Math.round(creditUsd * MICROS));
  const { priceMicros: _p, ...q } = price(credit, fillFrom(await bookQuery(sql, excludeUser, false), credit));
  return q;
}

/** Reserves liquidity for a new order inside `tx`; returns its price. */
export async function reserve(tx: Tx, orderId: string, userId: string, creditUsd: number) {
  const credit = BigInt(Math.round(creditUsd * MICROS));
  const fills = fillFrom(await bookQuery(tx, userId, true), credit);
  const q = price(credit, fills);
  for (const [i, f] of fills.entries()) {
    if (f.offerId) await tx`UPDATE offers SET remaining_micros = remaining_micros - ${f.micros.toString()} WHERE id = ${f.offerId}`;
    await tx`INSERT INTO order_fills (order_id, offer_id, credit_micros, price_micros, discount_bps)
             VALUES (${orderId}, ${f.offerId}, ${f.micros.toString()}, ${q.priceMicros[i].toString()}, ${f.bps})`;
  }
  const { priceMicros: _p, ...quote } = q;
  return quote;
}

/** Returns released credit to an offer, or straight back to the seller if they cancelled meanwhile. */
async function giveBack(tx: Tx, offerId: string, micros: bigint) {
  const [o] = await tx<{ status: string; user_id: string }[]>`SELECT status, user_id FROM offers WHERE id = ${offerId} FOR UPDATE`;
  if (o.status === "live") await tx`UPDATE offers SET remaining_micros = remaining_micros + ${micros.toString()} WHERE id = ${offerId}`;
  else await addToBalance(tx, o.user_id, micros, "unescrow", offerId);
}

/** Expires unpaid orders past their TTL and releases their reserved liquidity. */
export async function expireStale() {
  await sql.begin(async (tx) => {
    const expired = await tx<{ id: string }[]>`
      UPDATE orders SET status = 'expired' WHERE status = 'pending' AND expires_at < now() RETURNING id`;
    if (!expired.length) return;
    const fills = await tx<{ offer_id: string | null; credit_micros: string }[]>`
      UPDATE order_fills SET status = 'released'
      WHERE order_id IN ${tx(expired.map((e) => e.id))} AND status = 'reserved' RETURNING offer_id, credit_micros`;
    for (const f of fills) if (f.offer_id) await giveBack(tx, f.offer_id, BigInt(f.credit_micros));
  });
}

/** Cancels an unpaid order (e.g. checkout could not start) and releases its liquidity. */
export async function failOrder(orderId: string) {
  await sql.begin(async (tx) => {
    const done = await tx`UPDATE orders SET status = 'failed' WHERE id = ${orderId} AND status = 'pending' RETURNING id`;
    if (!done.length) return;
    const fills = await tx<{ offer_id: string | null; credit_micros: string }[]>`
      UPDATE order_fills SET status = 'released' WHERE order_id = ${orderId} AND status = 'reserved' RETURNING offer_id, credit_micros`;
    for (const f of fills) if (f.offer_id) await giveBack(tx, f.offer_id, BigInt(f.credit_micros));
  });
}

/**
 * Marks an order paid, credits the buyer and records seller payouts — exactly once.
 * A late payment on an expired order re-takes its old offers where possible; anything
 * no longer available is covered by Beeper at the price the buyer already paid.
 */
export async function settleOrder(orderId: string, providerRef: string | null = null): Promise<boolean> {
  const result = await settle(orderId, providerRef);
  if (result) {
    const owed = result.payouts.reduce((a, b) => a + b, 0);
    await notify(`💳 Beeper order paid: $${result.credit.toFixed(2)} credit for $${result.paid.toFixed(2)}${owed ? ` · seller payouts owed: $${owed.toFixed(2)} USDG (see /admin)` : ""}`);
  }
  return Boolean(result);
}

async function settle(orderId: string, providerRef: string | null) {
  return sql.begin(async (tx) => {
    const [o] = await tx<{ user_id: string; credit_micros: string; status: string; total_cents: number }[]>`
      SELECT user_id, credit_micros, status, total_cents FROM orders WHERE id = ${orderId} FOR UPDATE`;
    if (!o || (o.status !== "pending" && o.status !== "expired")) return null;

    if (o.status === "expired") {
      const released = await tx<{ id: string; offer_id: string | null; credit_micros: string }[]>`
        SELECT id, offer_id, credit_micros FROM order_fills WHERE order_id = ${orderId} AND status = 'released'`;
      for (const f of released) {
        if (f.offer_id) {
          const taken = await tx`UPDATE offers SET remaining_micros = remaining_micros - ${f.credit_micros}
            WHERE id = ${f.offer_id} AND status = 'live' AND remaining_micros >= ${f.credit_micros} RETURNING id`;
          if (!taken.length) await tx`UPDATE order_fills SET offer_id = NULL WHERE id = ${f.id}`;
        }
        await tx`UPDATE order_fills SET status = 'reserved' WHERE id = ${f.id}`;
      }
    }

    await tx`UPDATE orders SET status = 'paid', paid_at = now(), provider_ref = coalesce(${providerRef}, provider_ref) WHERE id = ${orderId}`;
    await addToBalance(tx, o.user_id, BigInt(o.credit_micros), "topup", orderId);
    await recordCommission(tx, orderId, o.user_id);

    const sold = await tx<{ offer_id: string; price_micros: string; seller: string; payout_address: string }[]>`
      UPDATE order_fills f SET status = 'settled' FROM offers o
      WHERE f.order_id = ${orderId} AND f.status = 'reserved' AND f.offer_id = o.id
      RETURNING f.offer_id, f.price_micros, o.user_id AS seller, o.payout_address`;
    await tx`UPDATE order_fills SET status = 'settled' WHERE order_id = ${orderId} AND status = 'reserved'`;
    const payouts: number[] = [];
    for (const s of sold) {
      if (BigInt(s.price_micros) <= BigInt(0)) continue;
      await tx`INSERT INTO payouts (id, user_id, offer_id, order_id, amount_micros, address)
               VALUES (${newId("pay")}, ${s.seller}, ${s.offer_id}, ${orderId}, ${s.price_micros}, ${s.payout_address})`;
      payouts.push(Number(s.price_micros) / MICROS);
    }
    return { credit: Number(o.credit_micros) / MICROS, paid: o.total_cents / 100, payouts };
  });
}

/** Public order book: offers grouped into 5% discount bands, plus the house line. */
export async function bookSummary() {
  const rows = await sql<{ band: number; micros: string; n: string }[]>`
    SELECT (discount_bps / 500) * 5 AS band, sum(remaining_micros) AS micros, count(*) AS n
    FROM offers WHERE status = 'live' AND remaining_micros > 0 GROUP BY 1 ORDER BY 1 DESC`;
  return {
    house: HOUSE_DISCOUNT,
    bands: rows.map((r) => ({ from: Number(r.band) / 100, to: (Number(r.band) + 5) / 100, liquidity: Number(r.micros) / MICROS, offers: Number(r.n) })),
  };
}
