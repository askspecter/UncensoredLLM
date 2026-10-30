"use client";
import { useCallback, useEffect, useState } from "react";
import { createPublicClient, http, type Hex } from "viem";
import { useAuth } from "./Providers";
import { explorerTx, robinhood } from "@/lib/chain";
import { CREDIT_SINK, LAUNCH_ADMIN, LAUNCH_TREASURY, deployPlan } from "@/lib/launch";
import CODE from "@/lib/launch-bytecode.json";

const client = createPublicClient({ chain: robinhood, transport: http() });
const PLAN = deployPlan(CODE as { router: Hex; launcher: Hex });
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const ADDR = { router: PLAN.router, launcher: PLAN.launcher } as Record<string, `0x${string}`>;

/** Deploys the launchpad's two contracts from the admin wallet. CREATE2: the addresses below are final. */
export default function AdminLaunch() {
  const auth = useAuth();
  const [live, setLive] = useState<Record<string, boolean>>({});
  const [tx, setTx] = useState<Record<string, string>>({});
  const [running, setRunning] = useState("");
  const [error, setError] = useState("");
  const isAdmin = auth.walletAddresses.some((a) => a.toLowerCase() === LAUNCH_ADMIN.toLowerCase());

  const check = useCallback(async () => {
    const codes = await Promise.all(PLAN.steps.map((s) => client.getCode({ address: ADDR[s.id] })));
    setLive(Object.fromEntries(PLAN.steps.map((s, i) => [s.id, Boolean(codes[i] && codes[i] !== "0x")])));
  }, []);
  useEffect(() => { check(); }, [check]);

  async function deploy() {
    setError("");
    try {
      for (const s of PLAN.steps) {
        if (live[s.id]) continue;
        setRunning(`${s.label}: confirm in your wallet`);
        const hash = await auth.sendTx(LAUNCH_ADMIN, { to: s.to, data: s.data, gas: BigInt(3_000_000) });
        setTx((t) => ({ ...t, [s.id]: hash }));
        setRunning(`${s.label}: waiting for the chain`);
        const r = await client.waitForTransactionReceipt({ hash });
        if (r.status !== "success") throw new Error(`${s.label} failed on chain`);
        await check();
      }
      await fetch("/api/launch/sync", { method: "POST" });
      setRunning("Launchpad is live.");
    } catch (e) {
      const msg = (e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message;
      setError(/reject|denied/i.test(msg) ? "Cancelled." : msg.slice(0, 200)); setRunning("");
    }
  }

  const all = PLAN.steps.every((s) => live[s.id]);
  return (
    <div className="mt-8 space-y-4">
      <div className="card p-5 text-sm">
        <p className="font-semibold text-bone">Fixed at deploy</p>
        <dl className="mt-3 space-y-1.5 font-mono text-xs">
          <div className="flex justify-between gap-3"><dt className="text-mute">Holders credit (80%) to</dt><dd className="text-bone">{short(CREDIT_SINK)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-mute">Treasury (20%) to</dt><dd className="text-bone">{short(LAUNCH_TREASURY)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-mute">Pair token</dt><dd className="text-bone">USDG</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-mute">Sign with</dt><dd className="text-bone">{short(LAUNCH_ADMIN)}</dd></div>
        </dl>
      </div>
      <ul className="card divide-y divide-line">
        {PLAN.steps.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
            <span className={live[s.id] ? "text-bone" : "text-mute"}>{live[s.id] ? "✓ " : ""}{s.label}</span>
            <span className="font-mono text-xs text-mute">
              {tx[s.id] ? <a className="underline" href={explorerTx(tx[s.id])} target="_blank" rel="noreferrer">{short(tx[s.id])}</a>
                : <a className="underline" href={`https://robinhoodchain.blockscout.com/address/${ADDR[s.id]}`} target="_blank" rel="noreferrer">{short(ADDR[s.id])}</a>}
            </span>
          </li>
        ))}
      </ul>
      {all ? <a href="/launch" className="btn btn-primary w-full">Launchpad is live. Open it</a> : (
        <button onClick={isAdmin ? deploy : () => auth.connectWallet()} disabled={Boolean(running) && !error} className="btn btn-primary w-full disabled:opacity-50">
          {!isAdmin ? `Connect ${short(LAUNCH_ADMIN)}` : running || "Deploy launchpad (2 transactions)"}
        </button>
      )}
      {running && !all && <p className="text-sm text-mute">{running}</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
      <p className="text-xs text-mute">Each deploy costs a little ETH for gas. Deploys go through the standard CREATE2 deployer, so the addresses above are the final ones and anyone can check them first.</p>
    </div>
  );
}
