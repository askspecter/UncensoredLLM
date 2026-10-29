"use client";
import { useCallback, useEffect, useState } from "react";
import { createPublicClient, formatUnits, http, parseUnits, type Hex } from "viem";
import { useAuth } from "./Providers";
import { PAY_TO, USDG, USDG_DECIMALS, explorerTx, robinhood } from "@/lib/chain";
import { STOCKS, STOCK_DECIMALS, approvePermit2, approveRouter, stockBySymbol } from "@/lib/stocks";
import { TRADE_FEE_BPS, encodeTrade, type Side } from "@/lib/trade";

type Quote = {
  pool: [number, number]; out: string; minOut: string; fee: string; spend: string;
  needs: { permit2: boolean; router: boolean; enough: boolean; balance: string } | null;
};
type Done = { hash: string; fee?: number; error?: string };

const chain = createPublicClient({ chain: robinhood, transport: http() });
const fmt = (units: string | bigint, decimals: number, digits = 6) => {
  const n = Number(formatUnits(BigInt(units), decimals));
  return n.toLocaleString("en-US", { maximumFractionDigits: n >= 100 ? 2 : digits });
};
// Swaps whose cashback did not confirm yet, retried on the next visit.
const PENDING = "beeper:pending-cashback";
const pending = (): { intentId: string; hash: string }[] => { try { return JSON.parse(localStorage.getItem(PENDING) ?? "[]"); } catch { return []; } };
const savePending = (v: { intentId: string; hash: string }[]) => { try { localStorage.setItem(PENDING, JSON.stringify(v)); } catch { /* private mode */ } };
const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 })}`;

export default function TradeSwap({ symbol, onSymbol }: { symbol: string; onSymbol: (s: string) => void }) {
  const auth = useAuth();
  const owner = auth.walletAddress;
  const stock = stockBySymbol(symbol)!;
  const [side, setSide] = useState<Side>("sell");
  const [amount, setAmount] = useState("0.1");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [qErr, setQErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [done, setDone] = useState<Done | null>(null);

  const inDec = side === "sell" ? STOCK_DECIMALS : USDG_DECIMALS;
  const outDec = side === "sell" ? USDG_DECIMALS : STOCK_DECIMALS;
  const inSym = side === "sell" ? stock.symbol : "USDG";
  const outSym = side === "sell" ? "USDG" : stock.symbol;
  const units = (() => { try { return amount ? parseUnits(amount, inDec) : BigInt(0); } catch { return BigInt(0); } })();

  const fetchQuote = useCallback(async () => {
    if (units <= BigInt(0)) { setQuote(null); return null; }
    const res = await fetch(`/api/trade/quote?symbol=${stock.symbol}&side=${side}&amount=${units}${owner ? `&address=${owner}` : ""}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setQuote(null); setQErr(data.error ?? "No quote"); return null; }
    setQErr(""); setQuote(data); return data as Quote;
  }, [stock.symbol, side, units, owner]);

  useEffect(() => {
    const t = setTimeout(fetchQuote, 300);
    const r = setInterval(fetchQuote, 15_000);
    return () => { clearTimeout(t); clearInterval(r); };
  }, [fetchQuote]);

  // Fee in dollars: the sell fee is part of the USDG out, the buy fee is added to the USDG in.
  const feeUsd = quote ? Number(quote.fee) / 10 ** USDG_DECIMALS : 0;

  function flip(next: Side) {
    if (next === side) return;
    setSide(next); setQuote(null); setDone(null);
    setAmount(next === "sell" ? "0.1" : "25");
  }

  async function send(tx: { to: `0x${string}`; data: Hex }) {
    const hash = await auth.sendTx(owner!, tx);
    await chain.waitForTransactionReceipt({ hash });
    return hash;
  }

  async function claim(intentId: string, hash: string): Promise<Done> {
    for (let i = 0; i < 12; i++) {
      const res = await fetch("/api/trade/claim", {
        method: "POST", headers: { "content-type": "application/json", ...(await auth.authHeaders()) },
        body: JSON.stringify({ intentId, txHash: hash }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) return { hash, fee: data.fee };
      if (!data.pending) return { hash, error: data.error ?? "Cashback failed" };
      await new Promise((r) => setTimeout(r, 2500));
    }
    savePending([...pending().filter((p) => p.hash !== hash), { intentId, hash }]);
    return { hash, error: "Cashback is still pending. It will be retried next time you open this page." };
  }

  useEffect(() => {
    if (!auth.authenticated) return;
    const list = pending();
    if (!list.length) return;
    (async () => {
      const left: typeof list = [];
      for (const p of list) {
        const res = await fetch("/api/trade/claim", {
          method: "POST", headers: { "content-type": "application/json", ...(await auth.authHeaders()) },
          body: JSON.stringify({ intentId: p.intentId, txHash: p.hash }),
        }).catch(() => null);
        const data = await res?.json().catch(() => ({}));
        if (data?.pending || !res) left.push(p);
        else if (data?.ok) window.dispatchEvent(new Event("beeper:cashback"));
      }
      savePending(left);
    })();
  }, [auth]);

  async function swap() {
    if (!owner) return auth.connectWallet();
    if (!auth.authenticated) return auth.login();
    setBusy(true); setNote(""); setDone(null);
    try {
      let q = quote ?? await fetchQuote();
      if (!q?.needs) throw new Error("No quote yet");
      if (!q.needs.enough) throw new Error(`Not enough ${inSym} in this wallet.`);
      const token = side === "sell" ? stock : { ...stock, address: USDG as `0x${string}` };
      if (q.needs.permit2) { setNote(`Allow Uniswap to use your ${inSym}`); await send(approvePermit2(token)); }
      if (q.needs.router) { setNote("Approve the swap router"); await send(approveRouter(token, Math.floor(Date.now() / 1000))); }

      const res = await fetch("/api/trade/intent", { method: "POST", headers: await auth.authHeaders() });
      const intent = await res.json();
      if (!res.ok) throw new Error(intent.error ?? "Could not start the trade");
      q = (await fetchQuote()) ?? q; // fresh price for the output floor
      setNote("Confirm the swap in your wallet");
      const tx = encodeTrade({
        stock, pool: q.pool, side, amountIn: units, minOut: BigInt(q.minOut),
        payTo: PAY_TO!, tag: intent.id, deadline: Math.floor(Date.now() / 1000) + 1200,
      });
      const hash = await auth.sendTx(owner, tx);
      setNote("Swapping…");
      await chain.waitForTransactionReceipt({ hash });
      setNote("Adding your AI credit…");
      const r = await claim(intent.id, hash);
      setDone(r); setNote("");
      if (r.fee) window.dispatchEvent(new Event("beeper:cashback"));
      fetchQuote();
    } catch (e) {
      const msg = (e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message;
      setNote(/reject|denied/i.test(msg) ? "Cancelled." : msg.slice(0, 160));
    } finally { setBusy(false); }
  }

  const label = !owner ? "Connect wallet" : !auth.authenticated ? "Sign in to trade" : busy ? "Working…"
    : !quote ? (qErr || "Enter an amount") : quote.needs && !quote.needs.enough ? `Not enough ${inSym}` : `Swap ${inSym} for ${outSym}`;

  return (
    <div className="card min-w-0 p-5 sm:p-6">
      <div className="grid grid-cols-2 gap-1 rounded-md border border-line bg-ink p-1 text-sm">
        {(["sell", "buy"] as const).map((s) => (
          <button key={s} type="button" onClick={() => flip(s)} aria-pressed={side === s}
            className={`rounded py-2 ${side === s ? "bg-panel-2 text-bone" : "text-mute hover:text-bone"}`}>
            {s === "sell" ? `Sell ${stock.symbol}` : `Buy ${stock.symbol}`}
          </button>
        ))}
      </div>

      <label className="mt-5 block text-xs text-mute" htmlFor="stock">Stock</label>
      <select id="stock" value={stock.symbol} onChange={(e) => { onSymbol(e.target.value); setQuote(null); setDone(null); }}
        className="mt-1.5 w-full rounded-md border border-line bg-ink px-3 py-2.5 font-mono text-sm text-bone outline-none focus:border-ember">
        {STOCKS.map((s) => <option key={s.symbol} value={s.symbol}>{s.symbol} · {s.name}</option>)}
      </select>

      <div className="mt-4 rounded-md border border-line bg-ink p-4 focus-within:border-ember">
        <div className="flex items-center justify-between text-xs text-mute">
          <span>You pay</span>
          {quote?.needs && (
            <button type="button" className="hover:text-bone" onClick={() => {
              const bal = BigInt(quote.needs!.balance);
              // Leave room for the buy fee on top of the USDG swapped.
              const max = side === "buy" ? (bal * BigInt(10_000)) / BigInt(10_000 + TRADE_FEE_BPS) : bal;
              setAmount(formatUnits(max, inDec));
            }}>Balance {fmt(quote.needs.balance, inDec, 4)} · Max</button>
          )}
        </div>
        <div className="mt-1 flex items-center gap-3">
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            className="min-w-0 flex-1 bg-transparent text-3xl text-bone outline-none" aria-label="Amount" />
          <span className="font-mono text-sm text-mute">{inSym}</span>
        </div>
      </div>

      <div className="mt-2 rounded-md border border-line p-4">
        <p className="text-xs text-mute">You receive</p>
        <div className="mt-1 flex items-center gap-3">
          <p className="min-w-0 flex-1 truncate text-3xl text-bone">{quote ? fmt(quote.out, outDec) : "…"}</p>
          <span className="font-mono text-sm text-mute">{outSym}</span>
        </div>
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-4"><dt className="text-mute">Fee ({TRADE_FEE_BPS / 100}%)</dt><dd className="text-bone">{quote ? usd(feeUsd) : "…"}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-ember">Back to you as AI credit</dt><dd className="text-ember">{quote ? `+${usd(feeUsd)}` : "…"}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-mute">Route</dt><dd className="text-right font-mono text-xs text-mute">{quote ? `Uniswap v4 · ${(quote.pool[0] / 10_000).toFixed(2)}% pool · no hook` : "…"}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-mute">Slippage cap</dt><dd className="text-mute">1%</dd></div>
      </dl>

      <button onClick={swap} disabled={busy || (Boolean(owner) && auth.authenticated && (!quote || (quote.needs !== null && !quote.needs.enough)))}
        className="btn btn-primary mt-5 w-full disabled:opacity-50">{label}</button>

      {note && <p className="mt-3 text-sm text-mute">{note}</p>}
      {done && (
        <div className={`mt-3 rounded-md border p-3 text-sm ${done.fee ? "border-ember text-bone" : "border-line text-mute"}`}>
          {done.fee ? <>Swapped. <span className="text-ember">+{usd(done.fee)} AI credit</span> added to your balance.</> : <>Swapped. {done.error}</>}
          <a href={explorerTx(done.hash)} target="_blank" rel="noreferrer" className="ml-2 text-xs text-ember-soft underline">view tx</a>
        </div>
      )}
    </div>
  );
}
