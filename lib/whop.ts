// Whop, hosted card checkout + Standard Webhooks callbacks.
// Docs: https://docs.whop.com/api-reference/checkout-configurations/create-checkout-configuration
import { createHmac, timingSafeEqual } from "crypto";

const API_KEY = process.env.WHOP_API_KEY;
const COMPANY_ID = process.env.WHOP_COMPANY_ID;
const WEBHOOK_SECRET = process.env.WHOP_WEBHOOK_SECRET;
const BASE = process.env.WHOP_API_BASE ?? "https://api.whop.com/api/v1";

// WHOP_COMPANY_ID is optional: current API versions resolve the account from the API key.
export const whopEnabled = Boolean(API_KEY && WEBHOOK_SECRET);

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${API_KEY}`, "content-type": "application/json", ...init.headers },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Whop ${path} ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data as T;
}

export type Checkout = { id: string; purchase_url: string };

export async function createCheckout(o: { orderId: string; usd: number; credit: number; siteUrl: string }) {
  const plan = {
    currency: "usd",
    plan_type: "one_time",
    release_method: "buy_now",
    visibility: "hidden",
    initial_price: o.usd,
    title: `$${o.credit} Beeper credit`,
  };
  const product = { external_identifier: "beeper-credits", title: "Beeper Credits" };
  // Request shapes differ across Whop API versions; try the current one first, then older ones.
  const variants: Record<string, unknown>[] = [
    plan,
    ...(COMPANY_ID ? [{ ...plan, account_id: COMPANY_ID, product }, { ...plan, company_id: COMPANY_ID, product }] : []),
  ];
  let lastError: unknown;
  for (const [i, p] of variants.entries()) {
    try {
      return await call<Checkout>("/checkout_configurations", {
        method: "POST",
        headers: { "idempotency-key": `${o.orderId}-${i}` },
        body: JSON.stringify({
          mode: "payment",
          plan: p,
          metadata: { order_id: o.orderId },
          redirect_url: `${o.siteUrl}/dashboard?order=${o.orderId}`,
        }),
      });
    } catch (e) {
      lastError = e;
      if (/ (401|403|5\d\d): /.test((e as Error).message)) throw e; // auth/server errors won't be fixed by another shape
    }
  }
  throw lastError;
}

export type Payment = {
  id: string;
  status: string | null;
  substatus: string | null;
  total: number | null;
  currency: string | null;
  metadata: Record<string, unknown> | null;
  checkout_configuration_id: string | null;
  paid_at: string | null;
};

export const getPayment = (id: string) => call<Payment>(`/payments/${encodeURIComponent(id)}`);

/**
 * Standard Webhooks: base64(HMAC-SHA256(secret, `${id}.${timestamp}.${body}`)) in `webhook-signature` as "v1,<sig>".
 * Whop signs with the literal bytes of the `ws_…` secret (no base64 decode, no prefix stripping).
 */
export function verifyWebhook(body: string, headers: Headers, toleranceSec = 300): boolean {
  if (!WEBHOOK_SECRET) return false;
  const id = headers.get("webhook-id");
  const ts = headers.get("webhook-timestamp");
  const sigs = headers.get("webhook-signature");
  if (!id || !ts || !sigs) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > toleranceSec) return false;
  const expected = Buffer.from(createHmac("sha256", WEBHOOK_SECRET).update(`${id}.${ts}.${body}`).digest("base64"));
  return sigs.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    const given = Buffer.from(sig ?? "");
    return version === "v1" && given.length === expected.length && timingSafeEqual(given, expected);
  });
}
