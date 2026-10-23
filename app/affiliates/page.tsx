import { Estimator, ReferralLink } from "@/components/Affiliate";
import { AFFILIATE_COMMISSION as COMMISSION } from "@/lib/data";

export const metadata = { title: "Affiliates — Beeper" };

const STEPS = [
  ["01", "Get your link", "Sign in with Google, email or a wallet. Your referral link is ready instantly."],
  ["02", "Refer builders", "Share it with devs, roleplay communities, agent builders — anyone burning tokens."],
  ["03", "Earn forever", "Their first purchase locks the referral. Every future top-up pays you, no re-clicks."],
];

const FAQ = [
  ["Do I earn on repeat top-ups?", "Yes. Commission applies to every settled top-up, for the lifetime of the account. It’s paid by Beeper, never added to the buyer’s price."],
  ["How is a referral attributed?", "The most recent valid referral before the buyer’s first purchase wins and stays attached. Referrals are remembered in the browser for 12 months."],
  ["When do I get paid?", "Commissions unlock after a 14-day hold. Withdraw from $10 in USDG on Robinhood Chain."],
  ["What about refunds and disputes?", "Refunds reduce commission proportionally. Disputed payments are held until resolved."],
  ["Can I refer myself?", "No. Purchases from your own account don’t earn commission."],
];

export default function Affiliates() {
  return (
    <main>
      <section className="relative overflow-hidden">
        <div className="glow pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-6xl px-5 pb-6 pt-20 text-center">
          <p className="eyebrow">Affiliate program</p>
          <h1 className="mx-auto mt-4 max-w-3xl font-serif text-5xl leading-[1.05] md:text-7xl">Page your friends. <em className="text-ember-soft">Get paid forever.</em></h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-mute">
            Earn {COMMISSION * 100}% of every deposit your referrals make — first purchase and every top-up after.
          </p>
          <div className="mt-8 flex justify-center"><ReferralLink /></div>
        </div>
      </section>

      <section className="mx-auto mt-20 grid max-w-6xl gap-10 px-5 lg:grid-cols-2">
        <div className="space-y-8">
          <p className="eyebrow">How it works</p>
          {STEPS.map(([n, t, d]) => (
            <div key={n} className="flex gap-5">
              <span className="font-serif text-4xl text-ember">{n}</span>
              <div><h3 className="text-xl">{t}</h3><p className="mt-1 text-sm text-mute">{d}</p></div>
            </div>
          ))}
        </div>
        <Estimator />
      </section>

      <section className="mx-auto mt-24 max-w-6xl px-5">
        <p className="eyebrow">FAQ</p>
        <div className="mt-6 divide-y divide-line border-y border-line">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between text-lg">{q}<span className="ml-4 text-ember transition group-open:rotate-45">+</span></summary>
              <p className="mt-3 max-w-3xl text-sm text-mute">{a}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}
