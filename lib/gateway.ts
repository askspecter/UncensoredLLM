// OpenAI-compatible gateway: authenticates Beeper keys, meters usage, forwards to OpenRouter.
import { NextResponse } from "next/server";
import { sql } from "./db";
import { findApiKey } from "./keys";
import { chargeUsage } from "./billing";
import type { Model } from "./data";

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const UPSTREAM = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
const DEFAULT_MAX_TOKENS = 16_384;
const MIN_BALANCE_MICROS = BigInt(1_000); // $0.001

export const gatewayEnabled = Boolean(OPENROUTER_KEY);

export function apiError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { message, type: code, code } }, { status });
}

/** Resolves `Authorization: Bearer sk-beeper-…` to its key and owner. */
export async function authenticate(req: Request) {
  const key = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!key?.startsWith("sk-beeper-")) return null;
  return findApiKey(key);
}

export async function balanceOf(userId: string) {
  const [u] = await sql<{ balance_micros: string }[]>`SELECT balance_micros FROM users WHERE id = ${userId}`;
  return BigInt(u?.balance_micros ?? 0);
}

/** Prices are USD per 1M tokens, which is exactly micro-dollars per token. */
export function costMicros(m: Model, promptTokens: number, completionTokens: number) {
  return BigInt(Math.ceil(promptTokens * m.input + completionTokens * m.output));
}

/** Caps max_tokens to what the balance can pay for, given a rough prompt-size estimate. */
export function affordableMaxTokens(m: Model, balance: bigint, body: unknown, requested?: number) {
  const estPromptTokens = Math.ceil(JSON.stringify(body).length / 3);
  const left = Number(balance) - estPromptTokens * m.input;
  const affordable = m.output > 0 ? Math.floor(left / m.output) : DEFAULT_MAX_TOKENS;
  return Math.max(0, Math.min(affordable, requested && requested > 0 ? requested : DEFAULT_MAX_TOKENS));
}

export function upstreamFetch(path: string, body: object, signal: AbortSignal) {
  return fetch(`${UPSTREAM}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${OPENROUTER_KEY}`,
      "content-type": "application/json",
      "http-referer": process.env.SITE_URL ?? "https://usebeeper.io",
      "x-title": "Beeper",
    },
    body: JSON.stringify(body),
    signal,
  });
}

/** Provider routing: never send prompts to providers that train on or retain data. */
export function privacyRouting() {
  return { data_collection: "deny", ...(process.env.ZDR_ONLY === "1" ? { zdr: true } : {}) };
}

export { MIN_BALANCE_MICROS, chargeUsage };
