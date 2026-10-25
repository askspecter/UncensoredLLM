import { NextResponse } from "next/server";
import { dbEnabled } from "@/lib/db";
import { recentRoots } from "@/lib/bills";
import { RECEIPT_SIGNER } from "@/lib/receipts";

/** Who signs receipts, and the daily roots already written on chain. */
export async function GET() {
  return NextResponse.json({ signer: RECEIPT_SIGNER, roots: dbEnabled ? await recentRoots() : [] });
}
