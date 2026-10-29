import TradeTerminal from "@/components/TradeTerminal";

export const metadata = {
  title: "beeper.trade | Trade stocks. Get paid in AI.",
  description: "Swap NVDA, TSLA, SPY and more on Robinhood Chain. Your swap fee comes back as AI credit, and every pool is scanned for hidden hook fees before you trade.",
  openGraph: { images: ["/trade-og.png"] },
  twitter: { card: "summary_large_image", images: ["/trade-og.png"] },
};

const POINTS = [
  { n: "01", t: "Your fee comes back as AI", d: "Every swap pays a 0.25% fee in USDG. All of it returns to you as Beeper credit for 400+ models, in the same minute." },
  { n: "02", t: "Hook Scan", d: "Some pools show 0% and quietly take more through hooks. We measure every pool before you trade and only route through honest ones." },
  { n: "03", t: "Only real stocks", d: "Lookalike tokens with the same name are everywhere. beeper.trade only lists official Robinhood stock tokens, checked on chain." },
];

export default function TradePage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-10 md:py-14">
      <p className="font-serif text-[12vw] leading-none whitespace-nowrap text-ember sm:text-[80px] md:text-8xl">beeper.trade</p>
      <h1 className="mt-4 max-w-3xl text-3xl leading-[1.08] font-semibold tracking-[-0.035em] text-bone md:text-5xl">
        Every swap pays you back in AI. <span className="text-mute">Every hidden fee gets exposed.</span>
      </h1>
      <TradeTerminal />
      <div className="mt-10 grid gap-3 md:grid-cols-3">
        {POINTS.map((p) => (
          <div key={p.n} className="card p-5">
            <p className="font-serif text-4xl leading-none text-ember">{p.n}</p>
            <p className="mt-3 font-semibold text-bone">{p.t}</p>
            <p className="mt-2 text-sm text-mute">{p.d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
