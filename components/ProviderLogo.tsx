// Official provider marks (public/providers, from LobeHub icons, MIT). Community models get a monogram.
const LOGOS: Record<string, string> = {
  "Meta": "meta", "DeepSeek": "deepseek", "Alibaba": "qwen", "Alibaba Tongyi": "alibaba", "Moonshot": "kimi",
  "Zhipu": "zhipu", "Mistral": "mistral", "OpenAI (open weights)": "openai", "Nous Research": "nousresearch", "Tencent": "hunyuan",
  "OpenAI": "openai", "Qwen": "qwen", "MoonshotAI": "kimi", "Z.ai": "zhipu", "Nous": "nousresearch", "Anthropic": "anthropic",
  "Google": "google", "SpaceXAI": "xai", "xAI": "xai", "NVIDIA": "nvidia", "Microsoft": "microsoft", "Cohere": "cohere",
  "Amazon": "amazon", "Perplexity": "perplexity", "MiniMax": "minimax", "ByteDance": "bytedance", "ByteDance Seed": "bytedance",
  "IBM": "ibm", "LiquidAI": "liquid", "Upstage": "upstage", "StepFun": "stepfun", "AionLabs": "aionlabs",
};

export default function ProviderLogo({ provider, size = 28 }: { provider: string; size?: number }) {
  const file = LOGOS[provider];
  const initials = provider.replace(/\(.*\)/, "").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span title={provider} style={{ width: size, height: size }}
      className={`inline-grid shrink-0 place-items-center rounded ${file ? "bg-[#eef5e8]" : "border border-line bg-panel-2"}`}>
      {file
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={`/providers/${file}.svg`} alt={provider} width={size * 0.62} height={size * 0.62} />
        : <span className="font-serif leading-none text-ember" style={{ fontSize: size * 0.55 }}>{initials}</span>}
    </span>
  );
}

export const PROVIDERS_WITH_LOGOS = [
  "OpenAI", "Anthropic", "Google", "xAI", "Meta", "DeepSeek", "Qwen", "Mistral", "MoonshotAI", "Z.ai", "NVIDIA",
  "Microsoft", "Nous Research", "MiniMax", "Cohere", "Amazon", "Perplexity", "ByteDance", "Tencent", "IBM",
];
