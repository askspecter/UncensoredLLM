"use client";
import { useCallback, useEffect, useState } from "react";
import { createPublicClient, encodeFunctionData, erc20Abi, formatUnits, http, maxUint256, parseUnits, type Hex } from "viem";
import { useAuth } from "./Providers";
import { CoinLogo, type LaunchCoin as Coin } from "./LaunchList";
import { findModel } from "@/lib/data";
import { USDG, explorerTx, robinhood } from "@/lib/chain";
import { CURVE_ABI, ROUTER_ABI } from "@/lib/launch";
import CoinChart, { fmtUsd, type Trade } from "./CoinChart";

type Detail = {
  coin: Coin & { curve: string; router: string; socials: Record<string, string> };
  paid: number;
  supply: number | null;
  trades: Trade[];
  harvests: { txHash: string; credit: number; paid: number; holders: number; at: string }[];
  top: { wallet: string; earned: number }[];
};

const chain = createPublicClient({ chain: robinhood, transport: http() });
const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 })}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const SLIPPAGE_BPS = BigInt(300);

export default function LaunchCoin({ token }: { token: `0x${string}` }) {
  const auth = useAuth();
  const me = auth.walletAddress as `0x${string}` | null;
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState("");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("10");
  const [bal, setBal] = useState<{ usdg: bigint; coin: bigint } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/launch/${token}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setErr(j.error ?? "Not found");
    setD(j);
  }, [token]);

  const loadBal = useCallback(async () => {
    if (!me) return;
    const [usdg, coin] = await Promise.all([
      chain.readContract({ address: USDG, abi: erc20Abi, functionName: "balanceOf", args: [me] }),
      chain.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [me] }),
    ]).catch(() => [null, null]);
    if (usdg !== null && coin !== null) setBal({ usdg, coin });
  }, [me, token]);

  useEffect(() => { load(); const id = setInterval(load, 30_000); return () => clearInterval(id); }, [load]);
  useEffect(() => { loadBal(); }, [loadBal]);

  if (err) return <p className="card p-6 text-sm text-mute">{err}</p>;
  if (!d) return <p className="text-sm text-mute">Loading…</p>;
  const c = d.coin;
  const model = findModel(c.model);
  const curve = c.curve as `0x${string}`;

  async function send(tx: { to: `0x${string}`; data: Hex }) {
    const hash = await auth.sendTx(me!, tx);
    const r = await chain.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error("Transaction failed on chain");
    return hash;
  }

  async function trade() {
    if (!auth.authenticated) return auth.login();
    if (!me) return auth.connectWallet();
    setBusy(true); setNote("");
    try {
      const inToken = side === "buy" ? USDG : token;
      const units = parseUnits(amount || "0", side === "buy" ? 6 : 18);
      if (units <= BigInt(0)) throw new Error("Enter an amount");
      const allowance = await chain.readContract({ address: inToken, abi: erc20Abi, functionName: "allowance", args: [me, curve] });
      if (allowance < units) {
        setNote(`Allow the curve to use your ${side === "buy" ? "USDG" : c.symbol}`);
        await send({ to: inToken, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [curve, maxUint256] }) });
      }
      // Simulate first, then accept at most SLIPPAGE_BPS less than the simulated output.
      const fn = side === "buy" ? "buy" : "sell";
      const { result: out } = await chain.simulateContract({ account: me, address: curve, abi: CURVE_ABI, functionName: fn, args: [units, BigInt(0), me] })
        .catch(() => { throw new Error("This coin has graduated from its curve, or the curve cannot fill that size. Trade it on its pool."); });
      const min = out - (out * SLIPPAGE_BPS) / BigInt(10_000);
      setNote(`Confirm: ${amount} ${side === "buy" ? "USDG" : c.symbol} for about ${Number(formatUnits(out, side === "buy" ? 18 : 6)).toLocaleString("en-US", { maximumFractionDigits: 4 })} ${side === "buy" ? c.symbol : "USDG"}`);
      const hash = await send({ to: curve, data: encodeFunctionData({ abi: CURVE_ABI, functionName: fn, args: [units, min, me] }) });
      setNote(`Done. ${short(hash)}`);
      loadBal(); setTimeout(load, 3000);
    } catch (e) {
      const msg = (e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message;
      setNote(/reject|denied/i.test(msg) ? "Cancelled." : msg.slice(0, 180));
    } finally { setBusy(false); }
  }

  async function harvest() {
    if (!me) return auth.connectWallet();
    setBusy(true); setNote("Harvesting fees for holders…");
    try {
      await send({ to: c.router as `0x${string}`, data: encodeFunctionData({ abi: ROUTER_ABI, functionName: "harvest" }) });
      setNote("Harvested. Paying holders…");
      await fetch("/api/launch/sync", { method: "POST" });
      await load(); setNote("Harvest paid to holders.");
    } catch (e) {
      const msg = (e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message;
      setNote(/reject|denied/i.test(msg) ? "Cancelled." : msg.slice(0, 180));
    } finally { setBusy(false); }
  }

  // Socials come from the launch calldata, so only well-formed links are shown.
  const web = (u?: string) => (u && /^https:\/\/[^\s]+$/.test(u) ? u : u && /^t\.me\/[^\s]+$/.test(u) ? `https://${u}` : null);
  const links = ([["X", c.socials?.twitter && /^[A-Za-z0-9_]{1,15}$/.test(c.socials.twitter) ? `https://x.com/${c.socials.twitter}` : null],
    ["Telegram", web(c.socials?.telegram)], ["Website", web(c.socials?.website)]] as [string, string | null][]).filter(([, u]) => u);

  async function copyCa() {
    await navigator.clipboard.writeText(c.token).catch(() => {});
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  const volume = d.trades.reduce((sum, t) => sum + t.usdg, 0);
  const stats: [string, string, string][] = [
    ["Volume", fmtUsd(volume), "text-bone"],
    ["Trades", d.trades.length.toLocaleString("en-US"), "text-bone"],
    ["Paid to holders", usd(d.paid), "text-ember"],
    ["Creator tax", `${(c.tax_bps / 100).toFixed(2)}%`, "text-bone"],
  ];

  const tradeCard = (
    <div className="card min-w-0 p-5 sm:p-6">
      <div className="grid grid-cols-2 gap-1 rounded-md border border-line bg-ink p-1 text-sm">
        {(["buy", "sell"] as const).map((s) => (
          <button key={s} onClick={() => { setSide(s); setAmount(s === "buy" ? "10" : ""); setNote(""); }}
            className={`rounded py-2.5 font-medium ${side === s ? (s === "buy" ? "bg-moss/15 text-moss" : "bg-danger/15 text-danger") : "text-mute hover:text-bone"}`}>
            {s === "buy" ? "Buy" : "Sell"}
          </button>
        ))}
      </div>
      <div className="mt-4 flex justify-between text-xs text-mute">
        <span>You pay</span>
        {bal && <button type="button" className="hover:text-bone" onClick={() => setAmount(side === "buy" ? formatUnits(bal.usdg, 6) : formatUnits(bal.coin, 18))}>
          Balance {side === "buy" ? `${Number(formatUnits(bal.usdg, 6)).toFixed(2)} USDG` : `${Number(formatUnits(bal.coin, 18)).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${c.symbol}`}
        </button>}
      </div>
      <label className="mt-1.5 flex items-center gap-3 rounded-md border border-line bg-ink px-3 py-2.5 focus-within:border-ember">
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} className="min-w-0 flex-1 bg-transparent text-2xl text-bone outline-none" aria-label="Amount" placeholder="0" />
        <span className="font-mono text-sm text-mute">{side === "buy" ? "USDG" : c.symbol}</span>
      </label>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {(side === "buy" ? ["5", "10", "25", "50"] : ["25", "50", "75", "100"]).map((v) => (
          <button key={v} type="button" className="rounded border border-line py-1.5 font-mono text-xs text-mute hover:border-ember hover:text-bone"
            onClick={() => setAmount(side === "buy" ? v : bal ? formatUnits((bal.coin * BigInt(v)) / BigInt(100), 18) : "")}>
            {side === "buy" ? `$${v}` : `${v}%`}
          </button>
        ))}
      </div>
      <button onClick={trade} disabled={busy} className="btn btn-primary mt-4 w-full disabled:opacity-50">
        {!auth.authenticated ? "Sign in to trade" : !me ? "Connect wallet" : busy ? "Working…" : side === "buy" ? `Buy ${c.symbol}` : `Sell ${c.symbol}`}
      </button>
      {note && <p className="mt-3 break-words text-sm text-mute">{note}</p>}
      <p className="mt-4 text-[11px] leading-relaxed text-mute">Trades run on the Pons curve, paired with USDG, with a {Number(SLIPPAGE_BPS) / 100}% slippage cap. Memecoins are volatile and can go to zero.</p>
    </div>
  );

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_380px]">
      <div className="min-w-0 space-y-5">
        <div className="card min-w-0 p-5 sm:p-6">
          <div className="flex items-center gap-4">
            <CoinLogo coin={c} size={64} />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-semibold tracking-[-0.03em] text-bone sm:text-3xl">{c.name}</h1>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="font-mono text-mute">${c.symbol}</span>
                <span className="rounded border border-line px-1.5 py-px font-mono text-[11px] text-ember-soft">{model?.name ?? c.model}</span>
              </p>
            </div>
          </div>
          <button type="button" onClick={copyCa} className="mt-4 flex w-full items-center gap-3 rounded-md border border-line bg-ink px-3 py-2.5 text-left hover:border-ember" aria-label="Copy contract address">
            <span className="shrink-0 text-[11px] font-semibold tracking-[.15em] text-mute">CA</span>
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-bone sm:text-sm">{c.token}</span>
            <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${copied ? "bg-moss/15 text-moss" : "bg-panel-2 text-bone"}`}>{copied ? "Copied" : "Copy"}</span>
          </button>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={`/chat?model=${encodeURIComponent(c.model)}`} className="btn btn-primary w-full text-sm sm:w-auto">Chat with {model?.name ?? "this model"}</a>
            <a href={`https://robinhoodchain.blockscout.com/token/${c.token}`} target="_blank" rel="noreferrer" className="btn btn-ghost flex-1 text-sm sm:flex-none">Explorer</a>
            {links.map(([l, u]) => <a key={l} href={u!} target="_blank" rel="noopener noreferrer nofollow" className="btn btn-ghost flex-1 text-sm sm:flex-none">{l}</a>)}
          </div>
          {c.description && <p className="mt-4 border-t border-line pt-4 text-sm leading-relaxed text-mute">{c.description}</p>}
        </div>

        <div className="lg:hidden">{tradeCard}</div>

        <CoinChart trades={d.trades} supply={d.supply} launchedAt={c.created_at} />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map(([l, v, cls]) => (
            <div key={l} className="card min-w-0 p-4"><p className="text-[11px] text-mute">{l}</p><p className={`mt-1 truncate font-serif text-2xl sm:text-3xl ${cls}`}>{v}</p></div>
          ))}
        </div>

        <div className="card overflow-hidden">
          <p className="border-b border-line px-5 py-3 font-semibold text-bone">Trades</p>
          {d.trades.length === 0 ? <p className="px-5 py-4 text-sm text-mute">No trades yet. Be the first.</p> : (
            <ul className="divide-y divide-line text-sm">{[...d.trades].reverse().slice(0, 25).map((t) => (
              <li key={t.tx} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-5 py-2.5">
                <span className={`w-10 font-mono text-xs font-semibold ${t.side === "buy" ? "text-moss" : "text-danger"}`}>{t.side === "buy" ? "BUY" : "SELL"}</span>
                <span className="min-w-0 truncate text-bone">{usd(t.usdg)} <span className="text-mute">· {t.tokens.toLocaleString("en-US", { maximumFractionDigits: 0 })} {c.symbol}</span></span>
                <a href={explorerTx(t.tx)} target="_blank" rel="noreferrer" className="font-mono text-xs text-mute underline">{ago(t.at)}</a>
              </li>))}</ul>
          )}
        </div>

        <div className="card p-5">
          <p className="font-semibold text-bone">How holders earn</p>
          <p className="mt-2 text-sm leading-relaxed text-mute">
            Every trade pays a fee in USDG. When the fees are harvested, 80% becomes Beeper credit for holders, split by how many {c.symbol} each wallet holds at that block, usable with {model?.name ?? "this model"} and every other model on Beeper.
            Link your wallet on the <a href="/bcredit" className="underline">bCREDIT page</a> to receive it. Credit earned before you link waits for you.
          </p>
          <button onClick={harvest} disabled={busy} className="btn btn-ghost mt-4 text-sm disabled:opacity-50">Harvest fees now</button>
        </div>

        <div className="card overflow-hidden">
          <p className="border-b border-line px-5 py-3 font-semibold text-bone">Harvests</p>
          {d.harvests.length === 0 ? <p className="px-5 py-4 text-sm text-mute">None yet. Fees are harvested daily, or by anyone with the button above.</p> : (
            <ul className="divide-y divide-line text-sm">{d.harvests.map((h) => (
              <li key={h.txHash} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <span className="text-ember">{usd(h.paid)} <span className="text-mute">to {h.holders} holders</span></span>
                <a href={explorerTx(h.txHash)} target="_blank" rel="noreferrer" className="font-mono text-xs text-mute underline">{short(h.txHash)}</a>
              </li>))}</ul>
          )}
        </div>
        {d.top.length > 0 && (
          <div className="card overflow-hidden">
            <p className="border-b border-line px-5 py-3 font-semibold text-bone">Top earners</p>
            <ul className="divide-y divide-line text-sm">{d.top.map((t, i) => (
              <li key={t.wallet} className="flex justify-between px-5 py-2.5"><span className="font-mono text-xs text-mute">{i + 1}. {short(t.wallet)}</span><span className="text-bone">{usd(t.earned)}</span></li>
            ))}</ul>
          </div>
        )}
      </div>

      <div className="hidden lg:sticky lg:top-24 lg:block">{tradeCard}</div>
    </div>
  );
}

function ago(at: string) {
  const s = Math.max(0, (Date.now() - new Date(at).getTime()) / 1000);
  return s < 60 ? `${Math.floor(s)}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
}
