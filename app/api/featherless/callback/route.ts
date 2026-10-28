import { NextResponse } from "next/server";
import { finishAuthorization } from "@/lib/featherless";

/** Featherless sends the browser back here with ?code&state, or ?error=access_denied. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const back = (result: string) => NextResponse.redirect(new URL(`/dashboard?featherless=${result}`, u.origin));
  if (u.searchParams.get("error")) return back(u.searchParams.get("error") === "access_denied" ? "denied" : "error");
  const code = u.searchParams.get("code"), state = u.searchParams.get("state");
  if (!code || !state) return back("error");
  try {
    await finishAuthorization(state, code);
    return back("connected");
  } catch (e) {
    console.error("[featherless] callback failed", (e as Error).message);
    return back("error");
  }
}
