import { createHash, randomBytes } from "crypto";
import type postgres from "postgres";
import { sql } from "./db";

export const newId = (prefix: string) => `${prefix}_${randomBytes(8).toString("hex")}`;
export const hashKey = (k: string) => createHash("sha256").update(k).digest("hex");

/** Creates an API key and returns the plaintext once. Only the hash is stored. */
export async function createApiKey(userId: string, name: string, tx: postgres.Sql | postgres.TransactionSql = sql) {
  const key = `sk-beeper-${randomBytes(24).toString("base64url")}`;
  const id = newId("key");
  const prefix = key.slice(0, 14);
  await tx`INSERT INTO api_keys (id, user_id, name, key_hash, prefix) VALUES (${id}, ${userId}, ${name}, ${hashKey(key)}, ${prefix})`;
  return { id, name, prefix, key };
}

/** Resolves a bearer API key to its owner. Returns null for unknown or revoked keys. */
export async function findApiKey(key: string) {
  const [row] = await sql<{ id: string; user_id: string }[]>`
    UPDATE api_keys SET last_used_at = now()
    WHERE key_hash = ${hashKey(key)} AND revoked_at IS NULL
    RETURNING id, user_id`;
  return row ?? null;
}
