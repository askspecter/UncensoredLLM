import CodeTabs from "@/components/CodeTabs";

export const metadata = { title: "Docs | Beeper" };

const TOC = [
  ["quickstart", "Quickstart"], ["auth", "Authentication"], ["chat", "Chat completions"], ["streaming", "Streaming"],
["models", "List models"], ["x402", "Pay per request (x402)"], ["receipts", "Proof of Bill"], ["mcp", "MCP & agents"], ["limits", "Rate limits"], ["errors", "Errors"],
];

function Code({ children }: { children: string }) {
  return <pre className="mt-4 overflow-x-auto rounded-md border border-line bg-ink p-4 font-mono text-[13px] leading-relaxed text-bone/90"><code>{children}</code></pre>;
}

function Sec({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-b border-line py-10">
      <h2 className="text-2xl font-semibold tracking-[-0.035em] text-bone md:text-3xl">{title}</h2>
      <div className="mt-3 space-y-3 text-mute">{children}</div>
    </section>
  );
}

const ERRORS = [
  ["400", "invalid_request", "Malformed body or unknown parameter."],
  ["401", "invalid_key", "Missing, revoked or mistyped API key."],
  ["402", "insufficient_credit", "Balance too low. Top up and retry."],
  ["404", "model_not_found", "Model ID doesn’t exist. Check /v1/models."],
  ["429", "rate_limited", "Too many requests. Respect Retry-After."],
  ["502", "upstream_error", "Provider failed. Safe to retry with backoff; you are not billed."],
];

