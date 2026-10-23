import { dbEnabled } from "@/lib/db";
import { apiError, authenticate, gatewayEnabled } from "@/lib/gateway";
import { complete } from "@/lib/completion";

export const maxDuration = 300;

export async function POST(req: Request) {
  if (!gatewayEnabled || !dbEnabled) return apiError(503, "unavailable", "Gateway is not configured");
  const key = await authenticate(req);
  if (!key) return apiError(401, "invalid_key", "Missing, revoked or invalid API key");
  return complete(req, { userId: key.user_id, keyId: key.id });
}
