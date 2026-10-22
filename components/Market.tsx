"use client";
import { useEffect, useState } from "react";
import { LIQUIDITY } from "@/lib/data";

const usd0 = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const ANON = ["anon", "0x", "ghost", "null", "shade", "noir", "void", "wisp"];

type Buy = { id: number; who: string; credit: number; discount: number; ago: number };

function randomBuy(id: number): Buy {
  const tiers = [0.5, 0.45, 0.4, 0.35, 0.3];
  return {
    id,
    who: `${ANON[Math.floor(Math.random() * ANON.length)]}_${Math.random().toString(16).slice(2, 6)}`,
    credit: [10, 25, 50, 100, 250, 500, 1200][Math.floor(Math.random() * 7)],
    discount: tiers[Math.floor(Math.random() * tiers.length)],
    ago: 0,
  };
}

export function LiquidityBook() {
  const book = LIQUIDITY.filter((t) => t.discount > 0);
  const max = Math.max(...book.map((t) => t.available));
  return (
    <div className="card p-6">
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">Liquidity book</p>
        <span className="font-mono text-xs text-mute">{usd0(book.reduce((s, t) => s + t.available, 0))} listed</span>
      </div>
      <ul className="mt-5 space-y-2.5">
        {book.map((t) => (
          <li key={t.discount} className="grid grid-cols-[4rem_1fr_5.5rem] items-center gap-3 font-mono text-sm">
            <span className="text-moss">−{Math.round(t.discount * 100)}%</span>
            <span className="h-2 overflow-hidden rounded-full bg-panel-2">
              <span className="block h-full rounded-full bg-gradient-to-r from-ember to-ember-soft" style={{ width: `${(t.available / max) * 100}%` }} />
            </span>
            <span className="text-right text-mute">{usd0(t.available)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-mute">Orders fill from the deepest discount first. Remaining demand fills at list price.</p>
    </div>
  );
}

export function LiveFeed() {
  const [buys, setBuys] = useState<Buy[]>([]);

  useEffect(() => {
    let id = 0;
    setBuys(Array.from({ length: 6 }, () => ({ ...randomBuy(id++), ago: Math.floor(Math.random() * 50) + 5 })).sort((a, b) => a.ago - b.ago));
    const t = setInterval(() => {
      setBuys((b) => [randomBuy(id++), ...b.map((x) => ({ ...x, ago: x.ago + 4 }))].slice(0, 6));
    }, 4000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="card p-6">
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">Recent buys</p>
        <span className="flex items-center gap-1.5 font-mono text-xs text-mute"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-moss" />live</span>
      </div>
      <ul className="mt-5 divide-y divide-line">
        {buys.map((b) => (
          <li key={b.id} className="slidein flex items-center justify-between py-2.5 font-mono text-sm">
            <span className="text-mute">{b.who}</span>
            <span>{usd0(b.credit)} <span className="text-moss">−{Math.round(b.discount * 100)}%</span></span>
            <span className="w-14 text-right text-xs text-mute">{b.ago}s ago</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
