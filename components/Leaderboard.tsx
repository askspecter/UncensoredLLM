"use client";
import { useState } from "react";

type Row = { handle: string; value: number; count: number };
const MEDAL = ["text-[#f5c451]", "text-[#c9ccd1]", "text-[#d08a5a]"];
const fmtTokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${n}`);

export default function Leaderboard({ buyers, users }: { buyers: Row[]; users: Row[] }) {
  const TABS = [
    { key: "buyers", label: "Top buyers", rows: buyers, vol: "Credit bought", cnt: "Purchases", fmt: (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}` },
    { key: "users", label: "Top users", rows: users, vol: "Tokens", cnt: "Requests", fmt: fmtTokens },
  ];
  const [tab, setTab] = useState(TABS[0].key);
  const t = TABS.find((x) => x.key === tab)!;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {TABS.map((x) => (
          <button key={x.key} onClick={() => setTab(x.key)}
            className={`rounded-full border px-4 py-2 text-sm ${tab === x.key ? "border-ember bg-ember/10" : "border-line text-mute hover:text-bone"}`}>{x.label}</button>
        ))}
      </div>
      {t.rows.length === 0 ? (
        <p className="card mt-6 p-8 text-center text-mute">No activity in the last 30 days yet — be the first.</p>
      ) : (
        <>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {t.rows.slice(0, 3).map((r, i) => (
              <div key={r.handle} className="card p-6">
                <p className={`font-serif text-5xl ${MEDAL[i]}`}>#{i + 1}</p>
                <p className="mt-3 font-mono">{r.handle}</p>
                <p className="mt-1 text-2xl">{t.fmt(r.value)}</p>
                <p className="text-xs text-mute">{t.vol.toLowerCase()} · 30d</p>
              </div>
            ))}
          </div>
          <div className="card mt-4 overflow-x-auto">
            <table className="w-full min-w-[480px] font-mono text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-mute">
                <tr><th className="p-4">Rank</th><th className="p-4">Handle</th><th className="p-4 text-right">{t.vol}</th><th className="p-4 text-right">{t.cnt}</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {t.rows.map((r, i) => (
                  <tr key={r.handle} className="hover:bg-panel-2/60">
                    <td className={`p-4 ${MEDAL[i] ?? "text-mute"}`}>{i + 1}</td>
                    <td className="p-4">{r.handle}</td>
                    <td className="p-4 text-right">{t.fmt(r.value)}</td>
                    <td className="p-4 text-right text-mute">{r.count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
