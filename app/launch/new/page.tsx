import LaunchForm from "@/components/LaunchForm";
import { LAUNCHER, launcherState } from "@/lib/launch-server";

export const metadata = { title: "Launch a coin | Beeper Launchpad" };
export const dynamic = "force-dynamic";

export default async function NewLaunch() {
  const live = await launcherState().catch(() => null);
  return (
    <main className="mx-auto max-w-6xl px-5 py-10 md:py-14">
      <a href="/launch" className="text-sm text-mute hover:text-bone">Launchpad</a>
      <h1 className="mt-3 text-4xl leading-[1.05] font-semibold tracking-[-0.035em] text-bone md:text-5xl">Launch a coin paired with AI.</h1>
      <p className="mt-3 max-w-2xl text-mute">One transaction creates your coin on Pons, paired with USDG, and locks in the AI model it stands for. Its holders earn Beeper credit from every trade.</p>
      <div className="mt-8">
        {live ? <LaunchForm launcher={LAUNCHER} /> : <p className="card p-6 text-sm text-mute">The launchpad contracts are being deployed. Launching opens here as soon as they are live.</p>}
      </div>
    </main>
  );
}
