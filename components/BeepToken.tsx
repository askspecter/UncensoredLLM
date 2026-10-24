import { BEEP, beepStats } from "@/lib/token";
import CopyAddress from "./CopyAddress";

const fmt = (n: number) => n.toLocaleString("en-US");
const short = (n: number) => (n >= 1e9 ? `${+(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${+(n / 1e6).toFixed(2)}M` : fmt(n));

export default async function BeepToken() {
  const stats = await beepStats();
  const pct = stats && stats.supply ? (stats.burned / stats.supply) * 100 : null;
  return (
    <div className="card overflow-hidden">
      <div className="grid gap-6 p-6 md:grid-cols-[1.4fr_1fr] md:p-8">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded bg-ember px-2 py-0.5 text-[11px] font-bold text-ink">OFFICIAL</span>
            <span className="text-xs uppercase tracking-wider text-mute">Robinhood Chain</span>
          </div>
          <p className="mt-3 text-sm text-mute">Contract address</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="min-w-0 break-all rounded-lg border border-line bg-ink px-4 py-3 font-mono text-sm text-bone">{BEEP.address}</code>
            <CopyAddress value={BEEP.address} />
          </div>
          <a href={BEEP.explorer} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm text-ember-soft underline">View on Blockscout ↗</a>
          <p className="mt-4 text-xs leading-relaxed text-mute">
            This is the only official $BEEP contract. We never DM first and never ask for your seed phrase. Not financial advice.
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-3 self-start">
          <div className="rounded-lg border border-line bg-ink p-4"><dt className="text-xs text-mute">Ticker</dt><dd className="mt-1 font-serif text-3xl text-ember">$BEEP</dd></div>
          <div className="rounded-lg border border-line bg-ink p-4"><dt className="text-xs text-mute">Total supply</dt><dd className="mt-1 font-serif text-3xl" title={stats ? fmt(stats.supply) : undefined}>{stats ? short(stats.supply) : "1B"}</dd></div>
          <div className="col-span-2 rounded-lg border border-line bg-ink p-4">
            <dt className="text-xs text-mute">Burned forever (sent to 0x…dead)</dt>
            <dd className="mt-1 font-serif text-3xl text-ember">{stats ? fmt(stats.burned) : "n/a"}</dd>
            {pct !== null && <dd className="mt-1 text-xs text-mute">{pct.toFixed(2)}% of total supply</dd>}
          </div>
        </dl>
      </div>
    </div>
  );
}
