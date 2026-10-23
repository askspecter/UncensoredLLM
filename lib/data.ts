// Model catalogue + pricing.

/** Markup on upstream (OpenRouter) token prices. */
export const MARGIN = 0.2;
/** Beeper's own unlimited liquidity on the order book, funded by the token margin. */
export const HOUSE_DISCOUNT = 0.1;
/** Fee on credit bought from other users' offers (charged on the discounted price). */
export const MARKET_FEE = 0.05;
export const MIN_OFFER = 10;
export const MIN_PURCHASE = 5;
export const MAX_PURCHASE = 10_000;
export const AFFILIATE_COMMISSION = 0.02;

type UpstreamModel = {
  id: string;
  upstream: string; // OpenRouter model slug
  name: string;
  provider: string;
  context: string;
  input: number; // OpenRouter price, USD per 1M tokens — keep in sync with upstream
  output: number;
  uncensored: boolean;
  tags: string[];
};

/** `input`/`output` are Beeper's prices (upstream + MARGIN); `cost` is what we pay upstream. */
export type Model = UpstreamModel & { cost: { input: number; output: number } };

const UPSTREAM_MODELS: UpstreamModel[] = [
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

const withMargin = (usd: number) => Math.round(usd * (1 + MARGIN) * 10_000) / 10_000;

export const MODELS: Model[] = UPSTREAM_MODELS.map((m) => ({
  ...m,
  input: withMargin(m.input),
  output: withMargin(m.output),
  cost: { input: m.input, output: m.output },
}));

export const findModel = (id: string) => MODELS.find((m) => m.id === id);

export type Fill = { offerId: string | null; discount: number; credit: number; price: number };
export type Quote = { credit: number; fills: Fill[]; subtotal: number; fee: number; total: number; savings: number; discount: number };

export const PRIVACY_TIERS = [
  { name: "Anonymized", desc: "Requests reach model providers from Beeper’s account, not yours. Providers never see who you are.", level: 1, soon: false },
  { name: "No logs, no training", desc: "We never store prompts or outputs — only billing metadata. Requests only route to providers that don’t train on or collect your data.", level: 2, soon: false },
  { name: "Zero-retention routing", desc: "Restrict routing to providers with zero-data-retention agreements.", level: 3, soon: true },
  { name: "End-to-end encrypted", desc: "Encrypt prompts client-side to an attested enclave. Not even the gateway can read them.", level: 4, soon: true },
];

export const FAQ = [
  { q: "What does “uncensored” mean here?", a: "We route to open-weight models served without extra moderation layers or system-prompt filters added by us. You get the model’s raw behaviour. You are still responsible for complying with the law and our Acceptable Use Policy — illegal content (e.g. CSAM) is prohibited and accounts are terminated." },
  { q: "Where do the discounts come from?", a: "Beeper sells credit at 10% below list on every order. Users who won’t use their credit can list it on the order book at a deeper discount; your order fills from the deepest offers first, plus a 5% fee on that part. Requests are billed per token at the list prices in the model catalogue." },
  { q: "How do I sell credit?", a: "List part of your balance on the Sell page with the discount you want. It’s held in escrow until it sells, and you’re paid in USDG on Robinhood Chain. Cancel any time to get unsold credit back." },
  { q: "How do I pay?", a: "With USDG on Robinhood Chain (from your wallet or any exchange) or by card. Credit appears automatically once the payment confirms." },
  { q: "Do you store my prompts?", a: "No. We store only billing metadata (model, token counts, cost, timestamp). Requests are routed only to providers that don’t collect or train on your data." },
  { q: "Do I need an account or KYC?", a: "No KYC. Sign in with Google, email, or just connect an Ethereum wallet for a fully pseudonymous account. Your sign-in is never linked to prompt content." },
  { q: "Is it compatible with my SDK?", a: "Yes. The API is OpenAI-compatible. Change the base URL and API key in the OpenAI SDK, Vercel AI SDK, LangChain, LiteLLM and most agents." },
  { q: "Can I get a refund?", a: "If a card payment goes wrong, contact us and it’s refunded through the card processor. Credit is a prepaid grant of API access and isn’t redeemable for cash." },
];
