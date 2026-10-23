import { NextResponse } from "next/server";
import { apiError, authenticate } from "@/lib/gateway";
import { ImageError, generateImages } from "@/lib/images";

export const maxDuration = 150;

/** OpenAI-style image generation: { model, prompt, n?, size?: "square"|"portrait"|"landscape", negative_prompt? } */
export async function POST(req: Request) {
  const key = await authenticate(req);
  if (!key) return apiError(401, "invalid_key", "Missing, revoked or invalid API key");
  const b = await req.json().catch(() => ({}));
  try {
    const r = await generateImages({ userId: key.user_id, keyId: key.id, model: b.model, prompt: b.prompt, negative: b.negative_prompt, size: b.size, count: b.n });
    return NextResponse.json({
      created: Math.floor(Date.now() / 1000), model: r.model, cost_usd: r.cost,
      data: r.images.map((url) => ({ b64_json: url.split(",")[1] })),
    });
  } catch (e) {
    if (e instanceof ImageError) return apiError(e.status, e.code, e.message);
    throw e;
  }
}
