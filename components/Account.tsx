"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./Providers";
import { explorerTx, formatUsdg } from "@/lib/chain";

type Key = { id: string; name: string; prefix: string; created_at: string; last_used_at: string | null };
type Me = {
  user: { id: string; handle: string | null; balance: number; createdAt: string };
  keys: Key[];
  orders: { id: string; status: string; credit: number; total: number; payment_method: string; checkout_url: string | null; pay_units: string | null; tx_hash: string | null; created_at: string }[];
  usage: { model: string; prompt_tokens: number; completion_tokens: number; cost: number; latency_ms: number | null; status: number; created_at: string }[];
  daily: { date: string; cost: number }[];
  totals: { bought: number; saved: number; requests: number };
};

const usd = (n: number, digits = 2) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: Math.max(digits, 2) });
const when = (s: string | null) => (s ? new Date(s).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "never");
const STATUS: Record<string, string> = { paid: "text-moss", pending: "text-warn", failed: "text-ember-soft", expired: "text-mute", refunded: "text-mute" };

type OrderRow = Me["orders"][number];

function OrderExtras({ o }: { o: OrderRow }) {
  return (
    <>
      {o.status === "pending" && o.checkout_url && <a href={o.checkout_url} className="ml-2 font-sans text-xs text-ember-soft underline">pay</a>}
      {o.status === "pending" && o.pay_units && <span className="ml-2 font-sans text-xs text-mute">send {formatUsdg(o.pay_units)} USDG</span>}
      {o.tx_hash && o.payment_method === "usdg" && <a href={explorerTx(o.tx_hash)} target="_blank" rel="noreferrer" className="ml-2 font-sans text-xs text-ember-soft underline">tx</a>}
    </>
  );
}

