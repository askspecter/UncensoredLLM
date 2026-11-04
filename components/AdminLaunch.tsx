"use client";
import { useCallback, useEffect, useState } from "react";
import { createPublicClient, http, type Hex } from "viem";
import { useAuth } from "./Providers";
import { explorerTx, robinhood } from "@/lib/chain";
import { CREDIT_SINK, LAUNCH_ADMIN, LAUNCH_TREASURY, curvePlan, deployPlan } from "@/lib/launch";
import CODE from "@/lib/launch-bytecode.json";

const client = createPublicClient({ chain: robinhood, transport: http() });
const PONS_PLAN = deployPlan(CODE as { router: Hex; launcher: Hex });
const CURVE_PLAN = curvePlan(CODE as Parameters<typeof curvePlan>[0]);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

type Step = { id: string; label: string; to: `0x${string}`; data: Hex; address: `0x${string}` };
const PONS_STEPS: Step[] = PONS_PLAN.steps.map((s) => ({ ...s, address: s.id === "router" ? PONS_PLAN.router : PONS_PLAN.launcher }));

/** Deploys a set of launchpad contracts from the admin wallet. CREATE2: the addresses shown are final. */
function DeploySteps({ title, sub, steps, button, needs }: { title: string; sub: string; steps: Step[]; button: string; needs?: Step[] }) {
  const auth = useAuth();
  const [live, setLive] = useState<Record<string, boolean>>({});
  const [tx, setTx] = useState<Record<string, string>>({});
  const [running, setRunning] = useState("");
  const [error, setError] = useState("");
  const isAdmin = auth.walletAddresses.some((a) => a.toLowerCase() === LAUNCH_ADMIN.toLowerCase());

  const check = useCallback(async () => {
    const all = [...steps, ...(needs ?? [])];
    const codes = await Promise.all(all.map((s) => client.getCode({ address: s.address })));
    setLive(Object.fromEntries(all.map((s, i) => [s.id, Boolean(codes[i] && codes[i] !== "0x")])));
  }, [steps, needs]);
  useEffect(() => { check(); }, [check]);

  async function deploy() {
    setError("");
    try {
      for (const s of steps) {
        if (live[s.id]) continue;
        setRunning(`${s.label}: confirm in your wallet`);
        const hash = await auth.sendTx(LAUNCH_ADMIN, { to: s.to, data: s.data, gas: BigInt(5_000_000) });
        setTx((t) => ({ ...t, [s.id]: hash }));
        setRunning(`${s.label}: waiting for the chain`);
        const r = await client.waitForTransactionReceipt({ hash });
        if (r.status !== "success") throw new Error(`${s.label} failed on chain`);
        await check();
      }
      await fetch("/api/launch/sync", { method: "POST" });
      setRunning("Live.");
    } catch (e) {
      const msg = (e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message;
      setError(/reject|denied/i.test(msg) ? "Cancelled." : msg.slice(0, 200)); setRunning("");
    }
  }

  const all = steps.every((s) => live[s.id]);
  const blocked = (needs ?? []).some((s) => !live[s.id]);
  return (
    <section className="space-y-3">
      <div><h2 className="text-xl font-semibold text-bone">{title}</h2><p className="mt-1 text-sm text-mute">{sub}</p></div>
      <ul className="card divide-y divide-line">
        {steps.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
            <span className={live[s.id] ? "text-bone" : "text-mute"}>{live[s.id] ? "✓ " : ""}{s.label}</span>
            <span className="font-mono text-xs text-mute">
              {tx[s.id] ? <a className="underline" href={explorerTx(tx[s.id])} target="_blank" rel="noreferrer">{short(tx[s.id])}</a>
                : <a className="underline" href={`https://robinhoodchain.blockscout.com/address/${s.address}`} target="_blank" rel="noreferrer">{short(s.address)}</a>}
            </span>
          </li>
        ))}
      </ul>
      {all ? <a href="/launch/new" className="btn btn-primary w-full">Live. Open the launch page</a> : blocked ? (
        <p className="card p-4 text-sm text-mute">Deploy the Pons launchpad above first: this one reuses its CreditRouter.</p>
      ) : (
        <button onClick={isAdmin ? deploy : () => auth.connectWallet()} disabled={Boolean(running) && !error} className="btn btn-primary w-full disabled:opacity-50">
          {!isAdmin ? `Connect ${short(LAUNCH_ADMIN)}` : running || button}
        </button>
      )}
      {running && !all && <p className="text-sm text-mute">{running}</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
    </section>
  );
}

export default function AdminLaunch() {
  return (
    <div className="mt-8 space-y-8">
      <div className="card p-5 text-sm">
        <p className="font-semibold text-bone">Fixed at deploy</p>
        <dl className="mt-3 space-y-1.5 font-mono text-xs">
          <div className="flex justify-between gap-3"><dt className="text-mute">Holders credit (80%) to</dt><dd className="text-bone">{short(CREDIT_SINK)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-mute">Treasury (20%) to</dt><dd className="text-bone">{short(LAUNCH_TREASURY)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-mute">Pair token</dt><dd className="text-bone">USDG</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-mute">Sign with</dt><dd className="text-bone">{short(LAUNCH_ADMIN)}</dd></div>
        </dl>
      </div>
      <DeploySteps title="Pons launchpad" sub="Coins on Pons V2 curves. CreditRouter and BeeperLauncher." steps={PONS_STEPS} button="Deploy Pons launchpad (2 transactions)" />
      <DeploySteps title="Beeper curve launchpad" sub="Beeper's own curve: anti sniper protection, creator first buy, graduation to a locked Uniswap v4 pool. New launches use it once it is live."
        steps={CURVE_PLAN.steps} needs={PONS_STEPS.filter((s) => s.id === "router")} button="Deploy Beeper curve (3 transactions)" />
      <p className="text-xs text-mute">Each deploy costs a little ETH for gas. Contracts go through the standard CREATE2 deployer, so the addresses above are the final ones and anyone can check them first. The GraduationGuard lands on an address mined for its Uniswap hook flags.</p>
    </div>
  );
}
