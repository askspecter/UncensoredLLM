import BarChart from "@/components/BarChart";
import PageHeader from "@/components/PageHeader";
import { BANDS, series } from "@/lib/stats";

export const metadata = { title: "Analytics — Beeper" };

const revenue = series(["Book fees", "Card fees", "Crypto fees"], 30, 4200, 7);
const usage = series(["Text", "Image", "Audio"], 30, 2_400_000_000, 11);
const purchases = series(["Crypto", "Card"], 30, 22, 19);
const spend = series(["Uncensored", "Open", "Frontier"], 30, 1700, 23);

export default function Analytics() {
  const totalLiq = BANDS.reduce((s, b) => s + b.liquidity, 0);
  const totalOrders = BANDS.reduce((s, b) => s + b.orders, 0);
  const maxLiq = Math.max(...BANDS.map((b) => b.liquidity));
  return (
    <main className="mx-auto max-w-6xl px-5 pt-16">
      <PageHeader eyebrow="Analytics · public" title={<>The big picture, <em className="text-ember-soft">in the open.</em></>}
        sub="Live network numbers. We publish volume — never prompts. Updated every minute (demo data).">
        <span className="flex items-center gap-2 font-mono text-xs text-mute"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-moss" />live · UTC</span>
      </PageHeader>

      <p className="eyebrow mt-14">01 · Activity</p>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <BarChart title="Protocol revenue" data={revenue} keys={["Book fees", "Card fees", "Crypto fees"]} />
        <BarChart title="Gateway spend" data={spend} keys={["Uncensored", "Open", "Frontier"]} />
        <BarChart title="Tokens served" data={usage} keys={["Text", "Image", "Audio"]} format="num" />
        <BarChart title="Credit purchases" data={purchases} keys={["Crypto", "Card"]} format="num" />
      </div>

      <p className="eyebrow mt-16">02 · The order book</p>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {[["Available liquidity", `$${(totalLiq / 1000).toFixed(2)}K`], ["Sell orders", totalOrders.toLocaleString()], ["Best discount", "50%"]].map(([l, v]) => (
          <div key={l} className="card p-5"><p className="text-sm text-mute">{l}</p><p className="mt-1 font-serif text-4xl">{v}</p></div>
        ))}
      </div>
      <div className="card mt-4 overflow-x-auto p-6">
        <table className="w-full min-w-[520px] font-mono text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-mute">
            <tr><th className="pb-3">Discount band</th><th className="pb-3">Depth</th><th className="pb-3 text-right">Liquidity</th><th className="pb-3 text-right">Orders</th></tr>
          </thead>
          <tbody>
            {BANDS.map((b) => (
              <tr key={b.band} className="border-t border-line">
                <td className="py-3 text-moss">{b.band}</td>
                <td className="w-1/2 py-3 pr-6"><span className="block h-2 rounded-full bg-gradient-to-r from-ember to-ember-soft" style={{ width: `${(b.liquidity / maxLiq) * 100}%` }} /></td>
                <td className="py-3 text-right">${b.liquidity.toLocaleString()}</td>
                <td className="py-3 text-right text-mute">{b.orders}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-16 grid gap-6 border-t border-line pt-10 text-sm text-mute md:grid-cols-3">
        <div><p className="text-bone">Revenue</p><p className="mt-1">5% platform fee on discounted credit, split by payment rail. After refunds.</p></div>
        <div><p className="text-bone">Tokens served</p><p className="mt-1">Input + output tokens through the gateway. Counted from billing metadata only.</p></div>
        <div><p className="text-bone">Order book</p><p className="mt-1">Snapshot of unused credit listed by sellers, grouped by discount band.</p></div>
      </div>
    </main>
  );
}
