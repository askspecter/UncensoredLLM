import { NextResponse } from "next/server";
import { dbEnabled } from "@/lib/db";
import { receiptWithProof } from "@/lib/bills";

/** GET /api/receipts/:id?h=<outputHash>: the signed receipt plus its Merkle proof once its day is anchored. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!dbEnabled) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const { id } = await params;
  const h = new URL(req.url).searchParams.get("h") ?? "";
  if (!/^\d+$/.test(id) || !/^0x[0-9a-fA-F]{64}$/.test(h)) return NextResponse.json({ error: "id and h (output hash) required" }, { status: 400 });
  const r = await receiptWithProof(id, h);
  return r ? NextResponse.json(r) : NextResponse.json({ error: "Receipt not found" }, { status: 404 });
}
