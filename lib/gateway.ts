// OpenAI-compatible gateway: authenticates Beeper keys, meters usage, forwards to OpenRouter.
import { NextResponse } from "next/server";
import { sql } from "./db";
import { findApiKey } from "./keys";
import { chargeUsage } from "./billing";
import type { Model } from "./data";
import { orbioFetch, routesToOrbio } from "./orbio";

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const VENICE_KEY = process.env.VENICE_API_KEY;
const FEATHERLESS_KEY = process.env.FEATHERLESS_API_KEY;
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
/** Rough prompt size for budgeting: ~3 characters per token, and a flat 1,600 tokens per attached image. */
export function estimatePromptTokens(messages: unknown) {
  let images = 0;
  const text = JSON.stringify(messages, (_k, v) => (typeof v === "string" && v.startsWith("data:") ? (images++, "") : v));
  return Math.ceil(text.length / 3) + images * 1_600;
}

export function affordableMaxTokens(m: Model, balance: bigint, body: unknown, requested?: number) {
  const estPromptTokens = estimatePromptTokens(body);
  const left = Number(balance) - estPromptTokens * m.input;
  const affordable = m.output > 0 ? Math.floor(left / m.output) : DEFAULT_MAX_TOKENS;
  return Math.max(0, Math.min(affordable, requested && requested > 0 ? requested : DEFAULT_MAX_TOKENS));
}

/**
 * Sends a request upstream: to Orbio when it serves the model at or below OpenRouter's price (and is enabled),
 * otherwise, or if Orbio can't take it right now, to OpenRouter.
 */
export async function upstreamFetch(path: string, body: Record<string, unknown>, signal: AbortSignal, route?: Model["route"]) {
  if (route) return directFetch(route, path, body, signal);
  if (routesToOrbio(body)) {
    try {
      const res = await orbioFetch(path, body, signal);
      if (res.ok) return res;
      console.warn(`[gateway] orbio ${res.status} for ${body.model}, falling back to OpenRouter`);
    } catch (e) {
      if (signal.aborted) throw e;
      console.warn("[gateway] orbio unreachable, falling back to OpenRouter");
    }
  }
  return openRouterFetch(path, body, signal);
}

/**
 * Venice and Featherless speak the OpenAI API but not OpenRouter's extensions, so those are dropped.
 * Neither keeps prompts (Venice: private by design; Featherless: never logs prompts or completions).
 */
function directFetch(route: NonNullable<Model["route"]>, path: string, body: Record<string, unknown>, signal: AbortSignal) {
  const { provider: _p, usage: _u, plugins: _w, transforms: _t, models: _m, ...rest } = body;
  const [base, key, extra] = route === "venice"
    ? ["https://api.venice.ai/api/v1", VENICE_KEY, { venice_parameters: { include_venice_system_prompt: false } }]
    : ["https://api.featherless.ai/v1", FEATHERLESS_KEY, {}];
  if (!key) return Promise.resolve(Response.json({ error: { message: "This model is not available right now" } }, { status: 503 }));
  return fetch(`${process.env[`${route.toUpperCase()}_BASE_URL`] ?? base}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "user-agent": "beeper/1.0" },
    body: JSON.stringify({ ...rest, ...extra }),
    signal,
  });
}

function openRouterFetch(path: string, body: object, signal: AbortSignal) {
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
