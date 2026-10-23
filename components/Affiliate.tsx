"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./Providers";
import { AFFILIATE_COMMISSION as COMMISSION } from "@/lib/data";
import { explorerTx } from "@/lib/chain";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function Estimator() {
  const [refs, setRefs] = useState(20);
  const [spend, setSpend] = useState(150);
  const monthly = refs * spend * COMMISSION;
  return (
    <div className="card p-6">
      <p className="eyebrow">Earnings estimator</p>
      <div className="mt-6 space-y-6">
        <div>
          <div className="flex justify-between text-sm"><span className="text-mute">Referred buyers</span><span className="font-mono">{refs}</span></div>
          <input type="range" min={1} max={500} value={refs} onChange={(e) => setRefs(+e.target.value)} className="mt-2 w-full" />
        </div>
        <div>
          <div className="flex justify-between text-sm"><span className="text-mute">Avg. top-up / month</span><span className="font-mono">${spend}</span></div>
          <input type="range" min={5} max={2000} step={5} value={spend} onChange={(e) => setSpend(+e.target.value)} className="mt-2 w-full" />
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4 rounded-md bg-panel-2 p-4">
        <div><p className="text-xs text-mute">per month</p><p className="font-serif text-3xl">${monthly.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p></div>
        <div><p className="text-xs text-mute">per year</p><p className="font-serif text-3xl text-moss">${(monthly * 12).toLocaleString("en-US", { maximumFractionDigits: 0 })}</p></div>
      </div>
      <p className="mt-3 text-xs text-mute">Illustration only, not a guarantee. Refunds and disputes reduce commission.</p>
    </div>
  );
}

type Data = {
  code: string; link: string; holdDays: number; minWithdraw: number; referrals: number; buyers: number;
  earned: number; available: number; held: number; paidOut: number;
  payouts: { id: string; amount: number; status: string; txHash: string | null; createdAt: string }[];
};

export function ReferralLink() {
  const auth = useAuth();
  const [d, setD] = useState<Data | null>(null);
  const [copied, setCopied] = useState(false);
  const [address, setAddress] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});

  const api = useCallback(async (path: string, init: RequestInit = {}) => {
    const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(await auth.authHeaders()) } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Request failed");
    return data;
  }, [auth]);
  const load = useCallback(() => api("/api/affiliate").then(setD).catch(() => {}), [api]);
  useEffect(() => { if (auth.authenticated) load(); }, [auth.authenticated, load]);
  useEffect(() => { if (!address && auth.walletAddress) setAddress(auth.walletAddress); }, [auth.walletAddress, address]);

  if (!auth.authenticated) return <button onClick={auth.login} className="btn btn-primary">Become an affiliate</button>;
  if (!d) return <p className="text-mute">Loading your link…</p>;

  async function withdraw(e: React.FormEvent) {
    e.preventDefault();
    try { const r = await api("/api/affiliate/withdraw", { method: "POST", body: JSON.stringify({ address }) }); setMsg({ ok: `Requested ${usd(r.amount)} USDG.` }); load(); }
    catch (err) { setMsg({ err: (err as Error).message }); }
  }

  return (
    <div className="mx-auto w-full max-w-2xl text-left">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <code className="rounded border border-line bg-ink px-4 py-2.5 font-mono text-sm text-ember-soft">{d.link}</code>
        <button className="btn btn-primary text-sm" onClick={() => { navigator.clipboard?.writeText(d.link); setCopied(true); }}>{copied ? "Copied ✓" : "Copy link"}</button>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Signed up", d.referrals.toString()], ["Buyers", d.buyers.toString()], ["Earned", usd(d.earned)], ["Withdrawable", usd(d.available)]].map(([l, v]) => (
          <div key={l} className="card p-4"><p className="text-xs text-mute">{l}</p><p className="mt-1 font-serif text-2xl">{v}</p></div>
        ))}
      </div>
      {d.held > 0 && <p className="mt-2 text-center text-xs text-mute">{usd(d.held)} is in the {d.holdDays}-day hold.</p>}
      <form onSubmit={withdraw} className="mt-4 flex flex-wrap gap-2">
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0x… payout address (Robinhood Chain)"
          className="min-w-0 flex-1 rounded border border-line bg-ink px-4 py-2.5 font-mono text-xs outline-none focus:border-ember" />
        <button disabled={d.available < d.minWithdraw} className="btn btn-ghost text-sm disabled:opacity-40">Withdraw {usd(d.available)}</button>
      </form>
      {msg.ok && <p className="mt-2 text-sm text-moss">{msg.ok}</p>}
      {msg.err && <p className="mt-2 text-sm text-danger">{msg.err}</p>}
      {d.payouts.length > 0 && (
        <ul className="mt-4 divide-y divide-line rounded-md border border-line text-sm">
          {d.payouts.map((p) => (
            <li key={p.id} className="flex items-center justify-between p-3 font-mono">
              <span>{usd(p.amount)} USDG</span>
              <span className={p.status === "paid" ? "text-moss" : "text-warn"}>
                {p.status}{p.txHash && <a href={explorerTx(p.txHash)} target="_blank" rel="noreferrer" className="ml-2 font-sans text-xs text-ember-soft underline">tx</a>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
