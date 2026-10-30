import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";

// The form resizes to 512px before uploading, so anything near this is already generous.
const MAX_BYTES = 1_000_000;
const TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const SITE = process.env.SITE_URL ?? "https://www.usebeeper.io";

/** Stores a coin logo and returns the permanent URL the launch writes onchain. */
export async function POST(req: Request) {
  const guard = await requireUser(req);
  if (guard.error) return guard.error;
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof Blob)) return NextResponse.json({ error: "Pick an image" }, { status: 400 });
  if (!TYPES.includes(file.type)) return NextResponse.json({ error: "Use a PNG, JPG, WebP or GIF" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image is over 1 MB" }, { status: 400 });
  const data = Buffer.from(await file.arrayBuffer());
  const id = createHash("sha256").update(data).digest("hex").slice(0, 32);
  await sql`INSERT INTO launch_logos (id, mime, data, uploaded_by) VALUES (${id}, ${file.type}, ${data}, ${guard.userId}) ON CONFLICT (id) DO NOTHING`;
  return NextResponse.json({ url: `${SITE}/api/launch/logo/${id}` });
}
