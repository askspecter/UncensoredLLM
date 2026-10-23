import ModelTable from "@/components/ModelTable";
import PageHeader from "@/components/PageHeader";
import { MODELS } from "@/lib/data";

export const metadata = { title: "Models — Beeper" };

export default function Models() {
  const unc = MODELS.filter((m) => m.uncensored).length;
  return (
    <main className="mx-auto max-w-6xl px-5 pt-16">
      <PageHeader eyebrow="Model catalogue" title={<>Every model. <em className="text-ember-soft">Half the price.</em></>}
        sub="Open-weight and frontier models behind one OpenAI-compatible key. Uncensored models are served raw — no extra system prompts, no moderation layer.">
        <div className="grid grid-cols-3 gap-6 font-mono text-sm">
          <div><p className="text-xs text-mute">models</p><p className="text-2xl text-bone">{MODELS.length}</p></div>
          <div><p className="text-xs text-mute">uncensored</p><p className="text-2xl text-ember-soft">{unc}</p></div>
          <div><p className="text-xs text-mute">best price</p><p className="text-2xl text-moss">−50%</p></div>
        </div>
      </PageHeader>
      <div className="mt-10"><ModelTable /></div>
      <p className="mt-4 text-xs text-mute">Prices per 1M tokens. “With Beeper” shows the current best book discount; your effective rate depends on liquidity at purchase.</p>
    </main>
  );
}
