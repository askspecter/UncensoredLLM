"use client";
import { useState } from "react";
import { useAuth } from "./Providers";

const SOURCES = [
  ["openrouter", "OpenRouter"], ["together", "Together AI"], ["fireworks", "Fireworks"],
  ["deepinfra", "DeepInfra"], ["groq", "Groq"], ["other", "Other provider"],
] as const;
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function SellForm() {
  const [source, setSource] = useState("openrouter");
  const [credit, setCredit] = useState(500);
  const [discount, setDiscount] = useState(35);
  const [payout, setPayout] = useState("");
  const auth = useAuth();
  const [state, setState] = useState<{ ok?: string; err?: string; busy?: boolean }>({});

  const payoutAmt = (credit || 0) * (1 - discount / 100);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (auth.enabled && !auth.authenticated) return auth.login();
    setState({ busy: true });
    const res = await fetch("/api/listings", {
      method: "POST",
      headers: { "content-type": "application/json", ...(await auth.authHeaders()) },
      body: JSON.stringify({ source, credit, discount: discount / 100, payout }),
    });
    const data = await res.json();
    setState(res.ok ? { ok: data.id } : { err: data.error });
  }

  if (state.ok) {
    return (
      <div className="card slidein p-8">
        <p className="eyebrow">Listing {state.ok}</p>
        <h3 className="mt-2 font-serif text-3xl">You’re on the list.</h3>
        <p className="mt-3 text-sm text-mute">
          When the seller marketplace opens we’ll verify the balance and list your {usd(credit)} at −{discount}%. You’d receive about {usd(payoutAmt)} as it sells.</p>
        <button className="btn btn-ghost mt-6 text-sm" onClick={() => setState({})}>List more</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card space-y-6 p-6">
      <div>
        <label className="text-sm text-mute">Where is the credit?</label>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SOURCES.map(([v, l]) => (
            <button type="button" key={v} onClick={() => setSource(v)}
              className={`rounded-lg border px-3 py-2 text-sm ${source === v ? "border-ember" : "border-line text-mute hover:text-bone"}`}>{l}</button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="credit" className="text-sm text-mute">Unused credit (USD)</label>
        <input id="credit" type="number" min={50} value={Number.isNaN(credit) ? "" : credit} onChange={(e) => setCredit(e.target.valueAsNumber)}
          className="mt-2 w-full rounded-xl border border-line bg-ink px-4 py-3 text-2xl outline-none focus:border-ember" />
      </div>

      <div>
        <div className="flex justify-between text-sm"><label htmlFor="disc" className="text-mute">Discount to buyers</label><span className="font-mono text-moss">−{discount}%</span></div>
        <input id="disc" type="range" min={5} max={70} value={discount} onChange={(e) => setDiscount(+e.target.value)} className="mt-3 w-full accent-[#e5484d]" />
        <p className="mt-1 text-xs text-mute">Deeper discounts will sell first once the marketplace opens.</p>
      </div>

      <div>
        <label htmlFor="payout" className="text-sm text-mute">Payout address (USDG · Robinhood Chain)</label>
        <input id="payout" value={payout} onChange={(e) => setPayout(e.target.value)} placeholder="0x…"
          className="mt-2 w-full rounded-xl border border-line bg-ink px-4 py-3 font-mono text-sm outline-none focus:border-ember" />
      </div>

      <div className="flex items-center justify-between rounded-xl bg-panel-2 p-4">
        <span className="text-sm text-mute">You’d receive</span>
        <span className="font-serif text-3xl">{usd(payoutAmt)}</span>
      </div>

      <button disabled={state.busy} className="btn btn-primary w-full disabled:opacity-40">{state.busy ? "Submitting…" : auth.enabled && !auth.authenticated ? "Sign in to apply" : "Apply to sell"}</button>
      {state.err && <p className="text-sm text-ember-soft">{state.err}</p>}
    </form>
  );
}
