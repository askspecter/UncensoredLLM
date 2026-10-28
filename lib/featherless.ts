// "Connect Featherless": OAuth 2.0 authorization code grant, so a user's own Featherless plan serves the
// long-tail models. The client secret and the token exchange stay on the server; tokens are stored encrypted.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { sql } from "./db";

const AUTHORIZE = "https://featherless.ai/oauth/authorize";
const TOKEN = process.env.FEATHERLESS_TOKEN_URL ?? "https://api.featherless.ai/oauth/token";
// Public identifier of the Beeper app on Featherless; the secret is FEATHERLESS_CLIENT_SECRET.
const CLIENT_ID = process.env.FEATHERLESS_CLIENT_ID || "app_7ChzhE-4DQZDJrQf";
const SECRET = process.env.FEATHERLESS_CLIENT_SECRET;
// Must match the redirect URI registered on Featherless exactly.
export const REDIRECT_URI = process.env.FEATHERLESS_REDIRECT_URI ?? "https://www.usebeeper.io/api/featherless/callback";
const SCOPE = "api.access";
const STATE_TTL_MIN = 10;

export const featherlessOAuth = Boolean(SECRET);

// AES-256-GCM, keyed from TOKEN_ENCRYPTION_KEY or, failing that, the client secret.
const key = () => createHash("sha256").update(process.env.TOKEN_ENCRYPTION_KEY || SECRET || "").digest();
function seal(text: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}
function open(sealed: string) {
  const [iv, tag, body] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]).toString("utf8");
}

type Tokens = { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };

async function tokenRequest(params: Record<string, string>): Promise<Tokens> {
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json", "user-agent": "beeper/1.0" },
    body: new URLSearchParams({ ...params, client_id: CLIENT_ID, client_secret: SECRET! }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw Object.assign(new Error(data.error_description ?? data.error ?? `token endpoint ${res.status}`), { code: data.error });
  return data;
}

async function save(userId: string, t: Tokens, keepRefresh: string | null = null) {
  const refresh = t.refresh_token ? seal(t.refresh_token) : keepRefresh;
  const expires = new Date(Date.now() + (t.expires_in ?? 3600) * 1000);
  await sql`INSERT INTO featherless_links (user_id, access_enc, refresh_enc, expires_at, scope)
            VALUES (${userId}, ${seal(t.access_token)}, ${refresh}, ${expires}, ${t.scope ?? null})
            ON CONFLICT (user_id) DO UPDATE SET access_enc = EXCLUDED.access_enc, refresh_enc = EXCLUDED.refresh_enc,
              expires_at = EXCLUDED.expires_at, scope = EXCLUDED.scope, updated_at = now()`;
}

/** The URL to send the browser to, with a fresh one-time state bound to this user. */
export async function authorizeUrl(userId: string) {
  const state = randomBytes(24).toString("base64url");
  await sql`DELETE FROM oauth_states WHERE created_at < now() - make_interval(mins => ${STATE_TTL_MIN})`;
  await sql`INSERT INTO oauth_states (state, user_id) VALUES (${state}, ${userId})`;
  const q = new URLSearchParams({ client_id: CLIENT_ID, response_type: "code", redirect_uri: REDIRECT_URI, scope: SCOPE, state });
  return `${AUTHORIZE}?${q}`;
}

/** Callback: spends the state (once) and trades the code for tokens. Returns the user it belongs to. */
export async function finishAuthorization(state: string, code: string) {
  const [row] = await sql<{ user_id: string }[]>`
    DELETE FROM oauth_states WHERE state = ${state} AND created_at > now() - make_interval(mins => ${STATE_TTL_MIN}) RETURNING user_id`;
  if (!row) throw new Error("expired or unknown state");
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI });
  await save(row.user_id, t);
  return row.user_id;
}

/** A valid access token for this user's Featherless account, refreshed when close to expiry; null if not linked. */
export async function featherlessToken(userId: string): Promise<string | null> {
  if (!featherlessOAuth) return null;
  const [l] = await sql<{ access_enc: string; refresh_enc: string | null; expires_at: Date }[]>`
    SELECT access_enc, refresh_enc, expires_at FROM featherless_links WHERE user_id = ${userId}`;
  if (!l) return null;
  if (l.expires_at.getTime() - Date.now() > 60_000) return open(l.access_enc);
  if (!l.refresh_enc) return null;
  try {
    const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: open(l.refresh_enc) });
    await save(userId, t, l.refresh_enc);
    return t.access_token;
  } catch (e) {
    // A revoked or expired refresh token means the user has to connect again.
    if ((e as { code?: string }).code === "invalid_grant") await disconnect(userId);
    console.error("[featherless] refresh failed", (e as Error).message);
    return null;
  }
}

export async function linkStatus(userId: string) {
  const [l] = await sql<{ created_at: Date; scope: string | null }[]>`SELECT created_at, scope FROM featherless_links WHERE user_id = ${userId}`;
  return { configured: featherlessOAuth, connected: Boolean(l), since: l?.created_at ?? null };
}

export const disconnect = (userId: string) => sql`DELETE FROM featherless_links WHERE user_id = ${userId}`;
