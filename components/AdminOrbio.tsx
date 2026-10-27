"use client";
import { useCallback, useEffect, useState } from "react";
import { createPublicClient, encodeFunctionData, erc20Abi, formatUnits, http, parseUnits } from "viem";
import { useAuth } from "./Providers";
import { USDG, explorerTx, robinhood } from "@/lib/chain";
import { HOOK_ADMIN } from "@/lib/hook";
import { ORBIO_EXCHANGE, ORBIO_EXCHANGE_ABI, ORBIO_MAX_FILLS, beneficiaryOf } from "@/lib/orbio-core";

const client = createPublicClient({ chain: robinhood, transport: http(process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL || undefined) });
type Status = { enabled: boolean; account: string | null; balance: { available: number; used: number } | null };
const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export default function AdminOrbio() {
  const auth = useAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [amount, setAmount] = useState("100");
  const [quote, setQuote] = useState<{ credited: number; minOut: bigint } | null>(null);
  const [usdg, setUsdg] = useState<bigint | null>(null);
  const [running, setRunning] = useState("");
  const [done, setDone] = useState<string[]>([]);
  const [error, setError] = useState("");
  const isAdmin = auth.walletAddresses.some((a) => a.toLowerCase() === HOOK_ADMIN.toLowerCase());

  const load = useCallback(() => {
    fetch("/api/orbio").then((r) => r.json()).then(setStatus).catch(() => {});
    client.readContract({ address: USDG, abi: erc20Abi, functionName: "balanceOf", args: [HOOK_ADMIN] }).then(setUsdg).catch(() => {});
  }, []);
  useEffect(load, [load]);

  useEffect(() => {
    let units: bigint;
    try { units = parseUnits(amount || "0", 6); } catch { return setQuote(null); }
    if (units <= BigInt(0)) return setQuote(null);
    const t = setTimeout(() => {
      client.readContract({ address: ORBIO_EXCHANGE, abi: ORBIO_EXCHANGE_ABI, functionName: "getActivationQuote", args: [units, ORBIO_MAX_FILLS] })
        .then(([q, credited]) => setQuote({ credited: Number(credited) / 1e6, minOut: (q.creditOut * BigInt(99)) / BigInt(100) }))
        .catch(() => setQuote(null));
    }, 300);
    return () => clearTimeout(t);
  }, [amount]);

  async function buy() {
    if (!status?.account || !quote) return;
    setError(""); setDone([]);
    try {
      const units = parseUnits(amount, 6);
      const steps = [
        { label: "Approve USDG for the Orbio exchange", to: USDG, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [ORBIO_EXCHANGE, units] }) },
        { label: "Buy and activate CREDIT for Beeper", to: ORBIO_EXCHANGE as `0x${string}`, data: encodeFunctionData({ abi: ORBIO_EXCHANGE_ABI, functionName: "buyAndActivate", args: [units, quote.minOut, beneficiaryOf(status.account), ORBIO_MAX_FILLS] }) },
      ];
      for (const s of steps) {
        setRunning(`${s.label}: confirm in your wallet`);
        const hash = await auth.sendTx(HOOK_ADMIN, s);
        setRunning(`${s.label}: waiting for the chain`);
        const r = await client.waitForTransactionReceipt({ hash });
        if (r.status !== "success") throw new Error(`${s.label} failed on chain`);
        setDone((d) => [...d, hash]);
      }
      setTimeout(load, 4000);
    } catch (e) {
      const msg = (e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message;
      setError(/reject|denied/i.test(msg) ? "Cancelled in the wallet." : msg.slice(0, 200));
    } finally { setRunning(""); }
  }

  const spend = Number(amount) || 0;
  return (
    <div className="mt-8 space-y-4">
      <div className="card grid gap-4 p-5 text-sm sm:grid-cols-3 [&>*]:min-w-0">
        <div><p className="text-xs text-mute">Routing through Orbio</p><p className={`mt-1 ${status?.enabled ? "text-ember" : "text-warn"}`}>{status ? (status.enabled ? "On" : "Off (set ORBIO_UPSTREAM=1)") : "…"}</p></div>
        <div><p className="text-xs text-mute">Beeper&apos;s Orbio balance</p><p className="mt-1 font-mono text-bone">{!status ? "…" : status.balance ? usd(status.balance.available) : "n/a"}</p></div>
        <div><p className="text-xs text-mute">Orbio account (server wallet)</p><p className="mt-1 truncate font-mono text-bone">{!status ? "…" : status.account ?? "SERVER_WALLET_KEY not set"}</p></div>
      </div>

      <div className="card p-5">
        <p className="text-sm text-bone">Restock from Orbio&apos;s order book</p>
        <p className="mt-1 text-xs text-mute">The admin wallet pays USDG on Robinhood Chain; the CREDIT is activated straight into Beeper&apos;s Orbio account.</p>
        <label className="mt-4 flex items-center gap-2 rounded-md border border-line bg-ink px-3 focus-within:border-ember">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" disabled={Boolean(running)} className="w-full bg-transparent py-2.5 font-mono text-sm outline-none" />
          <span className="shrink-0 text-xs text-mute">USDG</span>
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3 font-mono text-sm">
          <div><p className="text-xs text-mute">Inference you get</p><p className="text-bone">{quote ? usd(quote.credited) : "n/a"}</p></div>
          <div><p className="text-xs text-mute">Effective discount</p><p className="text-ember">{quote && spend ? `${Math.round((1 - spend / quote.credited) * 100)}% off` : "n/a"}</p></div>
        </div>
        {usdg !== null && <p className="mt-3 font-mono text-xs text-mute">Admin wallet holds {Number(formatUnits(usdg, 6)).toLocaleString()} USDG</p>}
        {!isAdmin && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="text-sm text-warn">Connect the admin wallet {short(HOOK_ADMIN)}.</p>
            <button onClick={() => (auth.authenticated ? auth.connectWallet() : auth.login())} className="btn btn-ghost h-9 text-sm">Connect wallet</button>
          </div>
        )}
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        {done.map((h) => <a key={h} href={explorerTx(h)} target="_blank" rel="noreferrer" className="mt-2 block truncate font-mono text-xs text-ember-soft underline">{h}</a>)}
        <button onClick={buy} disabled={!isAdmin || !quote || !status?.account || Boolean(running) || (usdg !== null && parseUnits(amount || "0", 6) > usdg)}
          className="btn btn-primary mt-4 w-full disabled:opacity-50">{running || "Buy and activate"}</button>
        <p className="mt-3 text-xs text-mute">Two wallet confirmations. Accepts at most 1% less CREDIT than quoted. Orbio&apos;s balance can take a moment to show up after activation.</p>
      </div>
    </div>
  );
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
