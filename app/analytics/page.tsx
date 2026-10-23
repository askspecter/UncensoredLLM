import BarChart from "@/components/BarChart";
import PageHeader from "@/components/PageHeader";
import { networkMetrics } from "@/lib/metrics";
import { bookSummary } from "@/lib/market";

export const metadata = { title: "Analytics — Beeper" };
export const revalidate = 60;

const compact = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${n}`);

export default async function Analytics() {
  const [m, book] = await Promise.all([networkMetrics().catch(() => null), bookSummary().catch(() => null)]);
  const listed = book?.bands.reduce((s, b) => s + b.liquidity, 0) ?? 0;
  const offers = book?.bands.reduce((s, b) => s + b.offers, 0) ?? 0;
  const best = Math.max(book?.house ?? 0, ...(book?.bands.map((b) => b.from) ?? []));
  const maxLiq = Math.max(...(book?.bands.map((b) => b.liquidity) ?? []), 1);
  return (
    <main className="mx-auto max-w-6xl px-5 pt-8 md:pt-16">
      <PageHeader eyebrow="Analytics · public" title={<>The big picture, <em className="text-ember-soft">in the open.</em></>}
        sub="Live network numbers, refreshed every minute. We publish totals — never prompts.">
        <span className="flex items-center gap-2 font-mono text-xs text-mute"><span className="h-1.5 w-1.5 animate-pulse rounded bg-moss" />live · UTC</span>
      </PageHeader>

      {!m ? (
        <p className="card mt-14 p-8 text-center text-mute">Analytics will appear once the network is live.</p>
      ) : (
        <>
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[["Accounts", m.totals.users.toLocaleString()], ["Credit sold", `$${m.totals.paid.toLocaleString("en-US", { maximumFractionDigits: 0 })}`],
              ["Tokens served", compact(m.totals.tokens)], ["Requests", compact(m.totals.requests)]].map(([l, v]) => (
              <div key={l} className="card p-5"><p className="text-sm text-mute">{l}</p><p className="mt-1 font-serif text-4xl">{v}</p></div>
            ))}
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <BarChart title="Credit sold" data={m.credit} keys={["USDG", "Card"]} />
            <BarChart title="Gateway spend" data={m.spend} keys={["Uncensored", "Other"]} />
            <BarChart title="Tokens served" data={m.tokens} keys={["Uncensored", "Other"]} format="num" />
            <BarChart title="Purchases" data={m.purchases} keys={["USDG", "Card"]} format="num" />
          </div>
        </>
      )}

      {book && (
        <>
          <p className="eyebrow mt-16">The order book</p>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {[["Listed by users", `$${listed.toLocaleString("en-US", { maximumFractionDigits: 0 })}`], ["Live offers", offers.toLocaleString()], ["Best discount", `${Math.round(best * 100)}%`]].map(([l, v]) => (
              <div key={l} className="card p-5"><p className="text-sm text-mute">{l}</p><p className="mt-1 font-serif text-4xl">{v}</p></div>
            ))}
          </div>
          <div className="card mt-4 overflow-x-auto p-6">
            <table className="w-full min-w-[520px] font-mono text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-mute">
                <tr><th className="pb-3">Discount band</th><th className="pb-3">Depth</th><th className="pb-3 text-right">Liquidity</th><th className="pb-3 text-right">Offers</th></tr>
              </thead>
              <tbody>
                {book.bands.map((b) => (
                  <tr key={b.from} className="border-t border-line">
                    <td className="py-3 text-moss">{Math.round(b.from * 100)}–{Math.round(b.to * 100)}%</td>
                    <td className="w-1/2 py-3 pr-6"><span className="block h-2 rounded-full bg-gradient-to-r from-ember to-ember-soft" style={{ width: `${(b.liquidity / maxLiq) * 100}%` }} /></td>
                    <td className="py-3 text-right">${b.liquidity.toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>
                    <td className="py-3 text-right text-mute">{b.offers}</td>
                  </tr>
                ))}
                <tr className="border-t border-line">
                  <td className="py-3 text-moss">{Math.round(book.house * 100)}%</td>
                  <td className="py-3 text-xs text-mute">Beeper · always available</td>
                  <td className="py-3 text-right">∞</td><td className="py-3 text-right text-mute">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="mt-16 grid gap-6 border-t border-line pt-10 text-sm text-mute md:grid-cols-3">
        <div><p className="text-bone">Credit sold</p><p className="mt-1">Paid orders in USD by payment rail, dated when the payment confirmed.</p></div>
        <div><p className="text-bone">Gateway spend</p><p className="mt-1">Credit consumed by API requests, split by uncensored vs. other models.</p></div>
        <div><p className="text-bone">Tokens served</p><p className="mt-1">Prompt + completion tokens, counted from billing metadata only.</p></div>
      </div>
    </main>
  );
}
