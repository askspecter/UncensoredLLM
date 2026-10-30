import { sql } from "@/lib/db";

/** Serves an uploaded coin logo. Content addressed, so it is cached forever. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{32}$/.test(id)) return new Response("Not found", { status: 404 });
  const [row] = await sql<{ mime: string; data: Buffer }[]>`SELECT mime, data FROM launch_logos WHERE id = ${id}`;
  if (!row) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(row.data), {
    headers: { "content-type": row.mime, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" },
  });
}
