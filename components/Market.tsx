"use client";
import { useEffect, useState } from "react";

const usd0 = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
type Band = { from: number; to: number; liquidity: number; offers: number };
type Buy = { who: string; credit: number; discount: number; at: string };

function usePoll<T>(url: string, initial: T, ms = 15000) {
  const [data, setData] = useState<T>(initial);
  useEffect(() => {
    let alive = true;
    const load = () => fetch(url).then((r) => r.json()).then((d) => alive && setData(d)).catch(() => {});
    load();
    const t = setInterval(load, ms);
    return () => { alive = false; clearInterval(t); };
  }, [url, ms]);
  return data;
}

function ago(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`;
}

export function LiquidityBook() {
  const book = usePoll<{ house: number; bands: Band[] }>("/api/book", { house: 0.1, bands: [] });
  const listed = book.bands.reduce((s, b) => s + b.liquidity, 0);
  const max = Math.max(...book.bands.map((b) => b.liquidity), 1);
  return (
    <div className="card p-6">
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">Order book</p>
        <span className="font-mono text-xs text-mute">{usd0(listed)} listed by users</span>
      </div>
      <ul className="mt-5 space-y-2.5">
        {book.bands.map((b) => (
          <li key={b.from} className="grid grid-cols-[4.5rem_1fr_5.5rem] items-center gap-3 font-mono text-sm">
            <span className="text-moss">−{Math.round(b.from * 100)}%</span>
            <span className="h-2 overflow-hidden rounded bg-panel-2">
              <span className="block h-full rounded-full bg-gradient-to-r from-ember to-ember-soft" style={{ width: `${(b.liquidity / max) * 100}%` }} />
            </span>
            <span className="text-right text-mute">{usd0(b.liquidity)}</span>
          </li>
        ))}
        <li className="grid grid-cols-[4.5rem_1fr_5.5rem] items-center gap-3 font-mono text-sm">
          <span className="text-moss">−{Math.round(book.house * 100)}%</span>
          <span className="text-xs text-mute">Beeper · always available</span>
          <span className="text-right text-mute">∞</span>
        </li>
      </ul>
      <p className="mt-4 text-xs text-mute">
        Orders fill from the deepest discount first. <a href="/sell" className="text-ember-soft underline">List your unused credit</a> to sell it here.
      </p>
    </div>
  );
}

export function RecentBuys() {
  const buys = usePoll<Buy[]>("/api/recent", []);
  return (
    <div className="card p-6">
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">Recent buys</p>
        <span className="flex items-center gap-1.5 font-mono text-xs text-mute"><span className="h-1.5 w-1.5 animate-pulse rounded bg-moss" />live</span>
      </div>
      {buys.length === 0 ? (
        <p className="mt-5 text-sm text-mute">No purchases yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {buys.map((b, i) => (
            <li key={i} className="flex items-center justify-between gap-3 py-2.5 font-mono text-sm">
              <span className="truncate text-mute">{b.who}</span>
              <span className="shrink-0">{usd0(b.credit)} <span className="text-moss">−{Math.round(b.discount * 100)}%</span></span>
              <span className="w-16 shrink-0 text-right text-xs text-mute">{ago(b.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