export default function Account() {
  const auth = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");
  const [newKey, setNewKey] = useState<{ name: string; key: string } | null>(null);
  const [keyName, setKeyName] = useState("");
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [handle, setHandle] = useState<string | null>(null);
  const [handleMsg, setHandleMsg] = useState("");

  const api = useCallback(async (path: string, init: RequestInit = {}) => {
    const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(await auth.authHeaders()), ...init.headers } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
    return data;
  }, [auth]);

  const load = useCallback(async () => {
    try { setMe(await api("/api/me")); setError(""); } catch (e) { setError((e as Error).message); }
  }, [api]);

  useEffect(() => { if (auth.authenticated) load(); }, [auth.authenticated, load]);

  // While a payment is pending, refresh so credit shows up as soon as the IPN lands.
  const hasPending = me?.orders.some((o) => o.status === "pending" && Date.now() - Date.parse(o.created_at) < 3 * 3600_000);
  useEffect(() => {
    if (!hasPending) return;
    const tick = async () => {
      // USDG payments are detected by checking the chain for each open order.
      const open = me?.orders.filter((o) => o.status === "pending" && o.payment_method === "usdg") ?? [];
      await Promise.all(open.map((o) => api(`/api/orders/${o.id}/confirm`, { method: "POST", body: "{}" }).catch(() => null)));
      await load();
    };
    const t = setInterval(tick, 10_000);
    return () => clearInterval(t);
  }, [hasPending, load, api, me?.orders]);
  const [returning, setReturning] = useState(false);
  useEffect(() => { setReturning(new URLSearchParams(window.location.search).has("order")); }, []);

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const k = await api("/api/keys", { method: "POST", body: JSON.stringify({ name: keyName }) });
      setNewKey(k); setKeyName(""); await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function saveHandle(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await api("/api/me", { method: "PATCH", body: JSON.stringify({ handle: handle ?? "" }) });
      setHandleMsg(r.handle ? `Saved. You appear as ${r.handle}` : "Cleared. You appear anonymously");
      await load();
    } catch (err) { setHandleMsg((err as Error).message); }
  }

  async function revoke(id: string) {
    setBusy(true);
    try { await api(`/api/keys/${id}`, { method: "DELETE" }); setConfirmRevoke(null); await load(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  if (!auth.ready) return <p className="mt-10 text-mute">Loading…</p>;
  if (!auth.authenticated) {
    return (
      <div className="card mt-10 p-10 text-center">
        <h2 className="text-2xl font-semibold tracking-[-0.035em] text-bone">Sign in to see your account.</h2>
        <p className="mt-2 text-mute">Balance, API keys and usage live here.</p>
        <button onClick={auth.login} className="btn btn-primary mt-6">Sign in</button>
      </div>
    );
  }
  if (!me) return <p className="mt-10 text-mute">{error || "Loading your account…"}</p>;

  const max = Math.max(...me.daily.map((d) => d.cost), 0.0001);

  return (
    <>
      {returning && hasPending && (
        <p className="mt-6 flex items-center gap-2 rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warn" />
          Waiting for your payment to confirm. Credit is added automatically.
        </p>
      )}
      {error && <p className="mt-6 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{error}</p>}

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[["Balance", usd(me.user.balance)], ["Saved vs list", usd(me.totals.saved)], ["Credit bought", usd(me.totals.bought)], ["Requests (14d)", me.totals.requests.toLocaleString()]].map(([l, v]) => (
          <div key={l} className="card p-5"><p className="text-xs uppercase tracking-wider text-mute">{l}</p><p className="mt-2 font-serif text-3xl">{v}</p></div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
        <div className="card p-6">
          <p className="eyebrow">Spend by day · 14d</p>
          <div className="mt-6 flex h-44 items-end gap-2">
            {me.daily.map((d) => (
              <div key={d.date} className="group relative flex h-full flex-1 flex-col justify-end">
                <div className="rounded-t bg-gradient-to-t from-ember/50 to-ember-soft" style={{ height: `${Math.max((d.cost / max) * 100, d.cost ? 3 : 1)}%` }} />
                <span className="absolute -top-5 left-1/2 hidden -translate-x-1/2 whitespace-nowrap font-mono text-[10px] group-hover:block">{d.date} · {usd(d.cost, 4)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-6">
          <p className="eyebrow">API keys</p>
          {newKey && (
            <div className="slidein mt-4 rounded-lg border border-moss/40 bg-moss/10 p-3">
              <p className="text-xs text-moss">“{newKey.name}” created. Copy it now, it won’t be shown again.</p>
              <code className="mt-2 block break-all font-mono text-sm text-bone">{newKey.key}</code>
              <div className="mt-2 flex gap-2">
                <button className="btn btn-primary px-3 py-1 text-xs" onClick={() => navigator.clipboard?.writeText(newKey.key)}>Copy</button>
                <button className="btn btn-ghost px-3 py-1 text-xs" onClick={() => setNewKey(null)}>Done</button>
              </div>
            </div>
          )}
          <ul className="mt-4 divide-y divide-line">
            {me.keys.length === 0 && <li className="py-3 text-sm text-mute">No active keys.</li>}
            {me.keys.map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm">{k.name}</p>
                  <p className="font-mono text-xs text-mute">{k.prefix}… · used {when(k.last_used_at)}</p>
                </div>
                {confirmRevoke === k.id ? (
                  <span className="flex shrink-0 gap-1">
                    <button disabled={busy} onClick={() => revoke(k.id)} className="rounded bg-danger px-3 py-1 text-xs text-ink">Revoke</button>
                    <button onClick={() => setConfirmRevoke(null)} className="rounded border border-line px-3 py-1 text-xs">Cancel</button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmRevoke(k.id)} className="shrink-0 text-xs text-mute hover:text-ember-soft">Revoke</button>
                )}
              </li>
            ))}
          </ul>
          <form onSubmit={createKey} className="mt-3 flex min-w-0 gap-2">
            <input value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="Key name" maxLength={40}
              className="min-w-0 flex-1 rounded border border-line bg-ink px-4 py-2 text-sm outline-none focus:border-ember" />
            <button disabled={busy} className="btn btn-ghost text-sm">+ New key</button>
          </form>
        </div>
      </div>

      <div className="card mt-4">
        <p className="eyebrow p-5 pb-0">Orders</p>
        {me.orders.length === 0 && <p className="p-6 text-center text-sm text-mute">No orders yet. <a href="/#buy" className="text-ember-soft underline">Buy credits</a></p>}
        {/* Mobile: compact rows */}
        <ul className="divide-y divide-line md:hidden">
          {me.orders.map((o) => (
            <li key={o.id} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-bold">{usd(o.credit)} <span className="font-normal text-mute">for {usd(o.total)}</span></p>
                <p className="truncate text-xs text-mute">{when(o.created_at)} · {o.payment_method}</p>
                <OrderExtras o={o} />
              </div>
              <span className={`shrink-0 text-xs uppercase ${STATUS[o.status] ?? ""}`}>{o.status}</span>
            </li>
          ))}
        </ul>
        {/* Desktop: table */}
        {me.orders.length > 0 && (
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="text-left font-mono text-[11px] uppercase tracking-wider text-mute">
                <tr><th className="p-4">Order</th><th className="p-4">Date</th><th className="p-4">Credit</th><th className="p-4">Paid</th><th className="p-4">Method</th><th className="p-4">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-line font-mono">
                {me.orders.map((o) => (
                  <tr key={o.id}>
                    <td className="p-4 text-mute">{o.id}</td><td className="p-4 text-mute">{when(o.created_at)}</td>
                    <td className="p-4">{usd(o.credit)}</td><td className="p-4">{usd(o.total)}</td>
                    <td className="p-4 text-mute">{o.payment_method}</td>
                    <td className={`p-4 ${STATUS[o.status] ?? ""}`}>{o.status}<OrderExtras o={o} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card mt-4">
        <p className="eyebrow p-5 pb-0">Recent requests</p>
        {me.usage.length === 0 && <p className="p-6 text-center text-sm text-mute">No requests yet. See the <a href="/docs#quickstart" className="text-ember-soft underline">quickstart</a>.</p>}
        <ul className="divide-y divide-line md:hidden">
          {me.usage.map((u, i) => (
            <li key={i} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
              <div className="min-w-0">
                <p className="truncate">{u.model.replace("beeper/", "")}</p>
                <p className="text-xs text-mute">{u.prompt_tokens === 0 ? `${u.completion_tokens} image${u.completion_tokens === 1 ? "" : "s"}` : `${u.prompt_tokens.toLocaleString()} in · ${u.completion_tokens.toLocaleString()} out`} · {when(u.created_at)}</p>
              </div>
              <span className="shrink-0 font-mono text-xs">{usd(u.cost, 4)}</span>
            </li>
          ))}
        </ul>
        {me.usage.length > 0 && (
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="text-left font-mono text-[11px] uppercase tracking-wider text-mute">
                <tr><th className="p-4">Model</th><th className="p-4">In</th><th className="p-4">Out</th><th className="p-4">Cost</th><th className="p-4">Latency</th><th className="p-4">Time</th></tr>
              </thead>
              <tbody className="divide-y divide-line font-mono">
                {me.usage.map((u, i) => (
                  <tr key={i}>
                    <td className="p-4">{u.model}</td><td className="p-4 text-mute">{u.prompt_tokens.toLocaleString()}</td>
                    <td className="p-4 text-mute">{u.completion_tokens.toLocaleString()}</td><td className="p-4">{usd(u.cost, 4)}</td>
                    <td className="p-4 text-mute">{u.latency_ms ?? "n/a"} ms</td><td className="p-4 text-mute">{when(u.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-line p-4 text-xs text-mute">Only billing metadata is logged. Prompt and completion content is never stored.</p>
      </div>
      <form onSubmit={saveHandle} className="card mt-4 flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
        <div className="min-w-0 sm:flex-1">
          <p className="eyebrow">Public handle</p>
          <p className="mt-1 text-xs text-mute">Shown on the leaderboard and recent buys instead of an anonymous name. Leave empty to stay anonymous.</p>
        </div>
        <input value={handle ?? me.user.handle ?? ""} onChange={(e) => setHandle(e.target.value.toLowerCase())} placeholder="anonymous" maxLength={20}
          className="w-full rounded border border-line bg-ink px-4 py-2 font-mono text-sm outline-none focus:border-ember sm:w-44" />
        <button className="btn btn-ghost text-sm">Save</button>
        {handleMsg && <p className="w-full text-xs text-mute">{handleMsg}</p>}
      </form>
      <p className="mt-6 break-all font-mono text-[11px] text-mute">User ID: {me.user.id}</p>
    </>
  );
}
