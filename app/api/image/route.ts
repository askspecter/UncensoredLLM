import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { ImageError, generateImages } from "@/lib/images";

export const maxDuration = 150;

/** In-browser image generation for the signed-in user. */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const b = await req.json().catch(() => ({}));
  try {
    return NextResponse.json(await generateImages({ userId: auth.userId, keyId: null, model: b.model, prompt: b.prompt, negative: b.negative, size: b.size, count: b.count }));
  } catch (e) {
    if (e instanceof ImageError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
