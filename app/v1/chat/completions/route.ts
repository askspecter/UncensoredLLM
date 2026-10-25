import { dbEnabled } from "@/lib/db";
import { apiError, authenticate, gatewayEnabled } from "@/lib/gateway";
import { complete } from "@/lib/completion";
import { collect, decodePayment, paymentRequired, paymentResponse, quote, verifyPayment, x402Enabled } from "@/lib/x402";

export const maxDuration = 300;

export async function POST(req: Request) {
  if (!gatewayEnabled || !dbEnabled) return apiError(503, "unavailable", "Gateway is not configured");
  if (req.headers.get("authorization")) {
    const key = await authenticate(req);
    if (!key) return apiError(401, "invalid_key", "Missing, revoked or invalid API key");
    return complete(req, { userId: key.user_id, keyId: key.id });
  }
  if (!x402Enabled) return apiError(401, "invalid_key", "Missing API key");

  // No key: pay for this request with USDG on Robinhood Chain (x402).
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return apiError(400, "invalid_request", "Body must be JSON with `model` and `messages`");
  const q = quote(body);
  if (!q) return apiError(400, "invalid_request", "Unknown model or missing messages. See GET /v1/models");
  const header = req.headers.get("payment-signature") ?? req.headers.get("x-payment");
  if (!header) return paymentRequired(req, q.amount);
  const payment = decodePayment(header);
  if (!payment) return paymentRequired(req, q.amount, "Malformed PAYMENT-SIGNATURE header");
  const checked = await verifyPayment(payment, q.amount);
  if ("error" in checked) return paymentRequired(req, q.amount, checked.error);
  const paid = await collect(payment, checked.payer, checked.value, q.amount);
  if ("error" in paid) return paymentRequired(req, q.amount, paid.error);
  return complete(req, { userId: paid.account, keyId: null }, { ...body, max_tokens: q.maxTokens, max_completion_tokens: undefined }, {
    "PAYMENT-RESPONSE": paymentResponse({ success: true, transaction: paid.transaction ?? "", payer: checked.payer }),
    "Access-Control-Expose-Headers": "PAYMENT-RESPONSE, x-beeper-receipt",
  });
}
