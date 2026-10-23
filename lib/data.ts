// Static catalogue + marketplace logic. Swap for a real DB / provider feed in production.

export const PLATFORM_FEE = 0.05;
export const MIN_PURCHASE = 5;
export const MAX_PURCHASE = 10_000;
export const AFFILIATE_COMMISSION = 0.02;

export type Model = {
  id: string;
  upstream: string; // OpenRouter model slug
  name: string;
  provider: string;
  context: string;
  input: number; // list price USD per 1M tokens (what a request costs in credit)
  output: number;
  uncensored: boolean;
  tags: string[];
};

// Prices mirror OpenRouter list prices — keep them in sync when upstream changes.
export const MODELS: Model[] = [
  { id: "beeper/dolphin-mistral-24b", upstream: "cognitivecomputations/dolphin-mistral-24b-venice-edition", name: "Dolphin Mistral 24B (Venice)", provider: "Cognitive Computations", context: "128K", input: 0.2, output: 0.9, uncensored: true, tags: ["chat", "roleplay"] },
  { id: "beeper/hermes-4-405b", upstream: "nousresearch/hermes-4-405b", name: "Hermes 4 405B", provider: "Nous Research", context: "131K", input: 1.0, output: 3.0, uncensored: true, tags: ["reasoning", "chat"] },
  { id: "beeper/hermes-3-405b", upstream: "nousresearch/hermes-3-llama-3.1-405b", name: "Hermes 3 405B", provider: "Nous Research", context: "131K", input: 1.0, output: 1.0, uncensored: true, tags: ["chat", "roleplay"] },
  { id: "beeper/hermes-3-70b", upstream: "nousresearch/hermes-3-llama-3.1-70b", name: "Hermes 3 70B", provider: "Nous Research", context: "131K", input: 0.7, output: 0.7, uncensored: true, tags: ["chat", "roleplay"] },
  { id: "beeper/euryale-70b", upstream: "sao10k/l3.1-euryale-70b", name: "Euryale 70B", provider: "Sao10K", context: "131K", input: 0.85, output: 0.85, uncensored: true, tags: ["roleplay"] },
  { id: "beeper/magnum-v4-72b", upstream: "anthracite-org/magnum-v4-72b", name: "Magnum v4 72B", provider: "Anthracite", context: "33K", input: 2.5, output: 5.0, uncensored: true, tags: ["roleplay"] },
  { id: "beeper/mythomax-13b", upstream: "gryphe/mythomax-l2-13b", name: "MythoMax 13B", provider: "Gryphe", context: "8K", input: 0.08, output: 0.11, uncensored: true, tags: ["roleplay"] },
  { id: "beeper/llama-3.3-70b", upstream: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B", provider: "Meta", context: "131K", input: 0.1, output: 0.32, uncensored: false, tags: ["chat"] },
  { id: "beeper/deepseek-v3.2", upstream: "deepseek/deepseek-v3.2", name: "DeepSeek V3.2", provider: "DeepSeek", context: "164K", input: 0.28, output: 0.42, uncensored: false, tags: ["code", "chat"] },
  { id: "beeper/deepseek-r1", upstream: "deepseek/deepseek-r1-0528", name: "DeepSeek R1", provider: "DeepSeek", context: "164K", input: 0.5, output: 2.15, uncensored: false, tags: ["reasoning"] },
  { id: "beeper/qwen3-235b", upstream: "qwen/qwen3-235b-a22b-2507", name: "Qwen3 235B A22B", provider: "Alibaba", context: "262K", input: 0.09, output: 0.55, uncensored: false, tags: ["code", "chat"] },
  { id: "beeper/kimi-k2", upstream: "moonshotai/kimi-k2-0905", name: "Kimi K2", provider: "Moonshot", context: "262K", input: 0.6, output: 2.5, uncensored: false, tags: ["agents", "code"] },
  { id: "beeper/glm-4.6", upstream: "z-ai/glm-4.6", name: "GLM 4.6", provider: "Zhipu", context: "205K", input: 0.55, output: 2.2, uncensored: false, tags: ["agents", "code"] },
  { id: "beeper/mistral-large", upstream: "mistralai/mistral-large-2512", name: "Mistral Large", provider: "Mistral", context: "262K", input: 0.5, output: 1.5, uncensored: false, tags: ["chat", "code"] },
  { id: "beeper/gpt-oss-120b", upstream: "openai/gpt-oss-120b", name: "gpt-oss 120B", provider: "OpenAI (open weights)", context: "131K", input: 0.15, output: 0.6, uncensored: false, tags: ["reasoning"] },
];

export const findModel = (id: string) => MODELS.find((m) => m.id === id);

export type Tier = { discount: number; available: number };

// Liquidity book: unused credit listed by sellers, grouped by discount.
export const LIQUIDITY: Tier[] = [
  { discount: 0.5, available: 1840 },
  { discount: 0.45, available: 3260 },
  { discount: 0.4, available: 5120 },
  { discount: 0.35, available: 7480 },
  { discount: 0.3, available: 12_900 },
  { discount: 0.2, available: 21_400 },
  { discount: 0, available: 1_000_000 },
];

export type Fill = { discount: number; credit: number; cost: number };
export type Quote = {
  credit: number;
  fills: Fill[];
  subtotal: number;
  fee: number;
  total: number;
  savings: number;
  effectiveDiscount: number;
};

const round = (n: number) => Math.round(n * 100) / 100;

/** Fill a credit order from the deepest discount first, then add the platform fee. */
export function quote(credit: number, book: Tier[] = LIQUIDITY): Quote {
  let remaining = credit;
  const fills: Fill[] = [];
  for (const tier of [...book].sort((a, b) => b.discount - a.discount)) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, tier.available);
    if (take <= 0) continue;
    fills.push({ discount: tier.discount, credit: take, cost: take * (1 - tier.discount) });
    remaining -= take;
  }
  const subtotal = fills.reduce((s, f) => s + f.cost, 0);
  const fee = subtotal * PLATFORM_FEE;
  const total = subtotal + fee;
  return {
    credit,
    fills: fills.map((f) => ({ ...f, cost: round(f.cost) })),
    subtotal: round(subtotal),
    fee: round(fee),
    total: round(total),
    savings: round(credit - total),
    effectiveDiscount: credit > 0 ? 1 - total / credit : 0,
  };
}

