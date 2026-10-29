"use client";
import { useEffect, useState } from "react";
import type { PoolScan } from "@/lib/trade-server";

type Scan = { symbol: string; total: number; empty: number; pools: PoolScan[] };

const pct = (bps: number | null) => (bps === null ? "n/a" : `${(bps / 100).toFixed(bps >= 1000 ? 0 : 2)}%`);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const ZERO = "0x0000000000000000000000000000000000000000";

const BADGE: Record<PoolScan["status"], { label: string; cls: string }> = {
  honest: { label: "honest", cls: "border-moss/40 text-moss" },
  hidden: { label: "hidden fee", cls: "border-danger/50 text-danger" },
  extreme: { label: "extreme fee", cls: "border-danger/50 text-danger" },
  reverts: { label: "blocks swaps", cls: "border-warn/50 text-warn" },
  shallow: { label: "shallow", cls: "border-line text-mute" },
  empty: { label: "empty", cls: "border-line text-mute" },
  new: { label: "new", cls: "border-line text-mute" },
};

// Routed pools first, then the ones worth warning about, then the rest.
const ORDER: PoolScan["status"][] = ["hidden", "extreme", "reverts", "honest", "shallow", "new", "empty"];
const rank = (p: PoolScan) => (p.routed ? -1 : ORDER.indexOf(p.status));
const COLLAPSED = 8;

export default function HookScan({ symbol }: { symbol: string }) {
  const [scan, setScan] = useState<Scan | null>(null);
  const [err, setErr] = useState("");
  const [all, setAll] = useState(false);

  useEffect(() => {
    let live = true;
    setScan(null); setErr(""); setAll(false);
    fetch(`/api/trade/scan?symbol=${symbol}`).then((r) => r.json()).then((d) => {
      if (!live) return;
      if (d.error) setErr(d.error); else setScan(d);
    }).catch(() => live && setErr("Network busy, try again"));
    return () => { live = false; };
  }, [symbol]);

  const count = (s: PoolScan["status"]) => scan?.pools.filter((p) => p.status === s).length ?? 0;
  const at = scan?.pools.find((p) => p.scannedAt)?.scannedAt;
  const sorted = scan ? [...scan.pools].sort((a, b) => rank(a) - rank(b)) : [];
  const shown = all ? sorted : sorted.slice(0, COLLAPSED);

  return (
    <div className="card min-w-0 p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-bone">Hook Scan <span className="font-mono text-sm font-normal text-mute">{symbol} / USDG</span></h2>
        {at && <span className="font-mono text-[11px] text-mute">scanned {new Date(at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</span>}
      </div>

      {!scan && !err && <p className="mt-6 text-sm text-mute">Scanning every {symbol} pool on Robinhood Chain. The first scan can take up to a minute…</p>}
      {err && <p className="mt-6 text-sm text-danger">{err}</p>}

      {scan && (
        <>
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Pools found", scan.total, "text-bone"],
              ["Hidden or extreme fee", count("hidden") + count("extreme"), "text-danger"],
              ["Block swaps", count("reverts"), "text-warn"],
              ["Honest", count("honest"), "text-moss"],
            ].map(([l, v, c]) => (
              <div key={l as string} className="rounded-md border border-line bg-ink p-3">
                <p className={`font-serif text-5xl leading-none ${c}`}>{v}</p>
                <p className="mt-1.5 text-[11px] text-mute">{l}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 hidden grid-cols-[1.4fr_.8fr_.9fr_.8fr_1fr] gap-3 border-b border-line pb-2 text-[11px] text-mute md:grid">
            <span>Pool</span><span className="text-right">Shows</span><span className="text-right">Really costs</span><span className="text-right">Hidden</span><span className="text-right">Verdict</span>
          </div>
          <ul className="divide-y divide-line">
            {shown.map((p) => {
              const b = BADGE[p.status];
              const hidden = p.hiddenBps !== null && p.status === "hidden" ? `+${pct(p.hiddenBps)}` : p.hiddenBps === null ? "n/a" : "0";
              return (
                <li key={p.poolId} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 py-3 text-sm md:grid-cols-[1.4fr_.8fr_.9fr_.8fr_1fr] md:items-center">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs text-bone">
                      {p.hooks === ZERO ? "no hook" : <a className="underline decoration-line hover:text-ember" href={`https://robinhoodchain.blockscout.com/address/${p.hooks}`} target="_blank" rel="noreferrer">hook {short(p.hooks)}</a>}
                      {p.routed && <span className="ml-2 rounded border border-ember px-1.5 py-px text-[10px] text-ember">routed</span>}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-mute">{p.fee === 0x800000 ? "dynamic fee" : `${(p.fee / 10_000).toFixed(2)}% tier`} · {short(p.poolId)}</p>
                  </div>
                  <span className={`row-span-2 self-center justify-self-end rounded border px-2 py-0.5 font-mono text-[11px] md:order-last md:row-span-1 ${b.cls}`}>{b.label}</span>
                  <p className="font-mono text-[11px] text-mute md:hidden">shows {pct(p.declaredBps)} · costs {pct(p.costBps)}{p.status === "hidden" ? ` · hidden ${hidden}` : ""}</p>
                  <span className="hidden text-right font-mono text-xs text-mute md:block">{pct(p.declaredBps)}</span>
                  <span className="hidden text-right font-mono text-xs text-bone md:block">{pct(p.costBps)}</span>
                  <span className={`hidden text-right font-mono text-xs md:block ${p.status === "hidden" ? "text-danger" : "text-mute"}`}>{hidden}</span>
                </li>
              );
            })}
          </ul>
          {sorted.length > COLLAPSED && (
            <button type="button" onClick={() => setAll(!all)} className="mt-2 w-full rounded-md border border-line py-2 text-sm text-mute hover:text-bone">
              {all ? "Show fewer" : `Show all ${sorted.length} pools with liquidity`}
            </button>
          )}
          <p className="mt-4 text-[11px] leading-relaxed text-mute">
            We push a $20 swap through every {symbol} pool that has liquidity and compare what comes out with the pool price.
            Whatever the shown fee and the price impact do not explain is the hidden fee. Swaps on beeper.trade only use pools marked routed.
            {scan.empty > 0 && ` ${scan.empty} empty pools are not listed.`} Rescanned every 15 minutes.
          </p>
        </>
      )}
    </div>
  );
}
