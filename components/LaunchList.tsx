"use client";
import { useEffect, useState } from "react";
import { findModel } from "@/lib/data";

export type LaunchCoin = {
  id: number; token: string; creator: string; model: string; name: string; symbol: string; logo: string;
  description: string; tax_bps: number; created_at: string; paid: number; harvests: number; holders: number | null;
};

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function CoinLogo({ coin, size = 52 }: { coin: Pick<LaunchCoin, "logo" | "symbol">; size?: number }) {
  const [broken, setBroken] = useState(false);
  return coin.logo && !broken
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={coin.logo} alt="" width={size} height={size} onError={() => setBroken(true)} className="shrink-0 rounded-lg border border-line object-cover" style={{ width: size, height: size }} />
    : <span className="grid shrink-0 place-items-center rounded-lg border border-line bg-ink font-serif text-ember" style={{ width: size, height: size, fontSize: size * 0.45 }}>{coin.symbol.slice(0, 2) || "?"}</span>;
}

/** Every coin on the launchpad, newest first, with what it has paid its holders in AI credit. */
export default function LaunchList() {
  const [data, setData] = useState<{ deployed: boolean; coins: LaunchCoin[] } | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/launch").then((r) => r.json()).then((d) => (d.error ? setErr(d.error) : setData(d))).catch(() => setErr("Network busy, try again"));
  }, []);

  if (err) return <p className="text-sm text-danger">{err}</p>;
  if (!data) return <p className="text-sm text-mute">Loading coins…</p>;
  if (!data.deployed) return <p className="card p-6 text-sm text-mute">The launchpad contracts are being deployed. Coins will show up here the moment the first one launches.</p>;
  if (!data.coins.length) return (
    <div className="card p-8 text-center">
      <p className="text-lg font-semibold text-bone">No coins yet.</p>
      <p className="mt-2 text-sm text-mute">Be the first. Pick a model, launch, and every trade pays your holders in AI.</p>
      <a href="/launch/new" className="btn btn-primary mt-5">Launch the first coin</a>
    </div>
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {data.coins.map((c) => {
        const m = findModel(c.model);
        return (
          <a key={c.token} href={`/launch/coin/${c.token}`} className="card min-w-0 p-5 transition hover:border-ember">
            <div className="flex items-center gap-3">
              <CoinLogo coin={c} />
              <div className="min-w-0">
                <p className="truncate font-semibold text-bone">{c.name || "Unnamed"}</p>
                <p className="font-mono text-xs text-mute">${c.symbol}</p>
              </div>
            </div>
            <p className="mt-4 truncate rounded border border-line px-2 py-1 font-mono text-[11px] text-ember-soft">{m ? m.name : c.model}</p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div><p className="text-mute">Paid to holders</p><p className="mt-0.5 font-serif text-2xl text-ember">{usd(c.paid)}</p></div>
              <div><p className="text-mute">Holders earning</p><p className="mt-0.5 font-serif text-2xl text-bone">{c.holders ?? 0}</p></div>
            </div>
          </a>
        );
      })}
    </div>
  );
}
