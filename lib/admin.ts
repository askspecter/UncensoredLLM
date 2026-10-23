import { NextResponse } from "next/server";
import { requireUser } from "./auth";

// Comma-separated Privy user ids (did:privy:…) allowed to manage payouts. Shown on the Account page.
const ADMINS = new Set((process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean));

export async function requireAdmin(req: Request) {
  const auth = await requireUser(req);
  if (auth.error) return auth;
  if (!ADMINS.has(auth.userId)) return { error: NextResponse.json({ error: "Admins only" }, { status: 403 }) };
  return auth;
}
