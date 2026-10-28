import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { authorizeUrl, featherlessOAuth } from "@/lib/featherless";

/** POST → { url }: the Featherless consent page, with a one-time state tied to this account. */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  if (!featherlessOAuth) return NextResponse.json({ error: "Featherless is not configured yet" }, { status: 503 });
  return NextResponse.json({ url: await authorizeUrl(auth.userId) });
}
