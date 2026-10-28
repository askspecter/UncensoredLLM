// The long tail: tens of thousands of open models from Hugging Face, served by Featherless.
// Server-only (the list is ~1.6 MB); pages reach it through /api/models/search.
import ROWS from "./longtail-models.json";
import { findModel, withMargin, type Model } from "./data";

type Row = [id: string, context: number, input: number, output: number, cls: string];

export const LONGTAIL_PREFIX = "hf/";
// On when Beeper can pay for these models itself (API key), or users can connect their own Featherless plan (OAuth).
export const longtailEnabled = Boolean(process.env.FEATHERLESS_API_KEY || process.env.FEATHERLESS_CLIENT_SECRET);
/** Beeper's own Featherless key; without it a long-tail request needs the user's connected account. */
export const longtailPaid = Boolean(process.env.FEATHERLESS_API_KEY);

const rows = ROWS as Row[];
const byId = new Map(rows.map((r) => [r[0].toLowerCase(), r]));
const UNCENSORED = /uncensor|abliterat|heretic|dolphin|lewd|nsfw|erp|roleplay|\brp\b|-rp-|magnum|euryale|mythomax|lumimaid|cydonia/i;

const ctx = (n: number) => (n >= 1e6 ? `${+(n / 1048576).toFixed(1)}M` : `${Math.round(n / 1000)}K`);

function toModel(r: Row): Model {
  const [repo, context, input, output, cls] = r;
  const [owner, ...rest] = repo.split("/");
  const uncensored = UNCENSORED.test(repo);
  return {
    id: `${LONGTAIL_PREFIX}${repo}`, upstream: repo, route: "featherless",
    name: rest.join("/") || repo, provider: owner, context: ctx(context),
    input: withMargin(input), output: withMargin(output), cost: { input, output },
    uncensored, tags: [uncensored && "roleplay", /coder|code/i.test(repo) && "code", cls].filter(Boolean) as string[],
  };
}

export const longtailCount = () => (longtailEnabled ? rows.length : 0);

/** `hf/owner/model` (or the bare Hugging Face repo id) to a billable model, when the long tail is enabled. */
export function findLongtail(id: string): Model | undefined {
  if (!longtailEnabled) return undefined;
  const repo = id.startsWith(LONGTAIL_PREFIX) ? id.slice(LONGTAIL_PREFIX.length) : id;
  const r = byId.get(repo.toLowerCase());
  return r ? toModel(r) : undefined;
}

/** Any model Beeper can bill: the main catalogue first, then the long tail. */
export const resolveModel = (id: string) => findModel(id) ?? findLongtail(id);

// Labs and well-known finetuners first; automated training-swarm checkpoints (thousands of tiny copies) last.
const KNOWN = new Set(["qwen", "meta-llama", "mistralai", "google", "deepseek-ai", "microsoft", "nousresearch", "cognitivecomputations",
  "sao10k", "anthracite-org", "thedrummer", "gryphe", "neversleep", "undi95", "huihui-ai", "mlabonne", "failspy", "nvidia", "01-ai", "tiiuae"]);
const rank = (id: string) => (/swarm|gensyn/i.test(id) ? 2 : KNOWN.has(id.split("/")[0].toLowerCase()) ? 0 : 1);

/** Case-insensitive search over repo ids; every word must match. */
export function searchLongtail(q: string, offset = 0, limit = 50, uncensoredOnly = false) {
  if (!longtailEnabled) return { total: 0, models: [] as Model[] };
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = rows.filter((r) => {
    const id = r[0].toLowerCase();
    return words.every((w) => id.includes(w)) && (!uncensoredOnly || UNCENSORED.test(r[0]));
  }).sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].length - b[0].length);
  return { total: hits.length, models: hits.slice(offset, offset + limit).map(toModel) };
}

export const allLongtail = () => (longtailEnabled ? rows.map(toModel) : []);
