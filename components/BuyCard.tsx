"use client";
import { useMemo, useState } from "react";
import { MAX_PURCHASE, MIN_PURCHASE, PLATFORM_FEE, quote } from "@/lib/data";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const PRESETS = [25, 100, 500, 2500];

type Order = { id: string; apiKey: string; credit: number; total: number };

export default function BuyCard() {
  const [amount, setAmount] = useState(100);
  const [pay, setPay] = useState<"crypto" | "card">("crypto");
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");

  const valid = amount >= MIN_PURCHASE && amount <= MAX_PURCHASE;
  const q = useMemo(() => quote(valid ? amount : 0), [amount, valid]);

  async function checkout() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ credit: amount, payment: pay }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Checkout failed");
      setOrder(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (order) {
    return (
      <div className="card slidein p-6">
        <p className="eyebrow">Order {order.id}</p>
        <h3 className="mt-2 font-serif text-3xl">Your key is ready.</h3>
        <p className="mt-2 text-sm text-mute">
          {usd(order.credit)} of credit for {usd(order.total)}. Save this key now — it is shown once and never stored in plaintext.
        </p>
        <code className="mt-4 block break-all rounded-lg border border-line bg-ink p-3 font-mono text-sm text-ember-soft">
          {order.apiKey}
        </code>
        <div className="mt-5 flex gap-2">
          <button className="btn btn-primary text-sm" onClick={() => navigator.clipboard?.writeText(order.apiKey)}>Copy key</button>
          <button className="btn btn-ghost text-sm" onClick={() => setOrder(null)}>Buy more</button>
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
        {(["crypto", "card"] as const).map((m) => (
          <button key={m} onClick={() => setPay(m)}
            className={`rounded-full py-1.5 ${pay === m ? "bg-panel-2 text-bone" : "text-mute"}`}>
            {m === "crypto" ? "Crypto (XMR / BTC / USDC)" : "Card"}
          </button>
        ))}
      </div>

      <button disabled={!valid || loading} onClick={checkout} className="btn btn-primary mt-4 w-full disabled:opacity-40">
        {loading ? "Generating key…" : valid ? `Pay ${usd(q.total)} · get anonymous key` : `Enter $${MIN_PURCHASE}–$${MAX_PURCHASE.toLocaleString()}`}
      </button>
      {error && <p className="mt-2 text-sm text-ember-soft">{error}</p>}
      <p className="mt-3 text-center text-xs text-mute">No email. No KYC. Minimum ${MIN_PURCHASE}.</p>
    </div>
  );
}
