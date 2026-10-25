// Proof of Bill, daily side: folds a UTC day's receipts into one Merkle root and writes it to Robinhood Chain.
import type { Hex } from "viem";
import { sql } from "./db";
import { anchorData, leafOf, merkleProof, merkleRoot, type SignedReceipt } from "./receipts";
import { chainClient, serverAccount, walletClient } from "./server-wallet";

type Row = { id: string; model: string; prompt_tokens: number; completion_tokens: number; cost_micros: string; ts: string; output_hash: Hex; receipt_sig: Hex };

const toReceipt = (r: Row): SignedReceipt => ({
  v: 1, id: String(r.id), model: r.model, promptTokens: r.prompt_tokens, completionTokens: r.completion_tokens,
  costMicros: String(r.cost_micros), ts: Number(r.ts), outputHash: r.output_hash, sig: r.receipt_sig, signer: serverAccount?.address ?? "",
});

async function dayRows(day: string) {
  return sql<Row[]>`
    SELECT id, model, prompt_tokens, completion_tokens, cost_micros, extract(epoch FROM created_at)::bigint AS ts, output_hash, receipt_sig
    FROM usage_logs
    WHERE receipt_sig IS NOT NULL AND to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') = ${day}
    ORDER BY id`;
}

/** Commits `day` (YYYY-MM-DD, UTC). Idempotent: an anchored day is never rewritten. */
export async function anchorDay(day: string) {
  const [done] = await sql`SELECT day, root, tx_hash FROM bill_roots WHERE day = ${day}`;
  if (done?.tx_hash) return { day, skipped: "already anchored", root: done.root, tx: done.tx_hash };
  if (!walletClient || !serverAccount) return { day, skipped: "SERVER_WALLET_KEY not set" };

  const leaves = (await dayRows(day)).map((r) => leafOf(toReceipt(r)));
  if (!leaves.length) return { day, skipped: "no receipts" };
  const root = merkleRoot(leaves);
  await sql`INSERT INTO bill_roots (day, root, leaves) VALUES (${day}, ${root}, ${leaves.length}) ON CONFLICT (day) DO UPDATE SET root = EXCLUDED.root, leaves = EXCLUDED.leaves`;
  const hash = await walletClient.sendTransaction({ to: serverAccount.address, value: BigInt(0), data: anchorData(day, root) });
  const r = await chainClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
  if (r.status !== "success") throw new Error("anchor transaction reverted");
  await sql`UPDATE bill_roots SET tx_hash = ${hash} WHERE day = ${day}`;
  return { day, root, leaves: leaves.length, tx: hash };
}

/** A receipt with its inclusion proof, if the caller knows its output hash (so ids can't be enumerated). */
export async function receiptWithProof(id: string, outputHash: string) {
  const [row] = await sql<(Row & { day: string })[]>`
    SELECT id, model, prompt_tokens, completion_tokens, cost_micros, extract(epoch FROM created_at)::bigint AS ts, output_hash, receipt_sig,
           to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day
    FROM usage_logs WHERE id = ${id} AND output_hash = ${outputHash.toLowerCase()} AND receipt_sig IS NOT NULL`;
  if (!row) return null;
  const receipt = toReceipt(row);
  const [anchor] = await sql<{ root: Hex; tx_hash: string | null }[]>`SELECT root, tx_hash FROM bill_roots WHERE day = ${row.day}`;
  if (!anchor?.tx_hash) return { receipt, day: row.day, anchored: false as const };
  const rows = await dayRows(row.day);
  const leaves = rows.map((r) => leafOf(toReceipt(r)));
  const index = rows.findIndex((r) => String(r.id) === String(row.id));
  return { receipt, day: row.day, anchored: true as const, root: anchor.root, tx: anchor.tx_hash, proof: merkleProof(leaves, index) };
}

export async function recentRoots() {
  return sql<{ day: string; root: string; leaves: number; tx_hash: string | null }[]>`
    SELECT to_char(day, 'YYYY-MM-DD') AS day, root, leaves, tx_hash FROM bill_roots ORDER BY day DESC LIMIT 30`;
}
