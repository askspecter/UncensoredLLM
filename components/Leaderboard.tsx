"use client";
import { useState } from "react";
import { leaderboard } from "@/lib/stats";

const TABS = [
  { key: "buyers", label: "Top buyers", vol: "Credit bought", cnt: "Purchases" },
  { key: "sellers", label: "Top sellers", vol: "Credit sold", cnt: "Orders filled" },
  { key: "affiliates", label: "Top affiliates", vol: "Earned", cnt: "Referrals" },
] as const;
const DATA = { buyers: leaderboard("buyers", 3), sellers: leaderboard("sellers", 5), affiliates: leaderboard("affiliates", 9) };
const MEDAL = ["text-[#f5c451]", "text-[#c9ccd1]", "text-[#d08a5a]"];

export default function Leaderboard() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("buyers");
  const t = TABS.find((x) => x.key === tab)!;
  const rows = DATA[tab];
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {TABS.map((x) => (
          <button key={x.key} onClick={() => setTab(x.key)}
            className={`rounded-full border px-4 py-2 text-sm ${tab === x.key ? "border-ember bg-ember/10" : "border-line text-mute hover:text-bone"}`}>{x.label}</button>
        ))}
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {rows.slice(0, 3).map((r, i) => (
          <div key={r.handle} className="card p-6">
            <p className={`font-serif text-5xl ${MEDAL[i]}`}>#{i + 1}</p>
            <p className="mt-3 font-mono">{r.handle}</p>
            <p className="mt-1 text-2xl">${r.volume.toLocaleString()}</p>
            <p className="text-xs text-mute">{t.vol.toLowerCase()} · 30d</p>
          </div>
        ))}
      </div>
      <div className="card mt-4 overflow-x-auto">
        <table className="w-full min-w-[520px] font-mono text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-mute">
            <tr><th className="p-4">Rank</th><th className="p-4">Handle</th><th className="p-4 text-right">{t.vol}</th><th className="p-4 text-right">{t.cnt}</th>{tab === "buyers" && <th className="p-4 text-right">Avg. saved</th>}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r, i) => (
              <tr key={r.handle} className="hover:bg-panel-2/60">
                <td className={`p-4 ${MEDAL[i] ?? "text-mute"}`}>{i + 1}</td>
                <td className="p-4">{r.handle}</td>
                <td className="p-4 text-right">${r.volume.toLocaleString()}</td>
                <td className="p-4 text-right text-mute">{r.count}</td>
                {tab === "buyers" && <td className="p-4 text-right text-moss">{Math.round(r.saved * 100)}%</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
