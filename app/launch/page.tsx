export const metadata = {
  title: "Beeper Launchpad | Coming soon",
  description: "A launchpad paired with LLM credits on Beeper. On Robinhood Chain. Coming soon.",
};

const FACTS = [
  ["Paired with LLM credits", "Every launch is paired with Beeper credit, the same credit that runs 400+ models."],
  ["On Robinhood Chain", "Where Beeper already lives: USDG payments, BeeperHook and beeper.trade."],
  ["Details soon", "Follow along on X and Telegram. You hear it there first."],
];

export default function LaunchPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-6xl flex-col justify-center px-5 py-14">
      <p className="eyebrow">launch.usebeeper.io</p>
      <div className="mt-6 flex items-center gap-4">
        <span className="h-3 w-3 animate-pulse rounded-full bg-ember" aria-hidden />
        <span className="font-mono text-xs tracking-[0.3em] text-mute">INCOMING TRANSMISSION</span>
      </div>
      <h1 className="mt-4 font-serif text-[14vw] leading-[0.8] whitespace-nowrap text-ember sm:text-[96px] md:text-[116px] lg:text-[160px]">
        LAUNCHPAD<span className="ml-2 inline-block h-[0.7em] w-[0.42em] animate-pulse bg-ember align-[-0.05em]" aria-hidden />
      </h1>
      <p className="mt-8 max-w-3xl text-3xl leading-[1.08] font-semibold tracking-[-0.035em] text-bone md:text-5xl">
        A launchpad paired with LLM credits. <span className="text-mute">Coming soon on Beeper.</span>
      </p>
      <div className="mt-12 grid gap-3 md:grid-cols-3">
        {FACTS.map(([t, d], i) => (
          <div key={t} className="card p-5">
            <p className="font-serif text-4xl leading-none text-ember">0{i + 1}</p>
            <p className="mt-3 font-semibold text-bone">{t}</p>
            <p className="mt-2 text-sm text-mute">{d}</p>
          </div>
        ))}
      </div>
      <div className="mt-10 flex flex-wrap gap-3">
        <a href="https://x.com/usebeeper" target="_blank" rel="noreferrer" className="btn btn-primary">Follow @usebeeper on X</a>
        <a href="https://t.me/usebeeper" target="_blank" rel="noreferrer" className="btn btn-ghost">Join the Telegram</a>
        <a href="/" className="btn btn-ghost">Use Beeper now</a>
      </div>
    </main>
  );
}
