"use client";
import { useMemo, useState } from "react";
import { fullRangeLiquidity, simulate, sqrtPriceFromAmounts, type HookConfig, type Swap } from "@/lib/hook-sim";

const E18 = BigInt(10) ** BigInt(18);
const E6 = BigInt(1_000_000);
type Row = { min: number; buy: boolean; amount: number }; // amount: USDG for buys, BEEP for sells

const SCENARIOS: Record<string, Row[]> = {
  "Whale at launch": [
    { min: 0.5, buy: true, amount: 50 }, { min: 2, buy: true, amount: 120 }, { min: 4, buy: false, amount: 400_000 },
    { min: 6, buy: true, amount: 80 }, { min: 8, buy: true, amount: 2_500 }, { min: 11, buy: false, amount: 900_000 },
    { min: 15, buy: true, amount: 300 }, { min: 22, buy: false, amount: 1_500_000 }, { min: 40, buy: true, amount: 450 },
  ],
  "First day": [
    { min: 1, buy: true, amount: 200 }, { min: 20, buy: true, amount: 450 }, { min: 45, buy: false, amount: 2_000_000 },
    { min: 70, buy: true, amount: 1_500 }, { min: 180, buy: false, amount: 5_000_000 }, { min: 300, buy: true, amount: 800 },
    { min: 600, buy: false, amount: 3_000_000 }, { min: 900, buy: true, amount: 2_000 }, { min: 1300, buy: false, amount: 8_000_000 },
  ],
};

