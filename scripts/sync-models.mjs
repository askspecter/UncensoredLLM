// Pulls OpenRouter's public catalogue into lib/models.generated.json (upstream prices; margin is applied in lib/data.ts).
// Runs before every build; on any failure the committed file is kept as is.
import { writeFileSync } from "node:fs";

const OUT = new URL("../lib/models.generated.json", import.meta.url);
// Community finetunes known for running without refusals.
const UNCENSORED = /dolphin|venice|euryale|magnum|mythomax|lumimaid|rocinante|unslop|cydonia|anubis|skyfall|abliterat|uncensored|noromaid|midnight-rose|goliath|weaver|hermes/i;

const per1M = (s) => Math.round(Number(s) * 1e6 * 10_000) / 10_000;
const ctx = (n) => (n >= 1e6 ? `${+(n / 1048576).toFixed(1)}M` : `${Math.round(n / 1000)}K`);

// One display name per vendor slug: the name most of its models carry ("mistralai" -> "Mistral").
const FIX = { "anthracite-org": "Anthracite", gryphe: "Gryphe", rekaai: "Reka", undi95: "Undi95", unbiased: "Unbiased" };
const names = new Map();
function providerName(all, slug) {
  if (!names.has(slug)) {
    const counts = {};
    for (const m of all) if (m.id.startsWith(`${slug}/`) && m.provider !== slug) counts[m.provider] = (counts[m.provider] ?? 0) + 1;
    names.set(slug, FIX[slug] ?? Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]);
  }
  return names.get(slug);
}

try {
  const res = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { data } = await res.json();
  const now = Date.now() / 1000;
  const models = data
    .filter((m) => !m.id.startsWith("openrouter/") && !m.id.startsWith("~") && !m.id.includes(":free"))
    .filter((m) => m.architecture?.output_modalities?.includes("text"))
    .filter((m) => !m.expiration_date || new Date(m.expiration_date).getTime() / 1000 > now)
    .map((m) => {
      const [prefix, ...rest] = String(m.name).split(": ");
      const input = per1M(m.pricing?.prompt ?? 0), output = per1M(m.pricing?.completion ?? 0);
      const params = m.supported_parameters ?? [];
      const tags = [
        params.includes("reasoning") && "reasoning",
        /coder|codestral|devstral|code/i.test(m.id) && "code",
        params.includes("tools") && "agents",
        m.architecture.input_modalities?.includes("image") && "vision",
        UNCENSORED.test(m.id) && "roleplay",
      ].filter(Boolean);
      return {
        id: m.id, upstream: m.id,
        name: rest.length ? rest.join(": ") : m.name,
        provider: rest.length ? prefix : m.id.split("/")[0],
        context: ctx(m.context_length ?? 0),
        input, output, uncensored: UNCENSORED.test(m.id), tags,
      };
    })
    .map((m, _, all) => ({ ...m, provider: providerName(all, m.id.split("/")[0]) ?? m.provider }))
    // Free or variable-priced routes can't be metered (and free tiers usually log prompts).
    .filter((m) => m.input > 0 && m.output > 0)
    .sort((a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name));
  if (models.length < 50) throw new Error(`only ${models.length} models, refusing to overwrite`);
  writeFileSync(OUT, JSON.stringify(models) + "\n");
  console.log(`[sync-models] ${models.length} models`);
} catch (e) {
  console.warn(`[sync-models] kept existing catalogue: ${e.message}`);
}

