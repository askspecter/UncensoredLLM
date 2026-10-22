// Verifies Privy access tokens (ES256 JWTs) against the app's JWKS.
import { createRemoteJWKSet, jwtVerify } from "jose";

const APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const jwks = APP_ID ? createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${APP_ID}/jwks.json`)) : null;

export const authEnabled = Boolean(APP_ID);

/** Returns the Privy user id (DID) for a valid bearer token, otherwise null. */
export async function verifyRequest(req: Request): Promise<string | null> {
  if (!jwks) return null;
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: "privy.io", audience: APP_ID });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