const fmtUsd = (n: number) => (n < 0.01 && n > 0 ? `$${n.toFixed(4)}` : `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
const fmtBeep = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtTime = (s: number) => `+${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function Num({ label, value, onChange, step = 1, suffix }: { label: string; value: number; onChange: (n: number) => void; step?: number; suffix?: string }) {
  return (
    <label className="block min-w-0">
      <span className="text-xs text-mute">{label}</span>
      <span className="mt-1 flex items-center rounded-md border border-line bg-ink px-3 focus-within:border-ember">
        <input type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
          className="w-full min-w-0 bg-transparent py-2 font-mono text-sm outline-none" />
        {suffix && <span className="shrink-0 text-xs text-mute">{suffix}</span>}
      </span>
    </label>
  );
}

export default function HookSim() {
  const [scenario, setScenario] = useState("Whale at launch");
  const [rows, setRows] = useState<Row[]>(SCENARIOS["Whale at launch"]);
  const [price, setPrice] = useState(0.00003);
  const [seedBeep, setSeedBeep] = useState(10_000_000);
  const [base, setBase] = useState(1);
  const [launch, setLaunch] = useState(5);
  const [windowMin, setWindowMin] = useState(60);
  const [cap, setCap] = useState(500);

  const pick = (name: string) => { setScenario(name); setRows(SCENARIOS[name]); };
  const edit = (i: number, patch: Partial<Row>) => { setScenario("Custom"); setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r))); };

  const sim = useMemo(() => {
    try {
      const cfg: HookConfig = {
        baseFeeBps: Math.round(base * 100), launchFeeBps: Math.round(Math.max(launch, base) * 100),
        launchWindow: Math.round(windowMin * 60), maxSwapUsdg: BigInt(Math.round(cap * 1e6)), lpFeePips: 3000,
      };
      const beep = BigInt(Math.round(seedBeep)) * E18;
      const usdg = BigInt(Math.max(1, Math.round(seedBeep * price * 1e6)));
      const p0 = sqrtPriceFromAmounts(beep, usdg);
      const liq = fullRangeLiquidity(p0, beep, usdg);
      const swaps: Swap[] = [...rows].sort((a, b) => a.min - b.min).filter((r) => r.amount > 0).map((r) => ({
        at: Math.round(r.min * 60), buy: r.buy,
        amount: r.buy ? BigInt(Math.round(r.amount * 1e6)) : BigInt(Math.round(r.amount)) * E18,
      }));
      return { results: simulate(cfg, p0, liq, swaps), seedUsdg: Number(usdg) / 1e6 };
    } catch { return null; }
  }, [rows, price, seedBeep, base, launch, windowMin, cap]);

  const results = sim?.results ?? [];
  const toBcredit = results.reduce((s, r) => s + Number(r.toBcredit) / 1e6, 0);
  const burned = results.reduce((s, r) => s + Number(r.burnedBeep / E18), 0);
  const refused = results.filter((r) => r.refused).length;
  const feeUsd = results.map((r) => (r.refused ? 0 : r.buy ? (Number(r.hookFee / BigInt(1e12)) / 1e6) * r.priceAfter : Number(r.hookFee) / 1e6));
  const maxFee = Math.max(...feeUsd, 1e-9);

  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-2 gap-3 border-b border-line p-4 sm:grid-cols-3 lg:grid-cols-6 [&>*]:min-w-0">
        <Num label="Start price" value={price} step={0.000001} onChange={setPrice} suffix="USDG" />
        <Num label="Seed liquidity" value={seedBeep} step={1_000_000} onChange={setSeedBeep} suffix="BEEP" />
        <Num label="Base fee" value={base} step={0.1} onChange={setBase} suffix="%" />
        <Num label="Launch fee" value={launch} step={0.5} onChange={setLaunch} suffix="%" />
        <Num label="Launch window" value={windowMin} onChange={setWindowMin} suffix="min" />
        <Num label="Launch cap" value={cap} step={50} onChange={setCap} suffix="USDG" />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 text-xs">
        <span className="text-mute">Scenario</span>
        {[...Object.keys(SCENARIOS), "Custom"].map((s) => (
          <button key={s} onClick={() => s !== "Custom" && pick(s)}
            className={`rounded border px-2.5 py-1 ${scenario === s ? "border-ember text-bone" : "border-line text-mute hover:text-bone"}`}>{s}</button>
        ))}
        <span className="ml-auto text-mute">Pool seeded with {fmtBeep(seedBeep)} BEEP + {fmtUsd(sim?.seedUsdg ?? 0)}</span>
      </div>

      <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
        {[["Swaps", String(results.length)], ["Refused", String(refused)], ["To bCREDIT", `${fmtUsd(toBcredit)} USDG`], ["Burned", `${fmtBeep(burned)} BEEP`]].map(([l, v]) => (
          <div key={l} className="bg-panel p-4"><p className="text-xs text-mute">{l}</p><p className="mt-1 truncate font-mono text-lg text-bone">{v}</p></div>
        ))}
      </div>

      <div className="border-b border-line p-4">
        <p className="text-xs text-mute">Hook fee per swap, in dollars</p>
        <div className="mt-3 flex h-28 items-end gap-1.5">
          {results.map((r, i) => (
            <div key={i} className="flex h-full flex-1 flex-col justify-end" title={r.refused ? "Refused" : fmtUsd(feeUsd[i])}>
              <div className={`rounded-sm ${r.refused ? "bg-danger" : r.buy ? "bg-moss" : "bg-ember"}`}
                style={{ height: r.refused ? 4 : `${Math.max(3, (feeUsd[i] / maxFee) * 100)}%` }} />
            </div>
          ))}
        </div>
        <p className="mt-2 flex gap-4 text-[11px] text-mute">
          <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-ember" />USDG to bCREDIT</span>
          <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-moss" />BEEP burned</span>
          <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-danger" />Refused</span>
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left font-mono text-[11px] uppercase tracking-wider text-mute">
            <tr><th className="p-3">#</th><th className="p-3">Time</th><th className="p-3">Side</th><th className="p-3">Amount in</th><th className="p-3">Hook fee</th><th className="p-3">Goes to</th><th className="p-3">Result</th></tr>
          </thead>
          <tbody className="divide-y divide-line font-mono text-xs">
            {results.map((r, i) => (
              <tr key={i}>
                <td className="p-3 text-mute">{i + 1}</td>
                <td className="p-3 text-mute">{fmtTime(r.at)}</td>
                <td className="p-3">{r.buy ? "Buy" : "Sell"}</td>
                <td className="p-3">{r.buy ? `${(Number(r.amount) / 1e6).toLocaleString()} USDG` : `${fmtBeep(Number(r.amount / E18))} BEEP`}</td>
                <td className="p-3">{r.refused ? "n/a" : `${(r.feeBps / 100).toFixed(2)}%`}</td>
                <td className="p-3">{r.refused ? "n/a" : r.buy ? `${fmtBeep(Number(r.burnedBeep / E18))} BEEP burned` : `${fmtUsd(Number(r.toBcredit) / 1e6)} to bCREDIT`}</td>
                <td className={`p-3 ${r.refused ? "text-danger" : "text-mute"}`}>{r.refused ? "Refused, over the launch cap" : "Swapped"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t border-line p-4">
        <p className="text-xs text-mute">Edit swaps (minutes after launch, side, amount)</p>
        <div className="mt-2 space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="number" value={r.min} onChange={(e) => edit(i, { min: Number(e.target.value) })} className="w-20 rounded border border-line bg-ink px-2 py-1.5 font-mono text-xs outline-none focus:border-ember" />
              <button onClick={() => edit(i, { buy: !r.buy, amount: r.buy ? 500_000 : 100 })} className="w-14 rounded border border-line py-1.5 text-xs">{r.buy ? "Buy" : "Sell"}</button>
              <input type="number" value={r.amount} onChange={(e) => edit(i, { amount: Number(e.target.value) })} className="min-w-0 flex-1 rounded border border-line bg-ink px-2 py-1.5 font-mono text-xs outline-none focus:border-ember" />
              <span className="w-12 text-[11px] text-mute">{r.buy ? "USDG" : "BEEP"}</span>
              <button onClick={() => { setScenario("Custom"); setRows((rs) => rs.filter((_, j) => j !== i)); }} className="text-xs text-mute hover:text-danger">✕</button>
            </div>
          ))}
        </div>
        <button onClick={() => { setScenario("Custom"); setRows((rs) => [...rs, { min: (rs.at(-1)?.min ?? 0) + 5, buy: true, amount: 100 }]); }} className="mt-3 text-xs text-ember-soft underline">Add swap</button>
      </div>
      <p className="border-t border-line p-4 text-[11px] text-mute">
        Same integer math as the contract and the Uniswap v4 pool (0.30% LP fee, full-range liquidity). Before publishing, we ran 10 swaps through the real hook on a fork of Robinhood Chain mainnet: every number matched.
      </p>
    </div>
  );
}
