// NOWPayments (crypto) — hosted invoices + signed IPN callbacks.
// Docs: https://documenter.getpostman.com/view/7907941/2s93JusNJt
import { createHmac, timingSafeEqual } from "crypto";

const API_KEY = process.env.NOWPAYMENTS_API_KEY;
const IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET;
const BASE = process.env.NOWPAYMENTS_API_BASE
  ?? (process.env.NOWPAYMENTS_SANDBOX === "1" ? "https://api-sandbox.nowpayments.io/v1" : "https://api.nowpayments.io/v1");

export const nowpaymentsEnabled = Boolean(API_KEY && IPN_SECRET);

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "x-api-key": API_KEY!, "content-type": "application/json", ...init.headers },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`NOWPayments ${path} ${res.status}: ${data?.message ?? "request failed"}`);
  return data as T;
}

export type Invoice = { id: string; invoice_url: string };

export function createInvoice(o: { orderId: string; usd: number; description: string; siteUrl: string }) {
  return call<Invoice>("/invoice", {
    method: "POST",
    body: JSON.stringify({
      price_amount: o.usd,
      price_currency: "usd",
      order_id: o.orderId,
      order_description: o.description,
      ipn_callback_url: `${o.siteUrl}/api/payments/nowpayments`,
      success_url: `${o.siteUrl}/dashboard?order=${o.orderId}`,
      cancel_url: `${o.siteUrl}/#buy`,
    }),
  });
}

export type Payment = {
  payment_id: number | string;
  invoice_id?: number | string | null;
  payment_status: string;
  order_id: string | null;
  price_amount: number;
  price_currency: string;
  actually_paid?: number;
  pay_currency?: string;
};

export const getPayment = (id: string | number) => call<Payment>(`/payment/${id}`);

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]));
  }
  return v;
}

/** IPN signature: HMAC-SHA512 over the key-sorted JSON body, hex, in `x-nowpayments-sig`. */
export function verifyIpn(body: unknown, signature: string | null): boolean {
  if (!IPN_SECRET || !signature) return false;
  const expected = createHmac("sha512", IPN_SECRET).update(JSON.stringify(sortKeys(body))).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature.toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

// finished = funds settled to us. confirmed = enough confirmations on-chain; safe to credit too.
export const PAID_STATUSES = new Set(["confirmed", "finished"]);
export const FAILED_STATUSES = new Map([["failed", "failed"], ["expired", "expired"], ["refunded", "refunded"]]);
