import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { claimCashback } from "@/lib/trade-server";

/** POST { intentId, txHash } → pays the swap's fee back as credit, once. */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const body = await req.json().catch(() => ({}));
  try {
    const r = await claimCashback(auth.userId, String(body?.intentId ?? ""), String(body?.txHash ?? ""));
    return NextResponse.json(r, { status: r.ok ? 200 : r.pending ? 202 : 400 });
  } catch (e) {
    console.error("[trade/claim]", e);
    return NextResponse.json({ ok: false, error: "Network busy, retrying…", pending: true }, { status: 202 });
  }
}
