// Official provider marks (public/providers, from LobeHub icons, MIT). Community models get a monogram.
const LOGOS: Record<string, string> = {
  "Meta": "meta", "DeepSeek": "deepseek", "Alibaba": "qwen", "Alibaba Tongyi": "alibaba", "Moonshot": "kimi",
  "Zhipu": "zhipu", "Mistral": "mistral", "OpenAI (open weights)": "openai", "Nous Research": "nousresearch", "Tencent": "hunyuan",
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

export const PROVIDERS_WITH_LOGOS = Object.keys(LOGOS);