// Models Orbio serves at or below OpenRouter's price (lib/orbio-models.json). With ORBIO_UPSTREAM=1 these are
// routed through Orbio and paid from Beeper's Orbio balance, which is bought at a discount on chain.
try {
  const [or, ob] = await Promise.all(["https://openrouter.ai/api/v1/models", "https://www.orbio.so/api/v1/models"].map(async (u) => {
    const r = await fetch(u, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error(`${u} HTTP ${r.status}`);
    const j = await r.json();
    return new Map((Array.isArray(j) ? j : j.data).map((m) => [m.id, m]));
  }));
  const ids = [...ob.values()]
    .filter((m) => m.architecture?.output_modalities?.includes("text"))
    .filter((m) => {
      const o = or.get(m.id);
      const p = (x, k) => Number(x?.pricing?.[k] ?? NaN);
      return o && p(m, "prompt") > 0 && p(m, "completion") > 0 && p(m, "prompt") <= p(o, "prompt") && p(m, "completion") <= p(o, "completion");
    })
    .map((m) => m.id).sort();
  if (ids.length < 50) throw new Error(`only ${ids.length} Orbio models, refusing to overwrite`);
  writeFileSync(new URL("../lib/orbio-models.json", import.meta.url), JSON.stringify(ids) + "\n");
  console.log(`[sync-models] ${ids.length} models routable through Orbio`);
} catch (e) {
  console.warn(`[sync-models] kept existing Orbio list: ${e.message}`);
}

// Venice text models OpenRouter doesn't carry (mostly its own uncensored builds), billed through VENICE_API_KEY.
// Venice allows serving its API to your own end users (ToS 7.3) as long as Beeper's terms are at least as strict.
// Same model, different spelling: "OpenAI GPT OSS 120B" vs "openai/gpt-oss-120b". Drop vendor and suffix words first.
const norm = (s) => String(s).toLowerCase()
  .replace(/\b(instruct|it|chat|fp8|api|the|openai|google|nvidia|meta|zai|org|z-ai|alibaba)\b/g, "")
  .replace(/[^a-z0-9]/g, "");
const VENICE_VENDOR = [
  [/^venice/, "Venice"], [/^claude/, "Anthropic"], [/^(qwen|qwen3)/, "Alibaba"], [/gemma|gemini/, "Google"],
  [/^deepseek/, "DeepSeek"], [/^kimi/, "Moonshot"], [/^nvidia/, "NVIDIA"], [/^openai/, "OpenAI"], [/^llama/, "Meta"],
  [/^minimax/, "MiniMax"], [/glm/, "Zhipu"], [/^abliteration/, "Abliteration.ai"], [/^grok/, "xAI"], [/^mistral/, "Mistral"],
];
// Checked by hand: OpenRouter serves these under other names (qwen3-next-80b-a3b-instruct, qwen3.8-max, nemotron-3.5-super-vl, minimax-m3).
const VENICE_SAME = new Set(["qwen3-next-80b", "qwen-3-8-max", "nvidia-nemotron-3-5-super-vl-120b-a12b", "minimax-m3-preview"]);
try {
  const main = JSON.parse((await import("node:fs")).readFileSync(OUT, "utf8"));
  const known = new Set(main.flatMap((m) => [norm(m.upstream.split("/").pop()), norm(m.name)]));
  const res = await fetch("https://api.venice.ai/api/v1/models?type=text", { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { data } = await res.json();
  const models = data
    .filter((m) => m.type === "text" && !m.model_spec?.offline && !m.id.startsWith("e2ee-"))
    .filter((m) => !known.has(norm(m.id)) && !known.has(norm(m.model_spec?.name ?? "")) && !VENICE_SAME.has(m.id))
    .map((m) => {
      const s = m.model_spec ?? {}, c = s.capabilities ?? {};
      const uncensored = /uncensored|heretic|abliterat|role-?play/i.test(m.id) || (s.traits ?? []).includes("most_uncensored");
      return {
        id: `venice/${m.id}`, upstream: m.id, route: "venice",
        name: s.name ?? m.id, provider: VENICE_VENDOR.find(([re]) => re.test(m.id))?.[1] ?? "Venice",
        context: ctx(s.availableContextTokens ?? m.context_length ?? 0),
        input: Number(s.pricing?.input?.usd ?? 0), output: Number(s.pricing?.output?.usd ?? 0), uncensored,
        tags: [c.supportsReasoning && "reasoning", c.optimizedForCode && "code", c.supportsFunctionCalling && "agents", c.supportsVision && "vision", uncensored && "roleplay"].filter(Boolean),
      };
    })
    .filter((m) => m.input > 0 && m.output > 0)
    .sort((a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name));
  writeFileSync(new URL("../lib/venice-models.json", import.meta.url), JSON.stringify(models) + "\n");
  console.log(`[sync-models] ${models.length} Venice-only models`);
} catch (e) {
  console.warn(`[sync-models] kept existing Venice list: ${e.message}`);
}

// Featherless: the long tail of open models on Hugging Face (tens of thousands of finetunes), served by
// FEATHERLESS_API_KEY. Kept out of the client bundle: [id, context, input $/1M, output $/1M, model class].
try {
  const main = JSON.parse((await import("node:fs")).readFileSync(OUT, "utf8"));
  const known = new Set(main.map((m) => m.upstream.toLowerCase()));
  // Featherless answers 404 to requests without a User-Agent.
  const res = await fetch("https://api.featherless.ai/v1/models", { headers: { "user-agent": "beeper-sync/1.0" }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  const rows = (Array.isArray(j) ? j : j.data)
    // Some repo names contain a leaked Hugging Face token; never copy those.
    .filter((m) => !m.is_gated && !known.has(m.id.toLowerCase()) && !/hf_[A-Za-z0-9]{20,}/.test(m.id))
    .map((m) => [m.id, m.context_length ?? 0, per1M(m.pricing?.prompt ?? 0), per1M(m.pricing?.completion ?? 0), m.model_class ?? ""])
    .filter((r) => r[2] > 0 && r[3] > 0)
    .sort((a, b) => a[0].localeCompare(b[0]));
  if (rows.length < 1000) throw new Error(`only ${rows.length} models, refusing to overwrite`);
  writeFileSync(new URL("../lib/longtail-models.json", import.meta.url), JSON.stringify(rows) + "\n");
  console.log(`[sync-models] ${rows.length} long-tail open models`);
} catch (e) {
  console.warn(`[sync-models] kept existing long-tail list: ${e.message}`);
}
