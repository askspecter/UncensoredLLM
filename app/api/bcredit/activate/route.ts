import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { activate } from "@/lib/bcredit";

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const amount = await activate(auth.userId);
  if (!amount) return NextResponse.json({ error: "No bCREDIT to activate yet" }, { status: 400 });
  return NextResponse.json({ activated: amount });
}
