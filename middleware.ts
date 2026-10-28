import { NextResponse, type NextRequest } from "next/server";

// trade.usebeeper.io (any trade.* host) and beeper.trade serve the trading terminal at their root;
// every other path is the same app as usebeeper.io.
export function middleware(req: NextRequest) {
  const host = req.headers.get("host")?.split(":")[0] ?? "";
  if (/^trade\./.test(host) || /(^|\.)beeper\.trade$/.test(host)) return NextResponse.rewrite(new URL("/trade", req.url));
  return NextResponse.next();
}

export const config = { matcher: "/" };
