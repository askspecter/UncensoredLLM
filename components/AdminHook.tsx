"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPublicClient, erc20Abi, formatUnits, http, parseUnits } from "viem";
import { useAuth } from "./Providers";
import { USDG, explorerTx, robinhood } from "@/lib/chain";
import { BEEP } from "@/lib/token";
import { HOOK_ADMIN, HOOK_VAULT, deploySteps, initCode, mineSalt, type HookParams } from "@/lib/hook";

const client = createPublicClient({ chain: robinhood, transport: http(process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL || undefined) });
const SAVE = "beeper.hook.deploy";
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

type Saved = { params: Record<string, string>; salt: `0x${string}`; hook: `0x${string}`; done: Record<string, string>; fromBlock?: string };
type Form = { beep: string; usdg: string; base: string; launch: string; window: string; cap: string; lp: string };

function toParams(f: Form): HookParams {
  return {
    beepAmount: parseUnits(f.beep || "0", 18), usdgAmount: parseUnits(f.usdg || "0", 6),
    baseFeeBps: Math.round(Number(f.base) * 100), launchFeeBps: Math.round(Number(f.launch) * 100),
    launchWindow: Math.round(Number(f.window) * 60), maxSwapUsdg: parseUnits(f.cap || "0", 6), lpFee: Math.round(Number(f.lp) * 10_000),
  };
}
const load = (): Saved | null => { try { return JSON.parse(localStorage.getItem(SAVE) ?? "null"); } catch { return null; } };
const store = (s: Saved | null) => { try { s ? localStorage.setItem(SAVE, JSON.stringify(s)) : localStorage.removeItem(SAVE); } catch { /* ignore */ } };

