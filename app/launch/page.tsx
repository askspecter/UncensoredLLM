import LaunchList from "@/components/LaunchList";

export const metadata = {
  title: "Beeper Launchpad | Coins paired with AI",
  description: "Launch a coin on Robinhood Chain paired with an AI model. Every trade pays its holders in Beeper AI credit.",
};

const STEPS = [
  ["Pick a model", "Launch on Pons, paired with USDG, and lock in the AI model your coin stands for."],
  ["People trade", "Every trade on the curve pays a small fee in USDG."],
  ["Holders get AI", "80% of the fees becomes Beeper credit for holders, split by how much each holds."],
];

export default function LaunchPage() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-10 md:py-14">
      <p className="eyebrow">launch.usebeeper.io</p>
      <h1 className="mt-4 font-serif text-[14vw] leading-[0.8] whitespace-nowrap text-ember sm:text-[96px] md:text-[116px] lg:text-[150px]">LAUNCHPAD</h1>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-5">
        <p className="max-w-3xl text-3xl leading-[1.08] font-semibold tracking-[-0.035em] text-bone md:text-5xl">
          Coins paired with AI. <span className="text-mute">Every trade pays holders in LLM credit.</span>
        </p>
        <a href="/launch/new" className="btn btn-primary">Launch a coin</a>
      </div>
      <div className="mt-10 grid gap-3 md:grid-cols-3">
        {STEPS.map(([t, d], i) => (
          <div key={t} className="card p-5">
            <p className="font-serif text-4xl leading-none text-ember">0{i + 1}</p>
            <p className="mt-3 font-semibold text-bone">{t}</p>
            <p className="mt-2 text-sm text-mute">{d}</p>
          </div>
        ))}
      </div>
      <h2 className="mt-14 text-3xl leading-[1.1] font-semibold tracking-[-0.035em] text-bone md:text-4xl">Coins</h2>
      <div className="mt-6"><LaunchList /></div>
    </main>
  );
}
