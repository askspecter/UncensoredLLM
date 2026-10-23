import type postgres from "postgres";
import { sql } from "./db";

/** Marks an order paid and credits the user's balance exactly once. Returns false if already processed. */
export async function settleOrder(orderId: string, providerRef: string | null = null): Promise<boolean> {
  return sql.begin(async (tx) => {
    const [o] = await tx<{ user_id: string; credit_micros: string }[]>`
      UPDATE orders SET status = 'paid', paid_at = now(), provider_ref = coalesce(${providerRef}, provider_ref)
      WHERE id = ${orderId} AND status = 'pending'
      RETURNING user_id, credit_micros`;
    if (!o) return false;
    await addToBalance(tx, o.user_id, BigInt(o.credit_micros), "topup", orderId);
    return true;
  });
}

export async function addToBalance(tx: postgres.TransactionSql, userId: string, amount: bigint, kind: "topup" | "refund" | "adjust" | "usage", ref: string) {
  await tx`INSERT INTO ledger (user_id, amount_micros, kind, ref) VALUES (${userId}, ${amount.toString()}, ${kind}, ${ref})`;
  await tx`UPDATE users SET balance_micros = balance_micros + ${amount.toString()} WHERE id = ${userId}`;
}
