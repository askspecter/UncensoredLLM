// In-memory store for demo purposes. Replace with Postgres/Redis + a payment processor in production.
import { randomBytes, createHash } from "crypto";

export type Order = { id: string; keyHash: string; credit: number; total: number; payment: string; createdAt: number };
export type Listing = { id: string; source: string; credit: number; discount: number; payout: string; status: "pending_verification" | "live"; createdAt: number };

const g = globalThis as unknown as { __umbra?: { orders: Order[]; listings: Listing[] } };
g.__umbra ??= { orders: [], listings: [] };
export const db = g.__umbra;

export const newId = (prefix: string) => `${prefix}_${randomBytes(6).toString("hex")}`;
export const newApiKey = () => `sk-umbra-${randomBytes(24).toString("base64url")}`;
export const hashKey = (k: string) => createHash("sha256").update(k).digest("hex");
