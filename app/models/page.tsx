import ModelTable from "@/components/ModelTable";
import PriceExamples from "@/components/PriceExamples";
import ProviderLogo from "@/components/ProviderLogo";
import PageHeader from "@/components/PageHeader";
import { IMAGE_MODELS, MODELS } from "@/lib/data";

export const metadata = { title: "Models — Beeper" };

export default function Models() {
  const unc = MODELS.filter((m) => m.uncensored).length;
  return (
    <main className="mx-auto max-w-6xl px-5 pt-16">
      <PageHeader eyebrow="Model catalogue" title={<>Every model. <em className="text-ember-soft">One key.</em></>}
        sub="Open-weight and frontier models behind one OpenAI-compatible key. Uncensored models are served raw — no extra system prompts, no moderation layer.">
        <div className="grid grid-cols-3 gap-6 font-mono text-sm">
          <div><p className="text-xs text-mute">models</p><p className="text-2xl text-bone">{MODELS.length}</p></div>
          <div><p className="text-xs text-mute">uncensored</p><p className="text-2xl text-ember-soft">{unc}</p></div>
          <div><p className="text-xs text-mute">from</p><p className="text-2xl text-moss">${Math.min(...MODELS.map((m) => m.input))}</p></div>
        </div>
      </PageHeader>
      <div className="mt-10"><ModelTable /></div>
      <h2 className="mt-16 font-serif text-4xl uppercase text-ember md:text-5xl">Image models</h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {IMAGE_MODELS.map((m) => (
          <div key={m.id} className="card p-5">
            <div className="flex items-center gap-3">
              <ProviderLogo provider={m.provider} size={34} />
              <div className="min-w-0 flex-1">
                <p className="font-bold">{m.name}</p>
                <p className="text-xs text-mute">{m.provider}</p>
              </div>
              {m.uncensored && <span className="rounded bg-ember/15 px-1.5 py-0.5 text-[10px] text-ember-soft">UNCENSORED</span>}
            </div>
            <p className="mt-3 text-xs text-mute">{m.style}</p>
            <p className="mt-4 font-serif text-4xl text-ember">${m.perImage}<span className="ml-1 font-sans text-xs text-mute">/ image</span></p>
            <p className="mt-1 font-mono text-[11px] text-mute">{m.id}</p>
          </div>
        ))}
      </div>
      <div className="mt-10 max-w-xl"><PriceExamples /></div>
      <p className="mt-4 text-xs text-mute">Prices in USD per 1M tokens, billed from your credit balance. Reasoning tokens count as output.</p>
    </main>
  );
}
