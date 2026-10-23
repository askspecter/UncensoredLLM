"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./Providers";
import { HOUSE_DISCOUNT, MIN_OFFER } from "@/lib/data";
import { explorerTx } from "@/lib/chain";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
type Offer = { id: string; credit: number; remaining: number; sold: number; discount: number; payoutAddress: string; status: string; createdAt: string };
type Payout = { id: string; amount: number; address: string; status: string; txHash: string | null; createdAt: string };

export default function SellForm() {
  const auth = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [mine, setMine] = useState<{ offers: Offer[]; payouts: Payout[] }>({ offers: [], payouts: [] });
  const [credit, setCredit] = useState(50);
  const [discount, setDiscount] = useState(25);
  const [payout, setPayout] = useState("");
  const [state, setState] = useState<{ ok?: string; err?: string; busy?: boolean }>({});
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);

  const api = useCallback(async (path: string, init: RequestInit = {}) => {
    const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(await auth.authHeaders()) } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Request failed");
    return data;
  }, [auth]);

  const load = useCallback(async () => {
    const [me, offers] = await Promise.all([api("/api/me"), api("/api/offers")]);
    setBalance(me.user.balance);
    setMine(offers);
  }, [api]);

  useEffect(() => { if (auth.authenticated) load().catch(() => {}); }, [auth.authenticated, load]);
  useEffect(() => { if (!payout && auth.walletAddress) setPayout(auth.walletAddress); }, [auth.walletAddress, payout]);

  const receive = (credit || 0) * (1 - discount / 100);
  const tooShallow = discount <= HOUSE_DISCOUNT * 100;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!auth.authenticated) return auth.login();
    setState({ busy: true });
    try {
      await api("/api/offers", { method: "POST", body: JSON.stringify({ credit, discount: discount / 100, payout }) });
      setState({ ok: `Listed ${usd(credit)} at −${discount}%.` });
      await load();
    } catch (err) { setState({ err: (err as Error).message }); }
  }

  async function cancel(id: string) {
    try { await api(`/api/offers/${id}`, { method: "DELETE" }); setConfirmCancel(null); await load(); }
    catch (err) { setState({ err: (err as Error).message }); }
  }

  if (auth.ready && !auth.authenticated) {
    return (
      <div className="card p-8 text-center">
        <h3 className="text-2xl font-semibold tracking-[-0.035em] text-bone">Sign in to sell credit.</h3>
        <p className="mt-2 text-sm text-mute">You can list any part of your Beeper balance.</p>
        <button onClick={auth.login} className="btn btn-primary mt-5">Sign in</button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="card space-y-6 p-6">
        <div className="flex items-baseline justify-between">
          <p className="eyebrow">New offer</p>
          <span className="text-sm text-mute">Balance: <span className="text-bone">{balance === null ? "…" : usd(balance)}</span></span>
        </div>

        <div>
          <label htmlFor="credit" className="text-sm text-mute">Credit to sell (USD)</label>
          <input id="credit" type="number" min={MIN_OFFER} step="0.01" value={Number.isNaN(credit) ? "" : credit} onChange={(e) => setCredit(e.target.valueAsNumber)}
            className="mt-2 w-full rounded-md border border-line bg-ink px-4 py-3 text-2xl outline-none focus:border-ember" />
          {balance !== null && <button type="button" onClick={() => setCredit(Math.floor(balance * 100) / 100)} className="mt-2 text-xs text-ember-soft underline">Use full balance</button>}
        </div>

        <div>
          <div className="flex justify-between text-sm"><label htmlFor="disc" className="text-mute">Discount to buyers</label><span className="font-mono text-moss">−{discount}%</span></div>
          <input id="disc" type="range" min={1} max={90} value={discount} onChange={(e) => setDiscount(+e.target.value)} className="mt-3 w-full" />
          <p className={`mt-1 text-xs ${tooShallow ? "text-warn" : "text-mute"}`}>
            {tooShallow
              ? `Beeper already sells at −${HOUSE_DISCOUNT * 100}%, so offers at or below that won’t fill.`
              : "Deeper discounts fill first."}
          </p>
        </div>

        <div>
          <label htmlFor="payout" className="text-sm text-mute">Payout address (USDG · Robinhood Chain)</label>
          <input id="payout" value={payout} onChange={(e) => setPayout(e.target.value)} placeholder="0x…"
            className="mt-2 w-full rounded-md border border-line bg-ink px-4 py-3 font-mono text-sm outline-none focus:border-ember" />
        </div>

        <div className="flex items-center justify-between rounded-md bg-panel-2 p-4">
          <span className="text-sm text-mute">You receive when it sells</span>
          <span className="font-serif text-3xl">{usd(receive)}</span>
        </div>

        <button disabled={state.busy} className="btn btn-primary w-full disabled:opacity-40">{state.busy ? "Listing…" : "List on the order book"}</button>
        {state.ok && <p className="text-sm text-moss">{state.ok}</p>}
        {state.err && <p className="text-sm text-danger">{state.err}</p>}
        <p className="text-xs text-mute">Listed credit leaves your balance and is held in escrow until it sells. Cancel any time to get unsold credit back.</p>
      </form>

      {mine.offers.length > 0 && (
        <div className="card overflow-x-auto">
          <p className="eyebrow p-5 pb-0">Your offers</p>
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-left font-mono text-[11px] uppercase tracking-wider text-mute">
              <tr><th className="p-4">Listed</th><th className="p-4">Discount</th><th className="p-4">Sold</th><th className="p-4">Left</th><th className="p-4" /></tr>
            </thead>
            <tbody className="divide-y divide-line font-mono">
              {mine.offers.map((o) => (
                <tr key={o.id}>
                  <td className="p-4">{usd(o.credit)}</td>
                  <td className="p-4 text-moss">−{Math.round(o.discount * 100)}%</td>
                  <td className="p-4">{usd(o.sold)}</td>
                  <td className="p-4 text-mute">{o.status === "live" ? usd(o.remaining) : o.status}</td>
                  <td className="p-4 text-right">
                    {o.status === "live" && (confirmCancel === o.id ? (
                      <span className="inline-flex gap-1">
                        <button onClick={() => cancel(o.id)} className="rounded bg-danger px-3 py-1 font-sans text-xs text-ink">Cancel offer</button>
                        <button onClick={() => setConfirmCancel(null)} className="rounded border border-line px-3 py-1 font-sans text-xs">Keep</button>
                      </span>
                    ) : <button onClick={() => setConfirmCancel(o.id)} className="font-sans text-xs text-mute hover:text-ember-soft">Cancel</button>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mine.payouts.length > 0 && (
        <div className="card overflow-x-auto">
          <p className="eyebrow p-5 pb-0">Your payouts</p>
          <table className="w-full min-w-[480px] text-sm">
            <tbody className="divide-y divide-line font-mono">
              {mine.payouts.map((p) => (
                <tr key={p.id}>
                  <td className="p-4">{usd(p.amount)} USDG</td>
                  <td className="p-4 text-mute">{new Date(p.createdAt).toLocaleDateString()}</td>
                  <td className={`p-4 ${p.status === "paid" ? "text-moss" : "text-warn"}`}>
                    {p.status}{p.txHash && <a href={explorerTx(p.txHash)} target="_blank" rel="noreferrer" className="ml-2 font-sans text-xs text-ember-soft underline">tx</a>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-line p-4 text-xs text-mute">Payouts are sent in USDG on Robinhood Chain, usually within 48 hours of a sale.</p>
        </div>
      )}
    </div>
  );
}
