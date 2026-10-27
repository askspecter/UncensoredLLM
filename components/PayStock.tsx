"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPublicClient, formatUnits, http, type Hex } from "viem";
import { useAuth } from "./Providers";
import { robinhood } from "@/lib/chain";
import { STOCKS, STOCK_DECIMALS, approvePermit2, approveRouter, stockBySymbol, swapToUsdg } from "@/lib/stocks";

type Holding = {
  symbol: string; name: string; balance: string; valueUsd: number | null;
  quote: { pool: [number, number]; amountIn: string; maxIn: string; enough: boolean } | null;
  needs: { permit2: boolean; router: boolean };
};

const chain = createPublicClient({ chain: robinhood, transport: http() });

/** 0.241126224084093689 -> "0.2411" */
function amount(units: string | bigint, digits = 4) {
  const n = Number(formatUnits(BigInt(units), STOCK_DECIMALS));
  return n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : n.toLocaleString("en-US", { maximumSignificantDigits: digits });
}
const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Pays a USDG order by swapping a tokenized stock for the exact amount, straight to the treasury. */
export default function PayStock({ pay, authHeaders, onSent }: {
  pay: { to: `0x${string}`; units: string; amount: string };
  authHeaders: () => Promise<Record<string, string>>;
  onSent: (hash: string) => void;
}) {
  const auth = useAuth();
  const owner = auth.walletAddress;
  const [list, setList] = useState<Holding[] | null>(null);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    if (!owner) return null;
    const res = await fetch(`/api/stocks?address=${owner}&units=${pay.units}`, { headers: await authHeaders() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setNote(data.error ?? "Could not read your wallet."); return null; }
    setList(data.stocks);
    return data.stocks as Holding[];
  }, [owner, pay.units, authHeaders]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (list && !list.some((h) => h.symbol === pick)) setPick(list.find((h) => h.quote?.enough)?.symbol ?? "");
  }, [list, pick]);

  const chosen = useMemo(() => list?.find((h) => h.symbol === pick), [list, pick]);

  async function send(tx: { to: `0x${string}`; data: Hex }) {
    const hash = await auth.sendTx(owner!, tx);
    await chain.waitForTransactionReceipt({ hash });
    return hash;
  }

  async function run() {
    const stock = stockBySymbol(pick);
    if (!owner || !stock || !chosen?.quote) return;
    setBusy(true); setNote("");
    try {
      const steps = (chosen.needs.permit2 ? 1 : 0) + (chosen.needs.router ? 1 : 0) + 1;
      let step = 1;
      if (chosen.needs.permit2) { setNote(`Step ${step++} of ${steps}: allow Uniswap to use your ${stock.symbol}`); await send(approvePermit2(stock)); }
      if (chosen.needs.router) { setNote(`Step ${step++} of ${steps}: approve the swap router`); await send(approveRouter(stock, Math.floor(Date.now() / 1000))); }
      // Re-quote right before swapping so the price cap is fresh.
      const fresh = (await load())?.find((h) => h.symbol === stock.symbol)?.quote;
      if (!fresh?.enough) throw new Error(`Not enough ${stock.symbol} at the current price.`);
      setNote(`Step ${step} of ${steps}: swap ${amount(fresh.amountIn)} ${stock.symbol} for ${pay.amount} USDG`);
      const tx = swapToUsdg(stock, fresh.pool, BigInt(pay.units), BigInt(fresh.maxIn), pay.to, Math.floor(Date.now() / 1000) + 1200);
      const hash = await auth.sendTx(owner, tx);
      setNote("Swap sent. Waiting for confirmation…");
      onSent(hash);
    } catch (e) {
      const msg = (e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message;
      setNote(/reject|denied/i.test(msg) ? "Cancelled." : msg.slice(0, 160));
    } finally { setBusy(false); }
  }

  if (!owner) {
    return (
      <button onClick={() => auth.connectWallet()} className="btn btn-ghost w-full">Connect the wallet that holds your stocks</button>
    );
  }

  return (
    <div className="space-y-3">
      {!list && !note && <p className="text-sm text-mute">Reading your wallet…</p>}
      {list && list.length === 0 && (
        <p className="text-sm text-mute">
          No stock tokens in <span className="font-mono">{owner.slice(0, 6)}…{owner.slice(-4)}</span>. Supported: {STOCKS.map((s) => s.symbol).join(", ")}.
        </p>
      )}
      {list && list.length > 0 && (
        <div className="divide-y divide-line overflow-hidden rounded-md border border-line">
          {list.map((h) => {
            const ok = Boolean(h.quote?.enough);
            return (
              <label key={h.symbol} className={`flex items-center gap-3 px-4 py-3 ${ok ? "cursor-pointer hover:bg-ink" : "opacity-50"} ${pick === h.symbol ? "bg-ink" : ""}`}>
                <input type="radio" name="stock" className="accent-ember" disabled={!ok || busy} checked={pick === h.symbol} onChange={() => setPick(h.symbol)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-bone"><span className="font-mono">{h.symbol}</span><span className="hidden text-mute sm:inline"> {h.name}</span></p>
                  <p className="truncate text-xs text-mute">{amount(h.balance)} held{h.valueUsd !== null ? ` · ${usd(h.valueUsd)}` : ""}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono text-sm text-bone">{h.quote ? <>{amount(h.quote.amountIn)} <span className="text-mute">{h.symbol}</span></> : <span className="text-mute">no route</span>}</p>
                  {h.quote && !ok && <p className="text-[11px] text-mute">not enough</p>}
                </div>
              </label>
            );
          })}
        </div>
      )}
      {chosen?.quote && (
        <button onClick={run} disabled={busy} className="btn btn-primary w-full disabled:opacity-50">
          {busy ? "Confirm in your wallet…" : `Pay ${amount(chosen.quote.amountIn)} ${chosen.symbol}`}
        </button>
      )}
      {note && <p className="text-sm text-mute">{note}</p>}
      <p className="text-[11px] leading-relaxed text-mute">
        Your wallet swaps the stock token for exactly {pay.amount} USDG on Uniswap v4 and sends it to Beeper in the same transaction.
        Beeper never holds your shares. The swap reverts if the price moves more than 1%. Only official Robinhood stock tokens are accepted.
      </p>
    </div>
  );
}
