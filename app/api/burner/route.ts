import { NextResponse } from "next/server";
import { dbEnabled } from "@/lib/db";
import { createBurner } from "@/lib/burner";

/** Creates an anonymous burner account and returns its key once. It holds no balance until a USDG order is paid. */
export async function POST() {
  if (!dbEnabled) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const { key } = await createBurner();
  return NextResponse.json({ key }, { status: 201 });
}
