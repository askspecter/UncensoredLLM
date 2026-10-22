"use client";
import { useState } from "react";
import type { Day } from "@/lib/stats";

const COLORS = ["#e5484d", "#ff9b8f", "#7a5b55", "#4cc38a"];
const RANGES = [7, 14, 30] as const;

export default function BarChart({ title, data, keys, format = "usd" }: { title: string; data: Day[]; keys: string[]; format?: "usd" | "num" }) {
  const [range, setRange] = useState<number>(14);
  const [hover, setHover] = useState<number | null>(null);
  const rows = data.slice(-range);
  const totals = rows.map((d) => keys.reduce((s, k) => s + d.values[k], 0));
  const max = Math.max(...totals);
  const sum = totals.reduce((a, b) => a + b, 0);
  const fmt = (n: number) => format === "usd" ? (n >= 1000 ? `$${(n / 1000).toFixed(2)}K` : `$${n}`) : n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n.toLocaleString();
  const shown = hover ?? rows.length - 1;

  return (
    <div className="card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-mute">{title}</p>
          <p className="mt-1 font-serif text-4xl">{fmt(sum)}</p>
          <p className="font-mono text-[11px] text-mute">last {range} days</p>
        </div>
        <div className="flex rounded-full border border-line p-0.5 font-mono text-xs">
          {RANGES.map((r) => (
            <button key={r} onClick={() => setRange(r)} className={`rounded-full px-2.5 py-1 ${range === r ? "bg-panel-2 text-bone" : "text-mute"}`}>{r}D</button>
          ))}
        </div>
      </div>
      <div className="mt-6 flex h-40 items-end gap-[3px]" onMouseLeave={() => setHover(null)}>
        {rows.map((d, i) => (
          <div key={d.date} className="flex h-full flex-1 flex-col justify-end" onMouseEnter={() => setHover(i)}>
            {keys.map((k, j) => (
              <div key={k} style={{ height: `${(d.values[k] / max) * 100}%`, background: COLORS[j], opacity: hover === null || hover === i ? 1 : 0.45 }}
                className={j === keys.length - 1 ? "rounded-t-sm" : ""} />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 font-mono text-xs">
        <span className="text-mute">{rows[shown].date}</span>
        <div className="flex flex-wrap gap-3">
          {keys.map((k, j) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ background: COLORS[j] }} />
              <span className="text-mute">{k}</span> {fmt(rows[shown].values[k])}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
