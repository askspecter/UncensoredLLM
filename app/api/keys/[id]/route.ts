import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const { id } = await params;
  const rows = await sql`UPDATE api_keys SET revoked_at = now() WHERE id = ${id} AND user_id = ${auth.userId} AND revoked_at IS NULL RETURNING id`;
  if (!rows.length) return NextResponse.json({ error: "Key not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
