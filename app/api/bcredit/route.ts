import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/auth";
import { dbEnabled, sql, fromMicros } from "@/lib/db";
import { HOLDER_SHARE, MIN_BEEP, beepBalance, toBeep } from "@/lib/bcredit";

/** Public program stats, plus the caller's wallets and rewards when signed in. */
export async function GET(req: Request) {
  if (!dbEnabled) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const [epochs, [totals]] = await Promise.all([
    sql`SELECT day, pool_micros, total_beep, holders FROM bcredit_epochs ORDER BY day DESC LIMIT 14`,
    sql<{ paid: string; wallets: string }[]>`SELECT (SELECT coalesce(sum(amount_micros),0) FROM bcredit_rewards) AS paid, (SELECT count(*) FROM holder_wallets) AS wallets`,
  ]);
  const base = {
    share: HOLDER_SHARE, minBeep: MIN_BEEP,
    totalPaid: fromMicros(totals.paid), linkedWallets: Number(totals.wallets),
    epochs: epochs.map((e) => ({ day: e.day, pool: fromMicros(e.pool_micros), totalBeep: toBeep(e.total_beep), holders: e.holders })),
  };
  const userId = await verifyRequest(req);
  if (!userId) return NextResponse.json(base);

  const [[u], wallets, rewards] = await Promise.all([
    sql<{ bcredit_micros: string }[]>`SELECT bcredit_micros FROM users WHERE id = ${userId}`,
    sql<{ address: string; linked_at: string }[]>`SELECT address, linked_at FROM holder_wallets WHERE user_id = ${userId} ORDER BY linked_at`,
    sql`SELECT day, beep_balance, amount_micros FROM bcredit_rewards WHERE user_id = ${userId} ORDER BY day DESC LIMIT 30`,
  ]);
  const withBal = await Promise.all(wallets.map(async (w) => ({ address: w.address, beep: toBeep(await beepBalance(w.address).catch(() => BigInt(0))) })));
  return NextResponse.json({
    ...base,
    me: {
      bcredit: fromMicros(u?.bcredit_micros ?? 0),
      wallets: withBal,
      beep: withBal.reduce((s, w) => s + w.beep, 0),
      rewards: rewards.map((r) => ({ day: r.day, beep: toBeep(r.beep_balance), amount: fromMicros(r.amount_micros) })),
    },
  });
}