export default function Docs() {
  return (
    <main className="mx-auto grid max-w-6xl gap-10 px-5 pt-8 md:pt-12 lg:grid-cols-[200px_1fr]">
      <aside className="hidden lg:block">
        <nav className="sticky top-24 space-y-1 text-sm">
          <p className="eyebrow mb-3">Docs</p>
          {TOC.map(([id, label]) => <a key={id} href={`#${id}`} className="block rounded-lg px-3 py-1.5 text-mute hover:bg-panel-2 hover:text-bone">{label}</a>)}
        </nav>
      </aside>

      <div className="min-w-0">
        <p className="eyebrow">Developer docs</p>
        <h1 className="mt-3 text-4xl leading-[1.05] font-semibold tracking-[-0.035em] text-bone md:text-6xl">Build on Beeper.</h1>
        <p className="mt-4 max-w-2xl text-mute">An OpenAI-compatible API for private, uncensored inference. If your code talks to OpenAI, it talks to Beeper.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3 font-mono text-sm">
          <div className="card p-4"><p className="text-xs text-mute">Base URL</p><p className="mt-1 break-all">https://usebeeper.io/v1</p></div>
          <div className="card p-4"><p className="text-xs text-mute">Auth</p><p className="mt-1">Bearer sk-beeper-…</p></div>
          <div className="card p-4"><p className="text-xs text-mute">Format</p><p className="mt-1">OpenAI Chat Completions</p></div>
        </div>

        <Sec id="quickstart" title="Quickstart">
          <p>1. <a href="/#buy" className="text-ember-soft underline">Buy credits</a> and copy your key. 2. Set <code className="text-bone">BEEPER_KEY</code>. 3. Point your SDK at the base URL.</p>
          <div className="pt-2"><CodeTabs /></div>
        </Sec>

        <Sec id="auth" title="Authentication">
          <p>Send your key in the <code className="text-bone">Authorization</code> header. Keys are shown once. We only store a hash. Rotate them any time from Account.</p>
          <Code>{`Authorization: Bearer sk-beeper-XXXXXXXXXXXXXXXX`}</Code>
        </Sec>

        <Sec id="chat" title="Chat completions">
          <p><code className="text-bone">POST /v1/chat/completions</code> takes the same parameters as OpenAI: <code className="text-bone">model</code>, <code className="text-bone">messages</code>, <code className="text-bone">temperature</code>, <code className="text-bone">max_tokens</code>, <code className="text-bone">tools</code>, <code className="text-bone">response_format</code>.</p>
          <Code>{`{
  "id": "chatcmpl-9x2…",
  "model": "beeper/hermes-4-405b",
  "upstream_model": "nousresearch/hermes-4-405b",
  "choices": [{ "message": { "role": "assistant", "content": "…" } }],
  "usage": { "prompt_tokens": 18, "completion_tokens": 212, "total_tokens": 230, "cost_usd": 0.000654 }
}`}</Code>
          <p>Every response reports the exact <code className="text-bone">upstream_model</code> and the <code className="text-bone">cost_usd</code>.</p>
        </Sec>

        <Sec id="streaming" title="Streaming">
          <p>Set <code className="text-bone">"stream": true</code> to receive server-sent events. Gateway overhead is under 40 ms p50.</p>
          <Code>{`curl https://usebeeper.io/v1/chat/completions -N \\
  -H "Authorization: Bearer $BEEPER_KEY" -H "Content-Type: application/json" \\
  -d '{"model":"beeper/dolphin-mistral-24b","stream":true,
       "messages":[{"role":"user","content":"Tell me a dark story."}]}'`}</Code>
        </Sec>

        <Sec id="images" title="Images">
          <p><code className="text-bone">POST /v1/images/generations</code> with an image model such as <code className="text-bone">beeper/lustify-sdxl</code>. Sizes: <code className="text-bone">square</code>, <code className="text-bone">portrait</code>, <code className="text-bone">landscape</code>; up to 4 images per request, billed per image returned.</p>
          <Code>{`curl https://usebeeper.io/v1/images/generations \\
  -H "Authorization: Bearer $BEEPER_KEY" -H "Content-Type: application/json" \\
  -d '{"model":"beeper/chroma","prompt":"noir city at 3am, rain, neon","size":"portrait","n":1}'
# → { "data": [{ "b64_json": "…" }], "cost_usd": 0.012 }`}</Code>
          <p>Prompts involving minors are refused for every model.</p>
        </Sec>

        <Sec id="models" title="List models">
          <p><code className="text-bone">GET /v1/models</code> returns every model with its price per 1M tokens. Filter with <code className="text-bone">?uncensored=true</code>.</p>
        </Sec>

        <Sec id="mcp" title="MCP & agents">
          <p>Use Beeper as the model provider in any agent that supports OpenAI-compatible endpoints: Claude Code proxies, Cursor, Cline, OpenWebUI, SillyTavern, LiteLLM.</p>
          <Code>{`# LiteLLM / OpenWebUI / Cline
OPENAI_API_BASE=https://usebeeper.io/v1
OPENAI_API_KEY=$BEEPER_KEY
MODEL=beeper/hermes-4-405b`}</Code>
        </Sec>

        <Sec id="x402" title="Pay per request (x402)">
          <p>No account and no API key: call <code className="text-bone">/v1/chat/completions</code> without an <code className="text-bone">Authorization</code> header and pay each request in USDG on Robinhood Chain with <a href="https://x402.org" className="text-ember-soft underline">x402</a>. The server answers <code className="text-bone">402</code> with a <code className="text-bone">PAYMENT-REQUIRED</code> header quoting the most the request can cost; your client signs a USDG <code className="text-bone">transferWithAuthorization</code> for it and retries with <code className="text-bone">PAYMENT-SIGNATURE</code>. Beeper pays the gas.</p>
          <p className="mt-3">You are billed the real token cost. Whatever is left of the payment stays as credit for your wallet and pays for its next requests, so most calls after the first settle nothing on chain.</p>
          <Code>{`# network  eip155:4663 (Robinhood Chain)
# asset    USDG 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168
# scheme   exact (EIP-3009), EIP-712 domain "Global Dollar", version "1"

import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";

const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const pay = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: "eip155:4663", client: new ExactEvmScheme(privateKeyToAccount(KEY)) }],
  spendControls: { allowedAssets: [{ network: "eip155:4663", asset: USDG, maxAmountPerPayment: "1000000" }] },
});
const res = await pay("https://usebeeper.io/v1/chat/completions", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ model: "beeper/hermes-4-405b", max_tokens: 800, messages: [{ role: "user", content: "hi" }] }),
});`}</Code>
          <p className="mt-3 text-sm text-mute"><code>max_tokens</code> sets the quote (default 2,048). The settlement transaction comes back in the <code>PAYMENT-RESPONSE</code> header.</p>
        </Sec>

        <Sec id="receipts" title="Proof of Bill">
          <p>Every completion returns a receipt signed by Beeper&apos;s server wallet: model, token counts, price, time and the keccak256 of the generated text. The text itself is never stored.</p>
          <p className="mt-3">Non-streaming responses carry it in a <code className="text-bone">receipt</code> field and the <code className="text-bone">x-beeper-receipt</code> header. Streams end with an SSE comment, <code className="text-bone">: beeper-receipt &lt;base64&gt;</code>, which OpenAI clients ignore. Each UTC day&apos;s receipts are folded into one Merkle root and written to Robinhood Chain. Check any receipt at <a href="/verify" className="text-ember-soft underline">/verify</a>, or fetch its proof from <code className="text-bone">GET /api/receipts/:id?h=&lt;outputHash&gt;</code>.</p>
        </Sec>

        <Sec id="limits" title="Rate limits">
          <p><code className="text-bone">max_tokens</code> is capped to what your balance can pay for. Requests are rejected with <code className="text-bone">402</code> when the balance runs out.</p>
        </Sec>

        <Sec id="errors" title="Errors">
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-sm">
              <tbody className="divide-y divide-line">
                {ERRORS.map(([code, type, desc]) => (
                  <tr key={code} className="align-top"><td className="py-3 pr-4 text-ember-soft">{code}</td><td className="py-3"><span className="text-bone">{type}</span><span className="mt-0.5 block font-sans text-xs text-mute sm:hidden">{desc}</span></td><td className="hidden py-3 pl-4 font-sans text-mute sm:table-cell">{desc}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Sec>
      </div>
    </main>
  );
}
