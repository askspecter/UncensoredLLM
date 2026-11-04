import LaunchForm from "@/components/LaunchForm";
import { CURVE_LAUNCHER, LAUNCHER, curveLauncherState, launcherState } from "@/lib/launch-server";

export const metadata = { title: "Launch a coin | Beeper Launchpad" };
export const dynamic = "force-dynamic";

export default async function NewLaunch() {
  // New coins go to Beeper's own curve (anti sniper protection) once it is deployed; until then, to Pons.
  const [curve, pons] = await Promise.all([curveLauncherState().catch(() => null), launcherState().catch(() => null)]);
  const onCurve = Boolean(curve?.ready);
  return (
    <main className="mx-auto max-w-6xl px-5 py-10 md:py-14">
      <a href="/launch" className="text-sm text-mute hover:text-bone">Launchpad</a>
      <h1 className="mt-3 text-4xl leading-[1.05] font-semibold tracking-[-0.035em] text-bone md:text-5xl">Launch a coin paired with AI.</h1>
      <p className="mt-3 max-w-2xl text-mute">
        {onCurve
          ? "One transaction creates your coin on the Beeper curve, paired with USDG, with anti sniper protection and your first buy before any bot. Its holders earn Beeper credit from every trade, and it graduates to a locked Uniswap v4 pool."
          : "One transaction creates your coin on Pons, paired with USDG, and locks in the AI model it stands for. Its holders earn Beeper credit from every trade."}
      </p>
      <div className="mt-8">
        {onCurve ? <LaunchForm launcher={CURVE_LAUNCHER} kind="curve" />
          : pons ? <LaunchForm launcher={LAUNCHER} />
          : <p className="card p-6 text-sm text-mute">The launchpad contracts are being deployed. Launching opens here as soon as they are live.</p>}
      </div>
    </main>
  );
}
