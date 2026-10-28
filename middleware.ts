import { NextResponse, type NextRequest } from "next/server";

// beeper.trade serves the trading terminal at its root; every other path is the same app as usebeeper.io.
export function middleware(req: NextRequest) {
  const host = req.headers.get("host")?.split(":")[0] ?? "";
  if (/(^|\.)beeper\.trade$/.test(host)) return NextResponse.rewrite(new URL("/trade", req.url));
  return NextResponse.next();
}

export const config = { matcher: "/" };
