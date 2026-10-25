// Verifies Privy access tokens (ES256 JWTs) against the app's JWKS.
import { createRemoteJWKSet, jwtVerify } from "jose";
import { NextResponse } from "next/server";
import { dbEnabled, sql } from "./db";
import { BURNER_PREFIX } from "./burner";
import { findApiKey } from "./keys";

const APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const jwks = APP_ID ? createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${APP_ID}/jwks.json`)) : null;

// Local testing only: lets `x-dev-user` stand in for a Privy token. Never active in production builds.
const devBypass = process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_BYPASS === "1";

export const authEnabled = Boolean(APP_ID);

/** Returns the Privy user id (DID) for a valid bearer token, otherwise null. Burner accounts sign in with their key. */
export async function verifyRequest(req: Request): Promise<string | null> {
  if (devBypass && req.headers.get("x-dev-user")) return req.headers.get("x-dev-user");
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  if (token.startsWith("sk-beeper-")) {
    // Only burner keys act as a session; a regular account's API key can't reach account endpoints.
    const key = dbEnabled ? await findApiKey(token) : null;
    return key?.user_id.startsWith(BURNER_PREFIX) ? key.user_id : null;
  }
  if (!jwks) return null;
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: "privy.io", audience: APP_ID });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

type Guard = { userId: string; error?: never } | { userId?: never; error: NextResponse };

/** Authenticates the request and makes sure the user row exists. */
export async function requireUser(req: Request): Promise<Guard> {
  if (!dbEnabled) return { error: NextResponse.json({ error: "Database not configured" }, { status: 503 }) };
  const userId = await verifyRequest(req);
  if (!userId) return { error: NextResponse.json({ error: "Sign in required" }, { status: 401 }) };
  await sql`INSERT INTO users (id) VALUES (${userId}) ON CONFLICT (id) DO NOTHING`;
  return { userId };
}
