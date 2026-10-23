import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { attachReferral } from "@/lib/affiliate";

/** Called after sign-in with the referral code remembered in the browser. */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const { code } = await req.json().catch(() => ({}));
  if (typeof code !== "string" || !/^[a-z0-9]{3,20}$/i.test(code)) return NextResponse.json({ attached: false });
  return NextResponse.json({ attached: await attachReferral(auth.userId, code) });
}
