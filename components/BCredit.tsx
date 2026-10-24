"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./Providers";
import { linkMessage } from "@/lib/bcredit-shared";
import { BEEP } from "@/lib/token";

type Data = {
  share: number; minBeep: number; totalPaid: number; linkedWallets: number;
  epochs: { day: string; pool: number; totalBeep: number; holders: number }[];
  me?: { bcredit: number; beep: number; wallets: { address: string; beep: number }[]; rewards: { day: string; beep: number; amount: number }[] };
};

const usd = (n: number, d = 2) => `$${n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: Math.max(d, 4) })}`;
const num = (n: number) => n.toLocaleString("en-US");
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const day = (s: string) => new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export default function BCredit() {
  const auth = useAuth();
  const [d, setD] = useState<Data | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  const [busy, setBusy] = useState(false);

  const call = useCallback(async (path: string, init: RequestInit = {}) => {
    const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(await auth.authHeaders()) } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Request failed");
    return data;
  }, [auth]);
  const load = useCallback(() => call("/api/bcredit").then(setD).catch(() => {}), [call]);
  useEffect(() => { load(); }, [load, auth.authenticated]);

  async function link() {
    if (!auth.authenticated) return auth.login();
    if (!auth.walletAddress) return auth.connectWallet();
    setBusy(true); setMsg({});
    try {
      const me = await call("/api/me");
      const ts = Date.now();
      const { address, signature } = await auth.signMessage(linkMessage(me.user.id, auth.walletAddress, ts));
      await call("/api/bcredit/link", { method: "POST", body: JSON.stringify({ address, signature, ts }) });
      setMsg({ ok: `Wallet ${short(address)} linked.` });
      await load();
    } catch (e) {
      const m = (e as Error).message;
      setMsg({ err: /reject|denied/i.test(m) ? "Signature cancelled." : m });
    } finally { setBusy(false); }
  }

  async function unlink(address: string) {
    try { await call("/api/bcredit/link", { method: "DELETE", body: JSON.stringify({ address }) }); await load(); } catch (e) { setMsg({ err: (e as Error).message }); }
  }

  async function activate() {
    setBusy(true); setMsg({});
    try { const r = await call("/api/bcredit/activate", { method: "POST" }); setMsg({ ok: `${usd(r.activated)} added to your API balance.` }); await load(); }
    catch (e) { setMsg({ err: (e as Error).message }); } finally { setBusy(false); }
  }

  const me = d?.me;
  const last = d?.epochs[0];
  const eligible = me ? me.beep >= (d?.minBeep ?? 0) : false;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-[1.2fr_1fr] [&>*]:min-w-0">
        {/* Your bCREDIT */}
        <div className="card p-6 md:p-8">
          <p className="eyebrow">Your bCREDIT</p>
          {!auth.authenticated ? (
            <div className="mt-4">
              <p className="text-mute">Sign in and link the wallet that holds your $BEEP to start earning.</p>
              <button onClick={auth.login} className="btn btn-primary mt-5">Sign in</button>
            </div>
          ) : (
            <>
              <p className="mt-3 font-serif text-6xl text-ember">{me ? usd(me.bcredit, 2) : "…"}</p>
              <p className="text-sm text-mute">1 bCREDIT = $1 of API balance</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button onClick={activate} disabled={busy || !me || me.bcredit <= 0} className="btn btn-primary disabled:opacity-40">Activate to balance</button>
                <button onClick={link} disabled={busy} className="btn btn-ghost">{auth.walletAddress ? "Link wallet" : "Connect wallet"}</button>
              </div>
              {msg.ok && <p className="mt-3 text-sm text-moss">{msg.ok}</p>}
              {msg.err && <p className="mt-3 text-sm text-danger">{msg.err}</p>}

              <div className="mt-6 border-t border-line pt-5">
                <p className="text-sm text-mute">Linked wallets</p>
                {me?.wallets.length ? (
                  <ul className="mt-2 divide-y divide-line">
                    {me.wallets.map((w) => (
                      <li key={w.address} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <span className="font-mono">{short(w.address)}</span>
                        <span className="flex items-center gap-3"><span>{num(w.beep)} $BEEP</span>
                          <button onClick={() => unlink(w.address)} className="text-xs text-mute hover:text-danger">Unlink</button></span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-2 text-sm text-mute">No wallet linked yet.</p>}
                {me && me.wallets.length > 0 && (
                  <p className={`mt-3 text-xs ${eligible ? "text-moss" : "text-warn"}`}>
                    {eligible ? `Eligible: ${num(me.beep)} $BEEP counted in the next distribution.` : `Hold at least ${num(d!.minBeep)} $BEEP across linked wallets to earn.`}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Program stats */}
        <dl className="grid grid-cols-2 content-start gap-3">
          {[["Revenue shared", d ? `${Math.round(d.share * 100)}%` : "…"], ["Paid to holders", d ? usd(d.totalPaid) : "…"],
            ["Last daily pool", last ? usd(last.pool) : "n/a"], ["Linked wallets", d ? num(d.linkedWallets) : "…"]].map(([l, v]) => (
            <div key={l} className="card min-w-0 p-4 sm:p-5"><dt className="text-xs text-mute">{l}</dt><dd className="mt-1 truncate font-serif text-[1.7rem] sm:text-4xl">{v}</dd></div>
          ))}
        </dl>
      </div>

      {me && me.rewards.length > 0 && (
        <div className="card">
          <p className="eyebrow p-5 pb-2">Your rewards</p>
          <ul className="divide-y divide-line">
            {me.rewards.map((r) => (
              <li key={r.day} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="text-mute">{day(r.day)} · {num(r.beep)} $BEEP held</span>
                <span className="font-mono text-moss">+{usd(r.amount, 2)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-mute">
        $BEEP contract: <span className="break-all font-mono">{BEEP.address}</span>. Distributions follow actual daily revenue and can be zero on quiet days. bCREDIT is product credit, not cash, and is not redeemable for money. Not financial advice.
      </p>
    </div>
  );
}
