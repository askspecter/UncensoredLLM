import { requireUser } from "@/lib/auth";
import { apiError, gatewayEnabled } from "@/lib/gateway";
import { complete } from "@/lib/completion";

export const maxDuration = 300;

/** In-browser chat: same pipeline as /v1, authenticated by the signed-in session instead of an API key. */
export async function POST(req: Request) {
  if (!gatewayEnabled) return apiError(503, "unavailable", "Chat is not configured");
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  return complete(req, { userId: auth.userId, keyId: null });
}
