export const metadata = { title: "Account — Beeper" };

const DAYS = [12, 18, 9, 22, 31, 27, 40, 35, 44, 38, 52, 47, 61, 58];
const REQS = [
  ["beeper/hermes-4-405b", "1,284", "612", "$0.0024", "41 ms"],
  ["beeper/dolphin-mistral-24b", "3,902", "1,140", "$0.0015", "28 ms"],
  ["beeper/deepseek-v3.2", "820", "2,310", "$0.0019", "35 ms"],
  ["beeper/flux-dev-uncensored", "—", "1 img", "$0.0125", "52 ms"],
  ["beeper/hermes-4-405b", "6,410", "980", "$0.0047", "39 ms"],
];

export default function Dashboard() {
  const max = Math.max(...DAYS);
  return (
    <main className="mx-auto max-w-6xl px-5 pt-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Account · demo data</p>
          <h1 className="mt-2 font-serif text-5xl">Your key, your numbers.</h1>
        </div>
        <a href="/#buy" className="btn btn-primary text-sm">Top up</a>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[["Balance", "$183.40"], ["Saved vs list", "$176.22"], ["Requests (14d)", "12,408"], ["Gateway p95", "47 ms"]].map(([l, v]) => (
          <div key={l} className="card p-5"><p className="text-xs uppercase tracking-wider text-mute">{l}</p><p className="mt-2 font-serif text-3xl">{v}</p></div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="card p-6">
          <p className="eyebrow">Spend by day</p>
          <div className="mt-6 flex h-44 items-end gap-2">
            {DAYS.map((d, i) => (
              <div key={i} className="group relative flex-1">
                <div className="rounded-t bg-gradient-to-t from-ember/50 to-ember-soft" style={{ height: `${(d / max) * 160}px` }} />
                <span className="absolute -top-6 left-1/2 hidden -translate-x-1/2 font-mono text-[10px] text-bone group-hover:block">${(d / 4).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-6">
          <p className="eyebrow">API key</p>
          <code className="mt-4 block rounded-lg border border-line bg-ink p-3 font-mono text-sm text-mute">sk-beeper-••••••••••••••Qx7f</code>
          <ul className="mt-5 space-y-2 text-sm text-mute">
            <li className="flex justify-between"><span>Privacy tier</span><span className="text-bone">Zero retention</span></li>
            <li className="flex justify-between"><span>Rate limit</span><span className="text-bone">600 rpm</span></li>
            <li className="flex justify-between"><span>Recovery phrase</span><span className="text-moss">Saved ✓</span></li>
          </ul>
          <button className="btn btn-ghost mt-5 w-full text-sm">Rotate key</button>
        </div>
      </div>

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left font-mono text-[11px] uppercase tracking-wider text-mute">
            <tr><th className="p-4">Model</th><th className="p-4">In tokens</th><th className="p-4">Out tokens</th><th className="p-4">Cost</th><th className="p-4">Overhead</th></tr>
          </thead>
          <tbody className="divide-y divide-line font-mono">
            {REQS.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={`p-4 ${j ? "text-mute" : ""}`}>{c}</td>)}</tr>)}
          </tbody>
        </table>
        <p className="border-t border-line p-4 text-xs text-mute">Only billing metadata is logged. Prompt and completion content is never stored.</p>
      </div>
    </main>
  );
}