export default function AdminHook() {
  const auth = useAuth();
  const [form, setForm] = useState<Form>({ beep: "10000000", usdg: "300", base: "1", launch: "5", window: "60", cap: "500", lp: "0.3" });
  const [live, setLive] = useState<{ address: string; feeBps?: number } | null | undefined>(undefined);
  const [bal, setBal] = useState<{ eth: bigint; beep: bigint; usdg: bigint } | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [running, setRunning] = useState("");
  const [error, setError] = useState("");

  const isAdmin = auth.walletAddresses.some((a) => a.toLowerCase() === HOOK_ADMIN.toLowerCase());

  useEffect(() => {
    fetch("/api/hook").then((r) => r.json()).then((d) => setLive(d.hook ?? null)).catch(() => setLive(null));
    const s = load();
    if (s) { setSaved(s); setForm(s.params as Form); }
  }, []);

  useEffect(() => {
    Promise.all([
      client.getBalance({ address: HOOK_ADMIN }),
      client.readContract({ address: BEEP.address, abi: erc20Abi, functionName: "balanceOf", args: [HOOK_ADMIN] }),
      client.readContract({ address: USDG, abi: erc20Abi, functionName: "balanceOf", args: [HOOK_ADMIN] }),
    ]).then(([eth, beep, usdg]) => setBal({ eth, beep, usdg })).catch(() => {});
  }, [running]);

  const params = useMemo(() => { try { return toParams(form); } catch { return null; } }, [form]);
  const price = Number(form.usdg) / Number(form.beep);
  const problems = !params ? ["Check the numbers"] : [
    params.beepAmount <= BigInt(0) || params.usdgAmount <= BigInt(0) ? "Seed both tokens" : "",
    params.baseFeeBps > 500 ? "Base fee is at most 5%" : "",
    params.launchFeeBps < params.baseFeeBps || params.launchFeeBps > 2500 ? "Launch fee must be between the base fee and 25%" : "",
    bal && params.beepAmount > bal.beep ? "Admin wallet doesn't hold enough $BEEP" : "",
    bal && params.usdgAmount > bal.usdg ? "Admin wallet doesn't hold enough USDG" : "",
    bal && bal.eth === BigInt(0) ? "Admin wallet needs a little ETH for gas" : "",
  ].filter(Boolean);

  const run = useCallback(async () => {
    if (!params) return;
    setError("");
    try {
      // Same settings as a half-finished run: resume it. Otherwise mine a fresh hook address.
      let s = saved && JSON.stringify(saved.params) === JSON.stringify(form) ? saved : null;
      if (!s) {
        setRunning("Finding the hook address…");
        await new Promise((r) => setTimeout(r, 30));
        const { salt, hook } = mineSalt(initCode(params));
        s = { params: form as unknown as Record<string, string>, salt, hook, done: {} };
        store(s); setSaved(s);
      }
      const block = await client.getBlock();
      const steps = deploySteps(params, s.salt, s.hook, block.timestamp + BigInt(1800));
      for (const step of steps) {
        if (s.done[step.id]) continue;
        setRunning(`${step.label}: confirm in your wallet`);
        const hash = await auth.sendTx(HOOK_ADMIN, { to: step.to, data: step.data });
        setRunning(`${step.label}: waiting for the chain`);
        const r = await client.waitForTransactionReceipt({ hash });
        if (r.status !== "success") throw new Error(`${step.label} failed on chain`);
        s = { ...s, done: { ...s.done, [step.id]: hash }, ...(step.id === "deploy" ? { fromBlock: r.blockNumber.toString() } : {}) };
        store(s); setSaved(s);
      }
      setRunning("Registering the hook…");
      const res = await fetch("/api/hook", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: s.hook, fromBlock: s.fromBlock }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Could not register the hook");
      setLive({ address: s.hook }); store(null);
    } catch (e) {
      const msg = (e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message;
      setError(/reject|denied/i.test(msg) ? "Cancelled in the wallet. Press Deploy to continue where you stopped." : msg.slice(0, 200));
    } finally { setRunning(""); }
  }, [params, saved, form, auth]);

  if (live) {
    return (
      <div className="card mt-8 p-5">
        <p className="text-sm text-mute">BeeperHook is live</p>
        <a href={`${robinhood.blockExplorers.default.url}/address/${live.address}`} target="_blank" rel="noreferrer" className="mt-1 block break-all font-mono text-bone underline">{live.address}</a>
        <p className="mt-3 text-sm text-mute">USDG fees go to {short(HOOK_VAULT)} and into the daily bCREDIT pool automatically.</p>
      </div>
    );
  }

  const field = (k: keyof Form, label: string, suffix: string) => (
    <label className="block min-w-0">
      <span className="text-xs text-mute">{label}</span>
      <span className="mt-1 flex items-center rounded-md border border-line bg-ink px-3 focus-within:border-ember">
        <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} disabled={Boolean(running)} inputMode="decimal"
          className="w-full min-w-0 bg-transparent py-2 font-mono text-sm outline-none" />
        <span className="shrink-0 text-xs text-mute">{suffix}</span>
      </span>
    </label>
  );
  const stepIds = ["deploy", "init", "approve-beep", "approve-usdg", "permit-beep", "permit-usdg", "liquidity"];
  const stepLabels = ["Deploy BeeperHook", "Create the $BEEP / USDG pool", "Approve $BEEP for Permit2", "Approve USDG for Permit2", "Let Uniswap use $BEEP", "Let Uniswap use USDG", "Add full-range liquidity"];

  return (
    <div className="mt-8 space-y-4">
      <div className="card p-5 text-sm">
        <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
          <div><p className="text-xs text-mute">Admin wallet (signs everything)</p><p className="mt-1 font-mono text-bone">{short(HOOK_ADMIN)}</p></div>
          <div><p className="text-xs text-mute">Vault (USDG fees for bCREDIT)</p><p className="mt-1 font-mono text-bone">{short(HOOK_VAULT)}</p></div>
        </div>
        {bal && (
          <p className="mt-3 font-mono text-xs text-mute">
            Holds {Number(formatUnits(bal.beep, 18)).toLocaleString("en-US", { maximumFractionDigits: 0 })} BEEP · {Number(formatUnits(bal.usdg, 6)).toLocaleString()} USDG · {Number(formatUnits(bal.eth, 18)).toFixed(5)} ETH
          </p>
        )}
        {!isAdmin && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="text-warn">Connect the admin wallet {short(HOOK_ADMIN)} to deploy.</p>
            <button onClick={() => (auth.authenticated ? auth.connectWallet() : auth.login())} className="btn btn-ghost h-9 text-sm">Connect wallet</button>
          </div>
        )}
      </div>

      <div className="card p-5">
        <p className="text-sm text-bone">First liquidity</p>
        <div className="mt-3 grid grid-cols-2 gap-3 [&>*]:min-w-0">
          {field("beep", "$BEEP", "BEEP")}
          {field("usdg", "USDG", "USDG")}
        </div>
        <p className="mt-2 font-mono text-xs text-mute">
          Start price {Number.isFinite(price) ? `$${price.toPrecision(3)}` : "n/a"} per BEEP · fully diluted {Number.isFinite(price) ? `$${Math.round(price * 1e9).toLocaleString()}` : "n/a"}. Match the Pons price.
        </p>
        <p className="mt-5 text-sm text-bone">Hook settings <span className="text-xs text-mute">(fixed forever once deployed)</span></p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5 [&>*]:min-w-0">
          {field("base", "Base fee", "%")}
          {field("launch", "Launch fee", "%")}
          {field("window", "Launch window", "min")}
          {field("cap", "Launch cap", "USDG")}
          {field("lp", "LP fee", "%")}
        </div>
      </div>

      <div className="card p-5">
        <ol className="space-y-2 text-sm">
          {stepIds.map((id, i) => {
            const hash = saved?.done[id];
            return (
              <li key={id} className="flex items-center gap-3">
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-[11px] ${hash ? "bg-ember text-ink" : "border border-line text-mute"}`}>{hash ? "✓" : i + 1}</span>
                <span className={hash ? "text-bone" : "text-mute"}>{stepLabels[i]}</span>
                {hash && <a href={explorerTx(hash)} target="_blank" rel="noreferrer" className="ml-auto font-mono text-xs text-ember-soft underline">tx</a>}
              </li>
            );
          })}
        </ol>
        {saved && <p className="mt-3 break-all font-mono text-[11px] text-mute">Hook address: {saved.hook}</p>}
        {problems.length > 0 && <p className="mt-4 text-sm text-warn">{problems[0]}.</p>}
        {error && <p className="mt-4 text-sm text-danger">{error}</p>}
        <button onClick={run} disabled={!isAdmin || Boolean(running) || problems.length > 0} className="btn btn-primary mt-4 w-full disabled:opacity-50">
          {running || (saved && Object.keys(saved.done).length ? "Continue deploy" : "Deploy BeeperHook")}
        </button>
        <p className="mt-3 text-xs text-mute">Seven wallet confirmations. Nothing is sent to Beeper&apos;s servers except the final hook address, which the server checks on chain.</p>
      </div>
    </div>
  );
}
