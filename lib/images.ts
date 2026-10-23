// Image generation via the Venice API, billed per image from the user's balance.
import { findImageModel } from "./data";
export { IMAGE_MODELS, findImageModel, type ImageModel } from "./data";
import { sql } from "./db";
import { chargeUsage } from "./billing";

const VENICE_KEY = process.env.VENICE_API_KEY;
const VENICE = process.env.VENICE_API_BASE ?? "https://api.venice.ai/api/v1";
export const imagesEnabled = Boolean(VENICE_KEY);

const SIZES: Record<string, [number, number]> = { square: [1024, 1024], portrait: [832, 1216], landscape: [1216, 832] };

// Hard line regardless of model: nothing sexualizing minors. Blocks any prompt that references minors.
const MINOR = /\b(child|children|kid|kids|minor|minors|underage|under[- ]?age|preteen|pre-teen|teen|teens|teenage|teenager|young girl|young boy|little girl|little boy|schoolgirl|schoolboy|loli|lolita|shota|toddler|infant|baby|babies|1[0-7]\s*(yo|y\/o|years?\s*old))\b/i;

export class ImageError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

/** Generates `count` images and bills the user. Returns data URLs. */
export async function generateImages(o: { userId: string; keyId: string | null; model: string; prompt: string; negative?: string; size?: string; count?: number }) {
  if (!imagesEnabled) throw new ImageError(503, "unavailable", "Image generation is not configured");
  const model = findImageModel(o.model);
  if (!model) throw new ImageError(404, "model_not_found", `Unknown image model "${o.model}"`);
  const prompt = (o.prompt ?? "").trim();
  if (!prompt || prompt.length > 4000) throw new ImageError(400, "invalid_request", "Prompt must be 1 to 4000 characters");
  if (MINOR.test(prompt) || MINOR.test(o.negative ?? "")) {
    throw new ImageError(400, "content_policy", "Prompts involving minors are not allowed.");
  }
  const count = Math.min(Math.max(Math.floor(o.count ?? 1), 1), 4);
  const [width, height] = SIZES[o.size ?? "square"] ?? SIZES.square;

  const cost = BigInt(Math.round(model.perImage * 1e6)) * BigInt(count);
  const [u] = await sql<{ balance_micros: string }[]>`SELECT balance_micros FROM users WHERE id = ${o.userId}`;
  if (!u || BigInt(u.balance_micros) < cost) throw new ImageError(402, "insufficient_credit", "Balance too low. Top up at https://usebeeper.io/#buy");

  const started = Date.now();
  const res = await fetch(`${VENICE}/image/generate`, {
    method: "POST",
    headers: { authorization: `Bearer ${VENICE_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: model.upstream, prompt, negative_prompt: o.negative || undefined,
      width, height, format: "webp", safe_mode: false, hide_watermark: true, variants: count,
    }),
    signal: AbortSignal.timeout(120_000),
  }).catch(() => null);
  if (!res?.ok) {
    const err = res ? await res.json().catch(() => ({})) : {};
    console.error("[images] venice error", res?.status, JSON.stringify(err).slice(0, 300));
    throw new ImageError(502, "upstream_error", `Image provider error${res ? ` (${res.status})` : ""}. You were not charged.`);
  }
  const data = (await res.json()) as { images?: string[] };
  const images = (data.images ?? []).map((b64) => `data:image/webp;base64,${b64}`);
  if (!images.length) throw new ImageError(422, "content_policy", "The provider declined this prompt. You were not charged.");

  // Bill only for images actually returned.
  await chargeUsage({
    userId: o.userId, keyId: o.keyId, model: model.id, promptTokens: 0, completionTokens: images.length,
    costMicros: BigInt(Math.round(model.perImage * 1e6)) * BigInt(images.length), latencyMs: Date.now() - started, status: 200,
  });
  return { model: model.id, images, cost: model.perImage * images.length };
}
