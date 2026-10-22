import SellForm from "@/components/SellForm";
import { LiquidityBook } from "@/components/Market";

export const metadata = { title: "Sell unused AI credits — Umbra" };

const STEPS = [
  ["01", "List", "Tell us where the credit sits and pick a discount. Minimum $50."],
  ["02", "Verify", "Share a read-only or scoped key. We confirm the balance — never the content of your account."],
  ["03", "Get paid", "Buyers consume your credit through our gateway. Payouts settle daily in crypto."],
];

export default function Sell() {
  return (
    <main className="mx-auto max-w-6xl px-5 pt-20">
      <p className="eyebrow">Sell credits</p>
      <h1 className="mt-3 max-w-3xl font-serif text-5xl leading-tight md:text-6xl">Turn idle credit into <em className="text-ember-soft">cash</em>.</h1>
      <p className="mt-4 max-w-2xl text-mute">Startup grants, hackathon credits, over-provisioned top-ups — list what you won’t use before it expires.</p>

      <div className="mt-12 grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <SellForm />
        <div className="space-y-5">
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