export const PRIVACY_TIERS = [
  { name: "Anonymized", desc: "Requests are stripped of identity and relayed through our gateway. Providers never see who you are.", level: 1 },
  { name: "Zero retention", desc: "Prompts and completions are never written to disk. We keep billing metadata only: tokens, model, cost.", level: 2 },
  { name: "TEE inference", desc: "Selected open models run inside trusted execution enclaves with remote attestation.", level: 3 },
  { name: "End-to-end encrypted", desc: "Encrypt prompts client-side to an enclave key. Not even the gateway can read them.", level: 4 },
];

export const FAQ = [
  { q: "What does “uncensored” mean here?", a: "We route to open-weight models served without extra moderation layers or system-prompt filters added by us. You get the model’s raw behaviour. You are still responsible for complying with the law and our Acceptable Use Policy — illegal content (e.g. CSAM) is prohibited and accounts are terminated." },
  { q: "Where do discounted credits come from?", a: "Sellers list unused prepaid inference credit on the order book. When you buy, your order is filled from the deepest discount first. Sellers are paid when the credit is consumed." },
  { q: "What fees do you charge?", a: "A flat 5% platform fee on the discounted price. No subscription, minimum purchase $5." },
  { q: "Do you store my prompts?", a: "No. Inference runs on zero-retention endpoints. We store only billing metadata (model, token counts, cost, timestamp) attached to an anonymous key." },
  { q: "Do I need an account or KYC?", a: "No KYC. Sign in with Google, email, or just connect an Ethereum wallet for a fully pseudonymous account. Your sign-in is never linked to prompt content." },
  { q: "Is it compatible with my SDK?", a: "Yes. The API is OpenAI-compatible. Change the base URL and API key in the OpenAI SDK, Vercel AI SDK, LangChain, LiteLLM and most agents." },
  { q: "Can I get a refund?", a: "Unused credit can be relisted on the marketplace at any time. Credits are not redeemable for cash directly." },
];
