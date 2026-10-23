import BuyCard from "@/components/BuyCard";
import HeroChat from "@/components/HeroChat";
import { LiquidityBook, LiveFeed } from "@/components/Market";
import ModelTable from "@/components/ModelTable";
import CodeTabs from "@/components/CodeTabs";
import Faq from "@/components/Faq";
import { MODELS, PRIVACY_TIERS } from "@/lib/data";

function Section({ id, eyebrow, title, sub, children }: { id?: string; eyebrow: string; title: React.ReactNode; sub?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mx-auto max-w-6xl scroll-mt-20 px-5 pt-28">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-3 max-w-3xl font-serif text-4xl leading-tight md:text-5xl">{title}</h2>
      {sub && <p className="mt-4 max-w-2xl text-mute">{sub}</p>}
      <div className="mt-10">{children}</div>
    </section>
  );
}

const FEATURES = [
  { t: "No filters added", d: "Open-weight models served raw. No hidden system prompts, no refusals bolted on by us." },
  { t: "Zero data retention", d: "Prompts and outputs never touch disk. Only token counts and cost are kept for billing." },
  { t: "Wallet sign-in", d: "No KYC. Sign in with a wallet, Google or email, pay with USDG on Robinhood Chain or card and get a key instantly." },
  { t: "Up to 50% cheaper", d: "Buy unused credit from sellers on the order book. Flat 5% fee, no subscription." },
  { t: "One key, every model", d: "Text, code, image and audio models behind a single OpenAI-compatible endpoint." },
  { t: "<40 ms overhead", d: "Edge gateway with streaming passthrough. Responses report the exact upstream model ID." },
];

export default function Home() {
  const uncensored = MODELS.filter((m) => m.uncensored).length;
  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="glow pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-6xl px-5 pb-10 pt-20 text-center md:pt-28">
          <p className="eyebrow">Private · Uncensored · Up to 50% off</p>
          <h1 className="mx-auto mt-5 max-w-4xl font-serif text-5xl leading-[1.02] md:text-7xl">
            Ask anything.<br /><em className="text-ember-soft">Pay half.</em> Leave no trace.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-mute">
            The marketplace for discounted AI inference credits. Unfiltered open models, zero logs, one anonymous API key.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <a href="#buy" className="btn btn-primary">Buy credits</a>
            <a href="/sell" className="btn btn-ghost">Sell unused credits</a>
          </div>
          <div className="mt-14"><HeroChat /></div>
          <dl className="mx-auto mt-12 grid max-w-3xl grid-cols-2 gap-6 text-left md:grid-cols-4">
            {[["$2.4M", "credit traded"], [`${MODELS.length}+`, "models"], [`${uncensored}`, "uncensored models"], ["0 bytes", "prompts stored"]].map(([v, l]) => (
              <div key={l}><dt className="font-serif text-3xl">{v}</dt><dd className="text-xs uppercase tracking-wider text-mute">{l}</dd></div>
            ))}
          </dl>
        </div>
      </section>

      {/* Buy */}
      <Section id="buy" eyebrow="Marketplace" title={<>Discounted credit, <em>filled live</em> from the order book.</>}
        sub="Sellers list unused prepaid inference. Your order fills from the deepest discount first — you see exactly what you pay before you pay it.">
        <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
          <BuyCard />
          <div className="grid gap-5">
            <LiquidityBook />
            <LiveFeed />
          </div>
        </div>
      </Section>

      {/* Features */}
      <Section eyebrow="Why Beeper" title="Built for people who don’t want a chaperone.">
        <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.t} className="bg-panel p-6">
              <h3 className="text-lg">{f.t}</h3>
              <p className="mt-2 text-sm text-mute">{f.d}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Privacy */}
      <Section id="privacy" eyebrow="Privacy architecture" title={<>Your prompts are <em>yours</em>. Pick how private.</>}
        sub="Every request is anonymized by default. Step up to enclave inference or full end-to-end encryption when it matters.">
        <div className="grid gap-4 md:grid-cols-4">
          {PRIVACY_TIERS.map((p) => (
            <div key={p.name} className="card p-6">
              <div className="flex gap-1">
                {[1, 2, 3, 4].map((i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= p.level ? "bg-ember" : "bg-panel-2"}`} />)}
              </div>
              <h3 className="mt-5 text-lg">{p.name}</h3>
              <p className="mt-2 text-sm text-mute">{p.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Models */}
      <Section id="models" eyebrow="Model catalogue" title="List price, crossed out."
        sub="Prices shown at the current best book discount (−50%). Actual discount depends on liquidity at the time of purchase.">
        <ModelTable />
      </Section>

      {/* API */}
      <Section id="api" eyebrow="Developers" title="Two lines to switch.">
        <div className="grid items-start gap-8 lg:grid-cols-[1fr_1.4fr]">
          <div className="space-y-5 text-mute">
            <p>Beeper speaks the OpenAI API. Point your SDK at our base URL, swap in your key, done.</p>
            <ul className="space-y-3 text-sm">
              {["OpenAI SDK (Python / Node)", "Vercel AI SDK", "LangChain & LlamaIndex", "LiteLLM, Cline, OpenWebUI, SillyTavern"].map((s) => (
                <li key={s} className="flex items-center gap-3"><span className="text-ember">→</span>{s}</li>
              ))}
            </ul>
            <div className="card grid grid-cols-3 gap-4 p-5 font-mono text-sm">
              <div><p className="text-xs text-mute">p50</p><p className="text-bone">31 ms</p></div>
              <div><p className="text-xs text-mute">p95</p><p className="text-bone">47 ms</p></div>
              <div><p className="text-xs text-mute">uptime</p><p className="text-bone">99.95%</p></div>
            </div>
          </div>
          <CodeTabs />
        </div>
      </Section>

      {/* FAQ */}
      <Section id="faq" eyebrow="FAQ" title="Questions, answered plainly.">
        <Faq />
      </Section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-5 pt-28">
        <div className="card relative overflow-hidden p-10 text-center md:p-16">
          <div className="glow pointer-events-none absolute inset-0" />
          <h2 className="relative font-serif text-4xl md:text-6xl">Start thinking. <em className="text-ember-soft">Privately.</em></h2>
          <p className="relative mt-4 text-mute">$5 minimum. Sign in with a wallet. Your key in under a minute.</p>
          <div className="relative mt-8 flex justify-center gap-3">
            <a href="#buy" className="btn btn-primary">Buy credits</a>
            <a href="/sell" className="btn btn-ghost">Sell credits</a>
          </div>
        </div>
      </section>
    </main>
  );
}
