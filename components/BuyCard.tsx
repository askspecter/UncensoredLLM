"use client";
import { useMemo, useState } from "react";
import { useAuth } from "./Providers";
import PayUsdg, { type Paid, type UsdgPay } from "./PayUsdg";
import { MAX_PURCHASE, MIN_PURCHASE, PLATFORM_FEE, quote } from "@/lib/data";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const PRESETS = [25, 100, 500, 2500];

type Order = { id: string; status: "paid" | "pending"; credit: number; total: number; balance?: number; apiKey?: string | null; checkoutUrl?: string | null; pay?: UsdgPay; txHash?: string };
type Method = "usdg" | "card";

export default function BuyCard() {
  const [amount, setAmount] = useState(100);
  const [method, setMethod] = useState<Method>("usdg");
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const auth = useAuth();

  const valid = amount >= MIN_PURCHASE && amount <= MAX_PURCHASE;
  const q = useMemo(() => quote(valid ? amount : 0), [amount, valid]);

  async function checkout() {
    if (auth.enabled && !auth.authenticated) return auth.login();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json", ...(await auth.authHeaders()) },
        body: JSON.stringify({ credit: amount, payment: method }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Checkout failed");
      if (data.checkoutUrl) { window.location.href = data.checkoutUrl; return; }
      setOrder(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (order) {
    const paid = order.status === "paid";
    return (
      <div className="card slidein p-6">
        <p className="eyebrow">Order {order.id}</p>
        <h3 className="mt-2 font-serif text-3xl">{paid ? "Credit added." : order.pay ? "Pay with USDG." : "Awaiting payment."}</h3>
        <p className="mt-2 text-sm text-mute">
          {paid
            ? <>{usd(order.credit)} of credit for {usd(order.total)}. Balance: <span className="text-bone">{usd(order.balance ?? order.credit)}</span>.</>
            : <>{usd(order.credit)} of credit for {usd(order.total)}. Credit is added as soon as the payment confirms.</>}
        </p>
        {!paid && order.pay && (
          <PayUsdg orderId={order.id} pay={order.pay}
            onPaid={(r: Paid) => setOrder({ ...order, status: "paid", balance: r.balance, apiKey: r.apiKey, txHash: r.txHash })} />
        )}
        {order.apiKey && (
          <>
            <p className="mt-4 text-sm text-mute">Your first API key — save it now, it’s shown once:</p>
            <code className="mt-2 block break-all rounded-lg border border-line bg-ink p-3 font-mono text-sm text-ember-soft">{order.apiKey}</code>
          </>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          {!paid && order.checkoutUrl && <a href={order.checkoutUrl} className="btn btn-primary text-sm">Open checkout</a>}
          {order.apiKey && <button className="btn btn-primary text-sm" onClick={() => navigator.clipboard?.writeText(order.apiKey!)}>Copy key</button>}
          {paid && <a href="/dashboard" className={`btn text-sm ${order.apiKey ? "btn-ghost" : "btn-primary"}`}>Go to account</a>}
          <button className="btn btn-ghost text-sm" onClick={() => setOrder(null)}>{paid ? "Buy more" : "Cancel"}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between">
        <p className="eyebrow">Buy credits</p>
        <span className="rounded-full bg-moss/10 px-2.5 py-1 font-mono text-xs text-moss">
          −{Math.round(q.effectiveDiscount * 100)}% vs list
        </span>
      </div>

      <label className="mt-5 block text-sm text-mute" htmlFor="amt">Credit amount</label>
      <div className="mt-2 flex items-center rounded-xl border border-line bg-ink px-4 focus-within:border-ember">
        <span className="text-2xl text-mute">$</span>
        <input
          id="amt"
          type="number"
          min={MIN_PURCHASE}
          max={MAX_PURCHASE}
          value={Number.isNaN(amount) ? "" : amount}
          onChange={(e) => setAmount(e.target.valueAsNumber)}
          className="w-full bg-transparent px-2 py-3 text-3xl outline-none"
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button key={p} onClick={() => setAmount(p)}
            className={`rounded-full border px-3 py-1 text-sm ${amount === p ? "border-ember text-bone" : "border-line text-mute hover:text-bone"}`}>
            ${p.toLocaleString()}
          </button>
        ))}
      </div>

      <dl className="mt-6 space-y-2 text-sm">
        <div className="flex justify-between"><dt className="text-mute">List value</dt><dd className="text-mute line-through">{usd(valid ? amount : 0)}</dd></div>
        <div className="flex justify-between"><dt className="text-mute">Discounted credit</dt><dd>{usd(q.subtotal)}</dd></div>
        <div className="flex justify-between"><dt className="text-mute">Platform fee ({PLATFORM_FEE * 100}%)</dt><dd>{usd(q.fee)}</dd></div>
        <div className="flex justify-between border-t border-line pt-3 text-base"><dt>You pay</dt><dd className="font-semibold">{usd(q.total)}</dd></div>
        <div className="flex justify-between text-moss"><dt>You save</dt><dd>{usd(q.savings)}</dd></div>
      </dl>

      {q.fills.length > 1 && (
        <p className="mt-3 font-mono text-[11px] text-mute">
          Filled across {q.fills.length} tiers: {q.fills.map((f) => `${usd(f.credit)} @ −${Math.round(f.discount * 100)}%`).join(" · ")}
        </p>
      )}

      <div className="mt-5 grid grid-cols-2 gap-2 rounded-full border border-line p-1 text-sm">
        {([["usdg", "USDG · Robinhood Chain"], ["card", "Card"]] as const).map(([m, label]) => (
          <button key={m} onClick={() => setMethod(m)}
            className={`rounded-full py-1.5 ${method === m ? "bg-panel-2 text-bone" : "text-mute hover:text-bone"}`}>{label}</button>
        ))}
      </div>

      <button disabled={!valid || loading} onClick={checkout} className="btn btn-primary mt-4 w-full disabled:opacity-40">
        {loading ? (method === "card" ? "Opening checkout…" : "Creating order…") : auth.enabled && !auth.authenticated ? "Sign in to buy" : valid ? `Pay ${usd(q.total)}${method === "card" ? " by card" : " in USDG"}` : `Enter $${MIN_PURCHASE}–$${MAX_PURCHASE.toLocaleString()}`}
      </button>
      {error && <p className="mt-2 text-sm text-ember-soft">{error}</p>}
      <p className="mt-3 text-center text-xs text-mute">Sign in with Google, email or a wallet. No KYC. Minimum ${MIN_PURCHASE}.</p>
    </div>
  );
}
