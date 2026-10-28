import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { disconnect, linkStatus } from "@/lib/featherless";
import { longtailCount } from "@/lib/longtail";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  return NextResponse.json({ ...(await linkStatus(auth.userId)), models: longtailCount() });
}

export async function DELETE(req: Request) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  await disconnect(auth.userId);
  return NextResponse.json({ connected: false });
}
