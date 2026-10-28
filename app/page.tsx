import BuyCard from "@/components/BuyCard";
import HeroChat from "@/components/HeroChat";
import { LiquidityBook, RecentBuys } from "@/components/Market";
import ModelTable from "@/components/ModelTable";
import CodeTabs from "@/components/CodeTabs";
import Faq from "@/components/Faq";
import { MODELS, PRIVACY_TIERS } from "@/lib/data";
import { IMAGE_MODELS } from "@/lib/images";
import { longtailCount } from "@/lib/longtail";
import ProviderLogo, { PROVIDERS_WITH_LOGOS } from "@/components/ProviderLogo";
import BeepToken from "@/components/BeepToken";

function Section({ id, eyebrow, title, sub, children }: { id?: string; eyebrow: string; title: React.ReactNode; sub?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mx-auto max-w-6xl scroll-mt-20 px-5 pt-14 md:pt-24">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-3 max-w-3xl text-[1.9rem] leading-[1.1] font-semibold tracking-[-0.035em] text-bone md:text-5xl">{title}</h2>
      {sub && <p className="mt-3 max-w-2xl text-sm leading-relaxed text-mute md:mt-4 md:text-base">{sub}</p>}
      <div className="mt-7 md:mt-10">{children}</div>
    </section>
  );
}

const FEATURES = [
  { t: "No filters added", d: "Open-weight models served raw. No hidden system prompts, no refusals bolted on by us." },
  { t: "No logs", d: "We never store prompts or outputs. Only token counts and cost are kept for billing." },
  { t: "Wallet sign-in", d: "No KYC. Sign in with a wallet, Google or email, pay with USDG on Robinhood Chain or card and get a key instantly." },
  { t: "Always 10%+ off", d: "Beeper backs every order at −10%. Users reselling unused credit push discounts deeper." },
  { t: "Unfiltered images", d: "Lustify, Chroma, Z-Image and anime models from $0.012 per image, in the chat or via the API." },
  { t: "Streaming & transparent", d: "Full streaming support. Every response reports the exact upstream model and what it cost you." },
];

export const revalidate = 60;

/** Every chat, image and open model; compact ("22K+") once the long tail is on, so it fits the stat bar on phones. */
function modelCount() {
  const n = MODELS.length + IMAGE_MODELS.length + longtailCount();
  return n >= 10_000 ? `${Math.floor(n / 1000)}K+` : `${n}`;
}

