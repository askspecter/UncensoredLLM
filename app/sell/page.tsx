import SellForm from "@/components/SellForm";

export const metadata = { title: "Sell unused AI credits — Beeper" };

const STEPS = [
  ["01", "Apply", "Tell us where the credit sits, how much, and the discount you’d accept. Minimum $50."],
  ["02", "Verify", "When the seller marketplace opens we verify the balance with a read-only or scoped key."],
  ["03", "Get paid", "Your credit is sold to Beeper buyers and you’re paid in USDG on Robinhood Chain."],
];

export default function Sell() {
  return (
    <main className="mx-auto max-w-6xl px-5 pt-20">
      <p className="eyebrow">Sell credits · early access</p>
      <h1 className="mt-3 max-w-3xl font-serif text-5xl leading-tight md:text-6xl">Turn idle credit into <em className="text-ember-soft">USDG</em>.</h1>
      <p className="mt-4 max-w-2xl text-mute">
        The seller marketplace isn’t open yet. Apply now with your startup grants, hackathon credits or over-provisioned
        top-ups and you’ll be first in line when it launches.
      </p>

      <div className="mt-12 grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <SellForm />
        <div className="space-y-6">
          {STEPS.map(([n, t, d]) => (
            <div key={n} className="flex gap-4">
              <span className="font-mono text-sm text-ember">{n}</span>
              <div><h3 className="text-lg">{t}</h3><p className="mt-1 text-sm text-mute">{d}</p></div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
