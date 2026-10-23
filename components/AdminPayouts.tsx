"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./Providers";
import { explorerTx } from "@/lib/chain";

type Payout = { id: string; user_id: string; order_id: string; amount: number; address: string; status: string; tx_hash: string | null; created_at: string };

export default function AdminPayouts() {
  const auth = useAuth();
  const [rows, setRows] = useState<Payout[] | null>(null);
  const [error, setError] = useState("");
  const [hashes, setHashes] = useState<Record<string, string>>({});

  const api = useCallback(async (path: string, init: RequestInit = {}) => {
    const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(await auth.authHeaders()) } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Request failed");
    return data;
  }, [auth]);

  const load = useCallback(async () => {
    try { setRows(await api("/api/admin/payouts")); setError(""); } catch (e) { setError((e as Error).message); }
  }, [api]);
  useEffect(() => { if (auth.authenticated) load(); }, [auth.authenticated, load]);

  async function markPaid(id: string) {
    try { await api(`/api/admin/payouts/${id}`, { method: "POST", body: JSON.stringify({ txHash: hashes[id] }) }); await load(); }
    catch (e) { setError((e as Error).message); }
  }

  if (!auth.authenticated) return <button onClick={auth.login} className="btn btn-primary mt-8">Sign in</button>;
  if (error) return <p className="mt-8 rounded-lg border border-ember/40 bg-ember/10 p-3 text-sm text-ember-soft">{error}</p>;
  if (!rows) return <p className="mt-8 text-mute">Loading…</p>;

  const pending = rows.filter((r) => r.status === "pending");
  const owed = pending.reduce((s, r) => s + r.amount, 0);
  return (
    <>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="card p-5"><p className="text-sm text-mute">Pending payouts</p><p className="mt-1 font-serif text-4xl">{pending.length}</p></div>
        <div className="card p-5"><p className="text-sm text-mute">USDG owed to sellers</p><p className="mt-1 font-serif text-4xl">${owed.toFixed(2)}</p></div>
      </div>
      <p className="mt-4 text-sm text-mute">Send each amount in USDG on Robinhood Chain from the treasury wallet, then paste the transaction hash to mark it paid.</p>
      <div className="mt-4 space-y-3">
        {rows.length === 0 && <p className="card p-6 text-center text-mute">No payouts yet.</p>}
        {rows.map((p) => (
          <div key={p.id} className="card p-5 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-serif text-2xl">{p.amount.toFixed(6)} USDG</span>
              <span className={p.status === "paid" ? "text-moss" : "text-[#f5c451]"}>{p.status}</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <code className="break-all font-mono text-xs text-bone">{p.address}</code>
              <button onClick={() => navigator.clipboard?.writeText(p.address)} className="shrink-0 rounded-full border border-line px-2 py-0.5 text-xs text-mute">Copy</button>
            </div>
            <p className="mt-1 font-mono text-[11px] text-mute">{p.order_id} · {new Date(p.created_at).toLocaleString()}</p>
            {p.status === "pending" ? (
              <div className="mt-3 flex gap-2">
                <input value={hashes[p.id] ?? ""} onChange={(e) => setHashes({ ...hashes, [p.id]: e.target.value })} placeholder="0x… payout tx hash"
                  className="min-w-0 flex-1 rounded-full border border-line bg-ink px-4 py-2 font-mono text-xs outline-none focus:border-ember" />
                <button onClick={() => markPaid(p.id)} className="btn btn-primary px-4 py-2 text-xs">Mark paid</button>
              </div>
            ) : p.tx_hash && <a href={explorerTx(p.tx_hash)} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-ember-soft underline">view tx</a>}
          </div>
        ))}
      </div>
    </>
  );
}