export default function Home() {
  const uncensored = MODELS.filter((m) => m.uncensored).length + IMAGE_MODELS.filter((m) => m.uncensored).length;
  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="glow pointer-events-none absolute inset-0" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 pb-8 pt-8 md:pt-16 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
          <div>
            <a href="#beep" className="inline-flex items-center gap-2 rounded border border-line bg-panel px-3 py-1.5 text-[11px] uppercase tracking-wider text-mute hover:border-ember">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-moss" /> $BEEP is live on Robinhood Chain <span className="text-ember">→</span>
            </a>
            <h1 className="mt-5 font-serif text-5xl uppercase leading-[0.98] text-ember sm:text-6xl lg:text-[4.1rem]">
              Ask anything.<br />No filters.<br />No trace.
            </h1>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-mute">
              Your AI on a burner. Unfiltered chat and image models, zero logs, one key, with credits from the order book at 10%+ off.
            </p>
            <div className="mt-7 grid grid-cols-2 gap-3 sm:flex">
              <a href="/chat" className="btn btn-primary whitespace-nowrap">&gt; Chat now</a>
              <a href="#buy" className="btn btn-ghost whitespace-nowrap">Buy credits</a>
            </div>
          </div>
          <HeroChat />
        </div>
        <div className="relative mx-auto max-w-6xl px-5">
          <dl className="grid grid-cols-4 rounded-md border border-line bg-panel/60">
            {[[modelCount(), "models"], [`${uncensored}`, "uncensored"], ["10%+", "off"], ["0", "logs"]].map(([v, l], i) => (
              <div key={l} className={`px-3 py-3 text-center sm:px-5 sm:py-4 sm:text-left ${i ? "border-l border-line" : ""}`}>
                <dt className="font-serif text-3xl text-ember sm:text-4xl">{v}</dt>
                <dd className="text-[10px] uppercase tracking-wider text-mute sm:text-[11px]">{l}</dd>
              </div>
            ))}
          </dl>
        </div>
        {/* Provider marquee */}
        <div className="relative mt-6 overflow-hidden border-y border-line py-4 [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
          <div className="marquee flex w-max gap-10">
            {[0, 1].map((k) => (
              <div key={k} className="flex shrink-0 items-center gap-10" aria-hidden={k === 1}>
                {PROVIDERS_WITH_LOGOS.map((p) => (
                  <span key={p} className="flex items-center gap-2.5 whitespace-nowrap text-xs uppercase tracking-wider text-mute">
                    <ProviderLogo provider={p} size={26} />
                    {p.replace(" Research", "")}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* $BEEP */}
      <Section id="beep" eyebrow="Token" title={<>Official <em>$BEEP</em></>}
        sub="The Beeper token on Robinhood Chain. Always check the contract address before you trade.">
        <BeepToken />
      </Section>

      {/* Buy */}
      <Section id="buy" eyebrow="Marketplace" title={<>Discounted credit, <em>filled live</em> from the order book.</>}
        sub="Users resell credit they won’t use; Beeper backs every order at −10%. Your order fills from the deepest discount first. Pay with USDG on Robinhood Chain or by card.">
        <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
          <BuyCard />
          <div className="grid content-start gap-5">
            <LiquidityBook />
            <RecentBuys />
          </div>
        </div>
      </Section>

      {/* Features */}
      <Section eyebrow="Why Beeper" title="Built for people who don’t want a chaperone.">
        <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
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
        sub="Every request is anonymized and never logged. Zero-retention routing and end-to-end encryption are next.">
        <div className="grid gap-4 md:grid-cols-4">
          {PRIVACY_TIERS.map((p) => (
            <div key={p.name} className="card p-6">
              <div className="flex gap-1">
                {[1, 2, 3, 4].map((i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= p.level ? "bg-ember" : "bg-panel-2"}`} />)}
              </div>
              <h3 className="mt-5 flex items-center gap-2 text-lg">{p.name}{p.soon && <span className="rounded border border-line px-2 py-0.5 font-mono text-[10px] text-mute">SOON</span>}</h3>
              <p className="mt-2 text-sm text-mute">{p.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Models */}
      <Section id="models" eyebrow="Model catalogue" title="Pick your model."
        sub="List prices per 1M tokens, billed from your credit balance. You buy that credit at a discount.">
        <ModelTable preview />
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
              <div><p className="text-xs text-mute">format</p><p className="text-bone">OpenAI</p></div>
              <div><p className="text-xs text-mute">streaming</p><p className="text-bone">yes</p></div>
              <div><p className="text-xs text-mute">models</p><p className="text-bone">{(MODELS.length + longtailCount()).toLocaleString("en-US")}</p></div>
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
      <section className="mx-auto max-w-6xl px-5 pt-14 md:pt-24">
        <div className="card relative overflow-hidden p-10 text-center md:p-16">
          <div className="glow pointer-events-none absolute inset-0" />
          <h2 className="relative text-3xl leading-[1.1] font-semibold tracking-[-0.035em] text-bone md:text-5xl">Start thinking. <em className="text-ember-soft">Privately.</em></h2>
          <p className="relative mt-4 text-mute">10%+ off every top-up. Pay in USDG or by card. Your key in under a minute.</p>
          <div className="relative mt-8 flex justify-center gap-3">
            <a href="#buy" className="btn btn-primary">Buy credits</a>
            <a href="/models" className="btn btn-ghost">Browse models</a>
          </div>
        </div>
      </section>
    </main>
  );
}
