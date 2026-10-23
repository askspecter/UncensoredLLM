import SellForm from "@/components/SellForm";
import { LiquidityBook } from "@/components/Market";

export const metadata = { title: "Sell unused AI credits — Beeper" };

const STEPS = [
  ["01", "List", "Pick how much of your Beeper balance to sell and the discount you’ll accept. Minimum $10."],
  ["02", "Sell", "Buyers’ orders fill from the deepest discount first. Your credit is held in escrow until it sells."],
  ["03", "Get paid", "You receive the sale price in USDG on Robinhood Chain. Cancel any time to get unsold credit back."],
];

export default function Sell() {
  return (
    <main className="mx-auto max-w-6xl px-5 pt-20">
      <p className="eyebrow">Sell credits</p>
      <h1 className="mt-3 max-w-3xl font-serif text-5xl leading-tight md:text-6xl">Turn idle credit into <em className="text-ember-soft">USDG</em>.</h1>
      <p className="mt-4 max-w-2xl text-mute">Bought more Beeper credit than you’ll use? List it on the order book and get paid when someone buys it.</p>

      <div className="mt-12 grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <SellForm />
        <div className="space-y-6">
          {STEPS.map(([n, t, d]) => (
            <div key={n} className="flex gap-4">
              <span className="font-mono text-sm text-ember">{n}</span>
              <div><h3 className="text-lg">{t}</h3><p className="mt-1 text-sm text-mute">{d}</p></div>
            </div>
          ))}
          <LiquidityBook />
        </div>
      </div>
    </main>
  );
}
