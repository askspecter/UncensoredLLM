import PageHeader from "@/components/PageHeader";
import { dbEnabled, sql } from "@/lib/db";
import { gatewayEnabled } from "@/lib/gateway";
import { latestBlock, usdgEnabled } from "@/lib/usdg";
import { whopEnabled } from "@/lib/whop";

export const metadata = { title: "Status — Beeper" };
export const revalidate = 60;

type Check = { name: string; ok: boolean; detail: string };

async function timed(fn: () => Promise<unknown>) {
  const t = Date.now();
  try { await fn(); return { ok: true, ms: Date.now() - t }; } catch { return { ok: false, ms: Date.now() - t }; }
}

async function checks(): Promise<Check[]> {
  const [db, chain, upstream] = await Promise.all([
    dbEnabled ? timed(() => sql`SELECT 1`) : null,
    timed(() => latestBlock()),
    gatewayEnabled ? timed(async () => { const r = await fetch("https://openrouter.ai/api/v1/models", { cache: "no-store" }); if (!r.ok) throw new Error(); }) : null,
  ]);
  return [
    { name: "API gateway", ok: Boolean(upstream?.ok), detail: !gatewayEnabled ? "not configured" : upstream?.ok ? `model provider reachable · ${upstream.ms} ms` : "model provider unreachable" },
    { name: "Accounts & billing database", ok: Boolean(db?.ok), detail: !db ? "not configured" : db.ok ? `${db.ms} ms` : "unreachable" },
    { name: "Robinhood Chain (USDG payments)", ok: chain.ok && usdgEnabled, detail: !usdgEnabled ? "treasury address not configured" : chain.ok ? `RPC ${chain.ms} ms` : "RPC unreachable" },
    { name: "Card payments (Whop)", ok: whopEnabled, detail: whopEnabled ? "configured" : "not configured" },
    { name: "Sign-in (Privy)", ok: Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID), detail: process.env.NEXT_PUBLIC_PRIVY_APP_ID ? "configured" : "not configured" },
  ];
}

export default async function Status() {
  const list = await checks();
  const allOk = list.every((c) => c.ok);
  return (
    <main className="mx-auto max-w-4xl px-5 pt-16">
      <PageHeader eyebrow="System status" title={allOk ? "All systems paging." : "Some systems need attention."} />
      <div className={`card mt-8 flex items-center gap-3 p-5 ${allOk ? "border-moss/40" : "border-warn/40"}`}>
        <span className={`h-2.5 w-2.5 animate-pulse rounded-full ${allOk ? "bg-moss" : "bg-warn"}`} />
        <span>{allOk ? "All systems operational" : "Degraded"}</span>
        <span className="ml-auto font-mono text-xs text-mute">checked {new Date().toISOString().slice(11, 16)} UTC</span>
      </div>
      <div className="card mt-4 divide-y divide-line">
        {list.map((c) => (
          <div key={c.name} className="flex items-center justify-between gap-4 p-5 text-sm">
            <span className="flex items-center gap-3"><span className={`h-2 w-2 shrink-0 rounded-full ${c.ok ? "bg-moss" : "bg-warn"}`} />{c.name}</span>
            <span className="text-right font-mono text-xs text-mute">{c.detail}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
