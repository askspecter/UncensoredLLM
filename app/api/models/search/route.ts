import { NextResponse } from "next/server";
import { longtailCount, searchLongtail } from "@/lib/longtail";

/** GET ?q=llama+70b&offset=0&uncensored=1 → open models from the long tail, 50 at a time. */
export function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const q = (u.get("q") ?? "").slice(0, 100);
  const offset = Math.max(0, Math.min(100_000, Number(u.get("offset")) || 0));
  const { total, models } = searchLongtail(q, offset, 50, u.get("uncensored") === "1");
  return NextResponse.json({
    count: longtailCount(), total,
    models: models.map((m) => ({ id: m.id, name: m.name, provider: m.provider, context: m.context, input: m.input, output: m.output, uncensored: m.uncensored, tags: m.tags })),
  }, { headers: { "cache-control": "public, s-maxage=300" } });
}
