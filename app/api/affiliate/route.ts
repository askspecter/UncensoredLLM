import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { sql, fromMicros } from "@/lib/db";
import { HOLD_DAYS, MIN_WITHDRAW, ensureRefCode } from "@/lib/affiliate";

/** The signed-in affiliate's link and earnings. */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const code = await ensureRefCode(auth.userId);
  const origin = process.env.SITE_URL?.replace(/\/$/, "") ?? new URL(req.url).origin;
  const [[stats], recent, payouts] = await Promise.all([
    sql<{ referrals: string; buyers: string; earned: string; available: string; held: string; paid_out: string }[]>`
      SELECT (SELECT count(*) FROM users WHERE referred_by = ${auth.userId}) AS referrals,
             (SELECT count(DISTINCT o.user_id) FROM referral_earnings e JOIN orders o ON o.id = e.order_id WHERE e.affiliate_id = ${auth.userId}) AS buyers,
             coalesce(sum(amount_micros), 0) AS earned,
             coalesce(sum(amount_micros) FILTER (WHERE payout_id IS NULL AND available_at <= now()), 0) AS available,
             coalesce(sum(amount_micros) FILTER (WHERE payout_id IS NULL AND available_at > now()), 0) AS held,
             coalesce(sum(amount_micros) FILTER (WHERE payout_id IS NOT NULL), 0) AS paid_out
      FROM referral_earnings WHERE affiliate_id = ${auth.userId}`,
    sql`SELECT amount_micros, available_at, created_at FROM referral_earnings WHERE affiliate_id = ${auth.userId} ORDER BY created_at DESC LIMIT 20`,
    sql`SELECT id, amount_micros, address, status, tx_hash, created_at FROM payouts WHERE user_id = ${auth.userId} AND kind = 'affiliate' ORDER BY created_at DESC LIMIT 20`,
  ]);
  return NextResponse.json({
    code, link: `${origin}/?ref=${code}`, holdDays: HOLD_DAYS, minWithdraw: MIN_WITHDRAW,
    referrals: Number(stats.referrals), buyers: Number(stats.buyers),
    earned: fromMicros(stats.earned), available: fromMicros(stats.available), held: fromMicros(stats.held), paidOut: fromMicros(stats.paid_out),
    recent: recent.map((r) => ({ amount: fromMicros(r.amount_micros), availableAt: r.available_at, createdAt: r.created_at })),
    payouts: payouts.map((p) => ({ id: p.id, amount: fromMicros(p.amount_micros), address: p.address, status: p.status, txHash: p.tx_hash, createdAt: p.created_at })),
  });
}
