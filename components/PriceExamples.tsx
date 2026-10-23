import { MODELS } from "@/lib/data";
import ProviderLogo from "./ProviderLogo";

// What $10 buys, assuming a typical chat turn of ~600 prompt + ~400 completion tokens.
const PROMPT = 600, COMPLETION = 400;
const PICKS = ["beeper/dolphin-mistral-24b", "beeper/hermes-4-405b", "beeper/deepseek-v3.2", "beeper/llama-3.3-70b"];

export default function PriceExamples() {
  const rows = PICKS.map((id) => MODELS.find((m) => m.id === id)!).filter(Boolean).map((m) => ({
    m, messages: Math.floor(10 / ((PROMPT * m.input + COMPLETION * m.output) / 1e6)),
  }));
  return (
    <div className="card p-6">
      <p className="eyebrow">What $10 gets you</p>
      <ul className="mt-5 divide-y divide-line">
        {rows.map(({ m, messages }) => (
          <li key={m.id} className="flex items-center justify-between gap-3 py-3">
            <ProviderLogo provider={m.provider} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 font-bold">
                {m.name}
                {m.uncensored && <span className="rounded bg-ember/15 px-1.5 py-0.5 font-mono text-[10px] font-normal text-ember-soft">UNCENSORED</span>}
              </p>
              <p className="font-mono text-[11px] text-mute">${m.input.toFixed(2)} in · ${m.output.toFixed(2)} out / 1M</p>
            </div>
            <p className="shrink-0 text-right"><span className="font-serif text-xl sm:text-2xl">≈{messages.toLocaleString()}</span><br /><span className="text-xs text-mute">messages</span></p>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-mute">Estimate for a typical chat turn (~600 tokens in, ~400 out). Long contexts cost more.</p>
      <a href="/models" className="mt-4 inline-block text-sm text-ember-soft underline">All {MODELS.length} models →</a>
    </div>
  );
}
