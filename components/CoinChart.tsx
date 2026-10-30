"use client";
import { useMemo, useState } from "react";

export type Trade = { tx: string; at: string; side: "buy" | "sell"; wallet: string; usdg: number; tokens: number };

const RANGES = [["1H", 3600e3], ["1D", 86400e3], ["7D", 7 * 86400e3], ["All", Infinity]] as const;
const W = 600, H = 220;

export const fmtUsd = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}K` : `$${n.toFixed(n < 10 ? 2 : 0)}`;
export const fmtPrice = (p: number) => {
  if (!p) return "$0";
  if (p >= 0.01) return `$${p.toFixed(4)}`;
  const zeros = Math.floor(-Math.log10(p)) - 1; // $0.0₅35 style keeps tiny prices readable
  const sub = String(zeros).split("").map((d) => "₀₁₂₃₄₅₆₇₈₉"[+d]).join("");
  return `$0.0${sub}${Math.round(p * 10 ** (zeros + 4)).toString().slice(0, 3)}`;
};

/** Market cap over time from curve trades. Each point is the price a trade filled at, times total supply. */
export default function CoinChart({ trades, supply, launchedAt }: { trades: Trade[]; supply: number | null; launchedAt: string }) {
  const [range, setRange] = useState<(typeof RANGES)[number][0]>("All");
  const [hover, setHover] = useState<number | null>(null);
  const now = Date.now();

  const pts = useMemo(() => {
    const span = RANGES.find(([r]) => r === range)![1];
    const all = trades.filter((t) => t.tokens > 0).map((t) => ({ t: new Date(t.at).getTime(), v: (t.usdg / t.tokens) * (supply ?? 1), side: t.side }));
    const from = span === Infinity ? Math.min(new Date(launchedAt).getTime(), all[0]?.t ?? now) : now - span;
    const inside = all.filter((p) => p.t >= from);
    const before = all.filter((p) => p.t < from).at(-1);
    // Carry the last known value into the window, and hold the latest value up to now.
    const series = [...(before ? [{ ...before, t: from }] : []), ...inside];
    if (series.length) series.push({ ...series[series.length - 1], t: now });
    return { series, from };
  }, [trades, supply, range, launchedAt, now]);

  const s = pts.series;
  const lo = Math.min(...s.map((p) => p.v)), hi = Math.max(...s.map((p) => p.v));
  const pad = (hi - lo) * 0.12 || hi * 0.1 || 1;
  const y = (v: number) => H - 12 - ((v - (lo - pad)) / (hi + pad - (lo - pad))) * (H - 24);
  const x = (t: number) => ((t - pts.from) / Math.max(1, now - pts.from)) * W;
  // Step line: the price holds until the next trade moves it.
  const path = s.map((p, i) => (i === 0 ? `M${x(p.t)},${y(p.v)}` : `H${x(p.t)}V${y(p.v)}`)).join("");
  const first = s[0]?.v ?? 0, last = s.at(-1)?.v ?? 0;
  const change = first ? ((last - first) / first) * 100 : 0;
  const up = change >= 0;
  const shown = hover !== null ? s[hover] : s.at(-1);

  function move(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const t = pts.from + ((e.clientX - r.left) / r.width) * (now - pts.from);
    let i = 0;
    for (let k = 0; k < s.length - 1; k++) if (s[k].t <= t) i = k;
    setHover(i);
  }

  return (
    <div className="card min-w-0 p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] text-mute">{hover !== null && shown ? new Date(shown.t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Market cap"}</p>
          <p className="mt-1 font-serif text-4xl leading-none text-bone">{s.length ? fmtUsd(shown!.v) : "No trades yet"}</p>
          {s.length > 0 && (
            <p className="mt-1.5 font-mono text-xs text-mute">
              <span className={up ? "text-moss" : "text-danger"}>{up ? "+" : ""}{change.toFixed(2)}%</span>
              <span> · {range === "All" ? "since launch" : range} · price {fmtPrice(supply ? shown!.v / supply : 0)}</span>
            </p>
          )}
        </div>
        <div className="flex gap-1 rounded-md border border-line bg-ink p-1 text-xs">
          {RANGES.map(([r]) => (
            <button key={r} onClick={() => { setRange(r); setHover(null); }} className={`rounded px-2.5 py-1 ${range === r ? "bg-panel-2 text-bone" : "text-mute hover:text-bone"}`}>{r}</button>
          ))}
        </div>
      </div>
      <div className="mt-4">
        {s.length ? (
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-48 w-full touch-none sm:h-56" onPointerMove={move} onPointerLeave={() => setHover(null)}>
            <defs>
              <linearGradient id="cc-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={up ? "var(--color-moss)" : "var(--color-danger)"} stopOpacity=".22" />
                <stop offset="1" stopColor={up ? "var(--color-moss)" : "var(--color-danger)"} stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="var(--color-line)" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />)}
            <path d={`${path}V${H}H${x(s[0].t)}Z`} fill="url(#cc-fill)" />
            <path d={path} fill="none" stroke={up ? "var(--color-moss)" : "var(--color-danger)"} strokeWidth="2" vectorEffect="non-scaling-stroke" />
            {hover !== null && s[hover] && <line x1={x(s[hover].t)} x2={x(s[hover].t)} y1="0" y2={H} stroke="var(--color-mute)" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />}
          </svg>
        ) : (
          <div className="grid h-48 place-items-center rounded-md border border-dashed border-line text-sm text-mute sm:h-56">The chart starts with the first trade.</div>
        )}
      </div>
    </div>
  );
}
