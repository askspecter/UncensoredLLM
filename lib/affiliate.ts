import { randomBytes } from "crypto";
import type postgres from "postgres";
import { AFFILIATE_COMMISSION } from "./data";
import { sql } from "./db";

export const HOLD_DAYS = 14;
export const MIN_WITHDRAW = 10;

/** Returns the user's referral code, creating one on first use. */
export async function ensureRefCode(userId: string): Promise<string> {
  const [u] = await sql<{ ref_code: string | null }[]>`SELECT ref_code FROM users WHERE id = ${userId}`;
  if (u?.ref_code) return u.ref_code;
  for (let i = 0; i < 5; i++) {
    const code = randomBytes(5).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 7);
    if (code.length < 5) continue;
    try {
      const [r] = await sql<{ ref_code: string }[]>`UPDATE users SET ref_code = coalesce(ref_code, ${code}) WHERE id = ${userId} RETURNING ref_code`;
      return r.ref_code;
    } catch (e) {
      if ((e as { code?: string }).code !== "23505") throw e;
    }
  }
  throw new Error("Could not allocate a referral code");
}

/**
 * Links a buyer to the affiliate behind `code`. Only before the buyer's first paid order, never to
 * themselves, and a later valid referral replaces an earlier one until that first purchase.
 */
export async function attachReferral(userId: string, code: string): Promise<boolean> {
  const rows = await sql`
    UPDATE users u SET referred_by = a.id, referred_at = now()
    FROM users a
    WHERE u.id = ${userId} AND a.ref_code = ${code.toLowerCase()} AND a.id <> u.id
      AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id AND o.status = 'paid')
    RETURNING u.id`;
  return rows.length > 0;
}

/** Records commission for a newly paid order (inside the settlement transaction). */
export async function recordCommission(tx: postgres.TransactionSql, orderId: string, buyerId: string) {
  await tx`
    INSERT INTO referral_earnings (affiliate_id, order_id, amount_micros, available_at)
    SELECT u.referred_by, o.id, round(o.total_cents * 10000 * ${AFFILIATE_COMMISSION}::numeric)::bigint, now() + make_interval(days => ${HOLD_DAYS})
    FROM users u JOIN orders o ON o.id = ${orderId}
    WHERE u.id = ${buyerId} AND u.referred_by IS NOT NULL AND o.total_cents > 0
    ON CONFLICT (order_id) DO NOTHING`;
}
