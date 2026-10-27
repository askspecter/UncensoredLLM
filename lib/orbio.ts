// Orbio as Beeper's upstream: models Orbio serves at or below OpenRouter's price are sent to Orbio's gateway and
// paid from Beeper's Orbio balance, which the admin restocks from Orbio's on-chain book at a discount.
// The account is Beeper's server wallet; its API key is that wallet's signature, nothing is stored.
import ROUTABLE from "./orbio-models.json";
import { orbioKeyMessage } from "./orbio-core";
import { serverAccount } from "./server-wallet";

export * from "./orbio-core";
export const ORBIO_BASE = (process.env.ORBIO_BASE_URL ?? "https://www.orbio.so/api/v1").replace(/\/$/, "");
export const orbioEnabled = process.env.ORBIO_UPSTREAM === "1" && Boolean(serverAccount);
export const ORBIO_ACCOUNT = serverAccount?.address ?? null;
const routable = new Set<string>(ROUTABLE as string[]);

let key: Promise<string> | null = null;
function apiKey() {
  const epoch = Number(process.env.ORBIO_KEY_EPOCH ?? 0);
  key ??= serverAccount!.signMessage({ message: orbioKeyMessage(epoch) })
    .then((sig) => `sk-orb-${epoch}-${Buffer.from(sig.slice(2), "hex").toString("base64")}`);
  return key;
}

/** True when this request should go to Orbio rather than OpenRouter. */
export function routesToOrbio(body: { model?: unknown; plugins?: unknown }) {
  // Web search is an OpenRouter plugin; those requests stay there.
  return orbioEnabled && typeof body.model === "string" && routable.has(body.model) && !body.plugins;
}

export async function orbioFetch(path: string, body: Record<string, unknown>, signal: AbortSignal) {
  // `provider` is OpenRouter's routing field; Orbio routes to zero-data-retention endpoints on its own.
  const { provider: _provider, ...rest } = body;
  return fetch(`${ORBIO_BASE}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${await apiKey()}`, "content-type": "application/json" },
    body: JSON.stringify(rest),
    signal,
  });
}

/** Beeper's Orbio balance (USD), or null if it can't be read. */
export async function orbioBalance(): Promise<{ available: number; used: number } | null> {
  if (!serverAccount) return null;
  try {
    const r = await fetch(`${ORBIO_BASE}/key`, { headers: { authorization: `Bearer ${await apiKey()}` }, cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json();
    return { available: Number(j?.balance?.available ?? 0), used: Number(j?.balance?.used ?? 0) };
  } catch { return null; }
}
