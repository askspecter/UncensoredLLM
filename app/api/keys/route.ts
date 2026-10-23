import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { createApiKey } from "@/lib/keys";

const MAX_KEYS = 20;

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const keys = await sql`
    SELECT id, name, prefix, created_at, last_used_at FROM api_keys
    WHERE user_id = ${auth.userId} AND revoked_at IS NULL ORDER BY created_at DESC`;
  return NextResponse.json(keys);
}

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim().slice(0, 40) || "Untitled key";
  const [{ count }] = await sql<{ count: string }[]>`SELECT count(*) FROM api_keys WHERE user_id = ${auth.userId} AND revoked_at IS NULL`;
  if (Number(count) >= MAX_KEYS) return NextResponse.json({ error: `Limit of ${MAX_KEYS} active keys` }, { status: 400 });
  return NextResponse.json(await createApiKey(auth.userId, name), { status: 201 });
}
