import type postgres from "postgres";
import { sql } from "./db";

export async function addToBalance(tx: postgres.TransactionSql, userId: string, amount: bigint, kind: "topup" | "refund" | "adjust" | "usage" | "escrow" | "unescrow", ref: string) {
  await tx`INSERT INTO ledger (user_id, amount_micros, kind, ref) VALUES (${userId}, ${amount.toString()}, ${kind}, ${ref})`;
  await tx`UPDATE users SET balance_micros = balance_micros + ${amount.toString()} WHERE id = ${userId}`;
}

/**
 * Debits a completed request and logs its metadata (never content). Charges at most the
 * remaining balance, so the balance can't go negative; returns the amount actually charged.
 */
export async function chargeUsage(u: {
  userId: string; keyId: string; model: string; promptTokens: number; completionTokens: number;
  costMicros: bigint; latencyMs: number; status: number;
}): Promise<bigint> {
  return sql.begin(async (tx) => {
    const [row] = await tx<{ balance_micros: string }[]>`SELECT balance_micros FROM users WHERE id = ${u.userId} FOR UPDATE`;
    const balance = BigInt(row?.balance_micros ?? 0);
    const charge = u.costMicros < balance ? u.costMicros : balance;
    const [log] = await tx<{ id: string }[]>`
      INSERT INTO usage_logs (user_id, api_key_id, model, prompt_tokens, completion_tokens, cost_micros, latency_ms, status)
      VALUES (${u.userId}, ${u.keyId}, ${u.model}, ${u.promptTokens}, ${u.completionTokens}, ${charge.toString()}, ${u.latencyMs}, ${u.status})
      RETURNING id`;
    if (charge > BigInt(0)) await addToBalance(tx, u.userId, -charge, "usage", `usage:${log.id}`);
    return charge;
  });
}
