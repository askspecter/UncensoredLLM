import HookSim from "@/components/HookSim";
import PageHeader from "@/components/PageHeader";

export const metadata = { title: "BeeperHook | Beeper", description: "A Uniswap v4 hook for $BEEP: USDG fees fund bCREDIT for holders, BEEP fees are burned." };

const HOOK = process.env.NEXT_PUBLIC_BEEPER_HOOK;

const POINTS = [
  { t: "Sells fund bCREDIT", d: "The hook fee on a sell is paid in USDG and goes to the bCREDIT pool, shared with $BEEP holders as AI credit." },
  { t: "Buys burn $BEEP", d: "The hook fee on a buy is paid in $BEEP and sent to the dead address. Supply only goes down." },
  { t: "Launch guard", d: "For the first hour the fee steps down from 5% to 1%, and any swap over 500 USDG is refused. Snipers pay, whales wait." },
  { t: "No admin", d: "Every setting is fixed at deploy. No owner, no upgrade, no switch to change the fee later." },
];

export default function HookPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-12 md:py-16">
      <PageHeader eyebrow="BeeperHook" title={<>Every $BEEP trade <span className="text-ember">feeds holders.</span></>}
        sub="A Uniswap v4 hook on a $BEEP / USDG pool. Run swaps through it below before it goes live: fees, refusals and where every cent goes.">
        <span className={`rounded border px-3 py-1.5 font-mono text-xs ${HOOK ? "border-ember text-bone" : "border-line text-mute"}`}>
          {HOOK ? `Live · ${HOOK.slice(0, 6)}…${HOOK.slice(-4)}` : "Not deployed yet"}
        </span>
      </PageHeader>
      <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {POINTS.map((p) => (
          <div key={p.t} className="card p-5"><p className="font-semibold text-bone">{p.t}</p><p className="mt-2 text-sm text-mute">{p.d}</p></div>
        ))}
      </div>
      <h2 className="mt-14 text-3xl leading-[1.1] font-semibold tracking-[-0.035em] text-bone md:text-4xl">Run a swap through it.</h2>
      <p className="mt-3 max-w-2xl text-mute">Pick a scenario or edit the swaps. Nothing here touches the chain.</p>
      <div className="mt-6"><HookSim /></div>
    </div>
  );
}
