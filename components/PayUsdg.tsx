"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./Providers";
import { USDG, explorerTx, robinhood } from "@/lib/chain";
import PayStock from "./PayStock";

export type UsdgPay = { to: `0x${string}`; units: string; amount: string };
export type Paid = { status: "paid"; txHash?: string; balance?: number; apiKey?: string | null };

function Copy({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={() => { navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}
      className="shrink-0 rounded border border-line px-3 py-1 text-xs text-mute hover:text-bone">
      {done ? "Copied ✓" : label ?? "Copy"}
    </button>
  );
}

export default function PayUsdg({ orderId, pay, onPaid, headers, initialMode = "usdg" }: {
  orderId: string; pay: UsdgPay; onPaid: (r: Paid) => void;
  initialMode?: "usdg" | "stock";
  /** Auth headers override, used by burner accounts. */
  headers?: () => Promise<Record<string, string>>;
}) {
  const auth = useAuth();
  const authHeaders = headers ?? auth.authHeaders;
  const [sending, setSending] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [manualHash, setManualHash] = useState("");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState(initialMode);
  const paidRef = useRef(false);

  const confirm = useCallback(async (hash?: string) => {
    if (paidRef.current) return;
    const res = await fetch(`/api/orders/${orderId}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(hash ? { txHash: hash } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (data.status === "paid") { paidRef.current = true; onPaid(data); }
    else if (data.error && hash) setNote(data.error);
  }, [orderId, authHeaders, onPaid]);

  // Watch the chain every few seconds, also catches payments sent from another wallet or an exchange.
  useEffect(() => {
    const t = setInterval(() => confirm(txHash || undefined), 6000);
    return () => clearInterval(t);
  }, [confirm, txHash]);

  async function payWithWallet() {
    if (!auth.walletAddress) return auth.connectWallet();
    setSending(true); setNote("");
    try {
      const hash = await auth.sendUsdg(pay.to, BigInt(pay.units));
      setTxHash(hash);
      setNote("Sent. Waiting for confirmation…");
      await confirm(hash);
    } catch (e) {
      const msg = (e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message;
      setNote(/reject|denied/i.test(msg) ? "Transaction cancelled." : msg.slice(0, 160));
    } finally { setSending(false); }
  }

  const tab = (m: "usdg" | "stock", label: string) => (
    <button type="button" onClick={() => setMode(m)} aria-pressed={mode === m}
      className={`flex-1 rounded px-3 py-1.5 text-sm transition ${mode === m ? "bg-panel-2 text-bone" : "text-mute hover:text-bone"}`}>{label}</button>
  );

  return (
    <div className="mt-5 space-y-4">
      {auth.enabled && <div className="flex gap-1 rounded-md border border-line bg-ink p-1">{tab("usdg", "Pay with USDG")}{tab("stock", "Pay with stocks")}</div>}

      {mode === "stock" ? (
        <PayStock pay={pay} authHeaders={authHeaders} onSent={(hash) => { setTxHash(hash); setNote("Swap sent. Waiting for confirmation…"); confirm(hash); }} />
      ) : (<>
      <div className="rounded-md border border-line bg-ink p-4">
        <p className="text-xs text-mute">Send exactly</p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="font-mono text-2xl text-bone">{pay.amount} <span className="text-base text-mute">USDG</span></p>
          <Copy text={pay.amount} />
        </div>
        <p className="mt-1 text-[11px] text-mute">The last digits identify your order. Send this exact amount.</p>
      </div>

      <div className="rounded-md border border-line bg-ink p-4">
        <p className="text-xs text-mute">To address · Robinhood Chain ({robinhood.id})</p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="break-all font-mono text-sm text-bone">{pay.to}</p>
          <Copy text={pay.to} />
        </div>
        <p className="mt-2 text-[11px] text-mute">Token: USDG <span className="font-mono">{USDG.slice(0, 8)}…{USDG.slice(-4)}</span>. Only send USDG on Robinhood Chain.</p>
      </div>

      {auth.enabled && (
        <button onClick={payWithWallet} disabled={sending} className="btn btn-primary w-full disabled:opacity-50">
          {sending ? "Confirm in your wallet…" : auth.walletAddress ? `Pay ${pay.amount} USDG with wallet` : "Connect wallet to pay"}
        </button>
      )}
      </>)}

      <div className="flex items-center gap-2 text-sm text-mute">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warn" />
        {note || "Watching Robinhood Chain for your payment…"}
        {txHash && <a href={explorerTx(txHash)} target="_blank" rel="noreferrer" className="ml-auto text-xs text-ember-soft underline">view tx</a>}
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-mute hover:text-bone">Paid from another wallet or exchange?</summary>
        <form onSubmit={(e) => { e.preventDefault(); setTxHash(manualHash.trim()); confirm(manualHash.trim()); }} className="mt-2 flex gap-2">
          <input value={manualHash} onChange={(e) => setManualHash(e.target.value)} placeholder="0x… transaction hash"
            className="min-w-0 flex-1 rounded border border-line bg-ink px-4 py-2 font-mono text-xs outline-none focus:border-ember" />
          <button className="btn btn-ghost text-sm">Check</button>
        </form>
        <p className="mt-2 text-xs text-mute">Payments are detected automatically too. Wallet payments need a little ETH on Robinhood Chain for gas.</p>
      </details>
    </div>
  );
}
