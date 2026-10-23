// Shared chat-completions pipeline: balance checks, upstream call, streaming passthrough, billing.
import { MARGIN, findModel, type Model } from "./data";
import {
  MIN_BALANCE_MICROS, affordableMaxTokens, apiError, balanceOf, chargeUsage,
  costMicros, privacyRouting, upstreamFetch,
} from "./gateway";

type Usage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number };

/** Our catalogue price, or upstream's reported cost plus margin if that's higher (upstream raised prices). */
function priceOf(model: Model, u: Usage) {
  const catalogue = costMicros(model, u.prompt_tokens ?? 0, u.completion_tokens ?? 0);
  const upstream = typeof u.cost === "number" ? BigInt(Math.ceil(u.cost * 1e6 * (1 + MARGIN))) : BigInt(0);
  if (upstream > catalogue) console.warn(`[gateway] ${model.id} upstream cost above catalogue, update prices in lib/data.ts`);
  return upstream > catalogue ? upstream : catalogue;
}

export async function complete(req: Request, owner: { userId: string; keyId: string | null }) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || !Array.isArray(body.messages)) {
    return apiError(400, "invalid_request", "Body must be JSON with `model` and `messages`");
  }
  const model = findModel(String(body.model ?? ""));
  if (!model) return apiError(404, "model_not_found", `Unknown model "${body.model}". See GET /v1/models`);

  const balance = await balanceOf(owner.userId);
  if (balance < MIN_BALANCE_MICROS) return apiError(402, "insufficient_credit", "Balance too low. Top up at https://usebeeper.io/#buy");
  const maxTokens = affordableMaxTokens(model, balance, body.messages, Number(body.max_tokens ?? body.max_completion_tokens) || undefined);
  if (maxTokens < 1) return apiError(402, "insufficient_credit", "Balance too low for this prompt. Top up at https://usebeeper.io/#buy");

  const stream = body.stream === true;
  const upstreamBody = {
    ...body,
    model: model.upstream,
    max_tokens: maxTokens,
    max_completion_tokens: undefined,
    usage: { include: true },
    provider: privacyRouting(),
    ...(stream ? { stream_options: { include_usage: true } } : {}),
  };

  const started = Date.now();
  const ctrl = new AbortController();
  req.signal.addEventListener("abort", () => ctrl.abort());
  let res: Response;
  try {
    res = await upstreamFetch("/chat/completions", upstreamBody, ctrl.signal);
  } catch {
    return apiError(502, "upstream_error", "Model provider unreachable. You were not charged.");
  }
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message ?? `Upstream error ${res.status}`;
    return apiError(res.status >= 500 ? 502 : res.status, res.status === 429 ? "rate_limited" : "upstream_error", `${msg}. You were not charged.`);
  }

  const bill = (u: Usage, status = 200) => chargeUsage({
    userId: owner.userId, keyId: owner.keyId, model: model.id,
    promptTokens: u.prompt_tokens ?? 0, completionTokens: u.completion_tokens ?? 0,
    costMicros: priceOf(model, u),
    latencyMs: Date.now() - started, status,
  });

  if (!stream) {
    const data = await res.json();
    const usage: Usage = data.usage ?? {};
    const charged = await bill(usage);
    return Response.json({
      ...data,
      model: model.id,
      upstream_model: model.upstream,
      provider: undefined,
      usage: { prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens, total_tokens: usage.total_tokens, cost_usd: Number(charged) / 1e6 },
    });
  }

  // Streaming: pass SSE through, rewriting the model name and capturing the final usage chunk.
  let usage: Usage | null = null;
  let streamedChars = 0;
  let buffer = "";
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const rewrite = (line: string) => {
    if (!line.startsWith("data: ") || line === "data: [DONE]") return line;
    try {
      const chunk = JSON.parse(line.slice(6));
      if (chunk.usage) {
        usage = chunk.usage;
        chunk.usage = { prompt_tokens: chunk.usage.prompt_tokens, completion_tokens: chunk.usage.completion_tokens, total_tokens: chunk.usage.total_tokens };
      }
      for (const c of chunk.choices ?? []) streamedChars += (c.delta?.content?.length ?? 0) + (c.delta?.reasoning?.length ?? 0);
      chunk.model = model.id;
      delete chunk.provider;
      return `data: ${JSON.stringify(chunk)}`;
    } catch {
      return line;
    }
  };
  const settle = async () => {
    // If the client hung up before the usage chunk, bill an estimate (upstream still charges us).
    const u: Usage = usage ?? { prompt_tokens: Math.ceil(JSON.stringify(body.messages).length / 4), completion_tokens: Math.ceil(streamedChars / 4) };
    await bill(u, usage ? 200 : 499).catch((e) => console.error("[gateway] billing failed", e));
  };

  const reader = res.body.getReader();
  let settled = false;
  const finish = async () => { if (!settled) { settled = true; await settle(); } };
  const out = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          if (buffer) controller.enqueue(enc.encode(rewrite(buffer)));
          await finish();
          controller.close();
          return;
        }
        buffer += dec.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        if (lines.length) controller.enqueue(enc.encode(lines.map(rewrite).join("\n") + "\n"));
      } catch (e) {
        await finish();
        controller.error(e);
      }
    },
    async cancel() {
      // Client disconnected: stop upstream and bill what was generated.
      ctrl.abort();
      await finish();
    },
  });

  return new Response(out, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive" },
  });
}
