"use client";
import { useMemo, useState } from "react";
import { MODELS } from "@/lib/data";

const fmt = (n: number) => (n === 0 ? "—" : `$${n.toFixed(2)}`);
const FILTERS = ["all", "uncensored", "roleplay", "reasoning", "code", "agents"] as const;

export default function ModelTable() {
  const [q, setQ] = useState("");
  const [f, setF] = useState<(typeof FILTERS)[number]>("all");

  const rows = useMemo(() => MODELS.filter((m) => {
    const hit = (m.name + m.provider + m.id).toLowerCase().includes(q.toLowerCase());
    const tag = f === "all" || (f === "uncensored" ? m.uncensored : m.tags.includes(f));
    return hit && tag;
  }), [q, f]);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search models…"
          className="w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-ember sm:max-w-xs" />
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((x) => (
            <button key={x} onClick={() => setF(x)}
              className={`rounded border px-3 py-1 text-xs capitalize ${f === x ? "border-ember text-bone" : "border-line text-mute hover:text-bone"}`}>{x}</button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left font-mono text-[11px] uppercase tracking-wider text-mute">
            <tr><th className="p-4">Model</th><th className="p-4">Context</th><th className="p-4">Input / 1M</th><th className="p-4">Output / 1M</th><th className="p-4">Tags</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((m) => (
              <tr key={m.id} className="hover:bg-panel-2/60">
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    {m.name}
                    {m.uncensored && <span className="rounded bg-ember/15 px-1.5 py-0.5 font-mono text-[10px] text-ember-soft">UNCENSORED</span>}
                  </div>
                  <div className="font-mono text-xs text-mute">{m.id}</div>
                </td>
                <td className="p-4 text-mute">{m.context}</td>
                <td className="p-4 font-mono">{fmt(m.input)}</td>
                <td className="p-4 font-mono">{fmt(m.output)}</td>
                <td className="p-4 text-xs text-mute">{m.tags.join(" · ")}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-mute">No models match.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
