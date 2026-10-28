"use client";
import { useEffect, useState } from "react";

type Hit = { id: string; name: string; provider: string; context: string; uncensored: boolean };

/** Search box over the open-model long tail (/api/models/search). */
export default function OpenModelPicker({ onPick, onClose }: { onPick: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [unc, setUnc] = useState(false);
  const [res, setRes] = useState<{ total: number; models: Hit[] } | null>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await fetch(`/api/models/search?q=${encodeURIComponent(q)}${unc ? "&uncensored=1" : ""}`).catch(() => null);
      if (r?.ok) setRes(await r.json());
    }, 250);
    return () => clearTimeout(t);
  }, [q, unc]);

  return (
    <div className="border-b border-line bg-ink px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search open models, e.g. llama 70b, qwen coder, abliterated"
          className="min-w-0 flex-1 rounded border border-line bg-panel px-3 py-1.5 text-sm outline-none focus:border-ember" />
        <label className="flex items-center gap-1.5 text-xs text-mute"><input type="checkbox" checked={unc} onChange={(e) => setUnc(e.target.checked)} className="accent-ember" />uncensored</label>
        <button type="button" onClick={onClose} className="rounded border border-line px-2 py-1 text-xs text-mute hover:text-bone">Close</button>
      </div>
      <p className="mt-2 text-[11px] text-mute">
        {res ? `${res.total.toLocaleString("en-US")} matches.` : "Searching…"} Open models run on your own Featherless plan. Connect it on your <a href="/dashboard" className="underline">account page</a>.
      </p>
      <ul className="mt-2 max-h-64 divide-y divide-line overflow-y-auto rounded border border-line">
        {res?.models.map((m) => (
          <li key={m.id}>
            <button type="button" onClick={() => onPick(m.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-panel">
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-bone">{m.provider}/<span className="text-ember-soft">{m.name}</span></span>
              {m.uncensored && <span className="shrink-0 rounded bg-ember/15 px-1.5 py-0.5 text-[10px] text-ember-soft">UNCENSORED</span>}
              <span className="shrink-0 font-mono text-[11px] text-mute">{m.context}</span>
            </button>
          </li>
        ))}
        {res && res.models.length === 0 && <li className="px-3 py-4 text-center text-xs text-mute">No open models match.</li>}
      </ul>
    </div>
  );
}
