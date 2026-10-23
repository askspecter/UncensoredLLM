"use client";
import { useState } from "react";

type Row = { handle: string; value: number; count: number };
const MEDAL = ["text-warn", "text-[#c9ccd1]", "text-[#d08a5a]"];
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
            className={`rounded border px-4 py-2 text-sm ${tab === x.key ? "border-ember bg-ember/10" : "border-line text-mute hover:text-bone"}`}>{x.label}</button>
        ))}
      </div>
      {t.rows.length === 0 ? (
        <p className="card mt-6 p-8 text-center text-mute">No activity in the last 30 days yet — be the first.</p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-4">
            {t.rows.slice(0, 3).map((r, i) => (
              <div key={r.handle} className="card min-w-0 p-3 sm:p-6">
                <p className={`font-serif text-3xl sm:text-5xl ${MEDAL[i]}`}>#{i + 1}</p>
                <p className="mt-2 truncate font-mono text-xs sm:mt-3 sm:text-base">{r.handle}</p>
                <p className="mt-1 truncate text-sm sm:text-2xl">{t.fmt(r.value)}</p>
                <p className="hidden text-xs text-mute sm:block">{t.vol.toLowerCase()} · 30d</p>
              </div>
            ))}
          </div>
          <div className="card mt-4 overflow-x-auto">
            <table className="w-full font-mono text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-mute">
                <tr><th className="p-3 sm:p-4">#</th><th className="p-3 sm:p-4">Handle</th><th className="p-3 text-right sm:p-4">{t.vol}</th><th className="hidden p-4 text-right sm:table-cell">{t.cnt}</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {t.rows.map((r, i) => (
                  <tr key={r.handle} className="hover:bg-panel-2/60">
                    <td className={`p-3 sm:p-4 ${MEDAL[i] ?? "text-mute"}`}>{i + 1}</td>
                    <td className="max-w-[9rem] truncate p-3 sm:max-w-none sm:p-4">{r.handle}</td>
                    <td className="p-3 text-right sm:p-4">{t.fmt(r.value)}</td>
                    <td className="hidden p-4 text-right text-mute sm:table-cell">{r.count.toLocaleString()}</td>
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
