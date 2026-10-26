// Beeper as an MCP server (Streamable HTTP, stateless): any MCP client can chat with any Beeper model,
// generate images, check its balance and verify Proof of Bill receipts. Calls are billed to the API key
// in the Authorization header, exactly like /v1.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getAddress } from "viem";
import { z } from "zod";
import { IMAGE_MODELS, MODELS } from "./data";
import { balanceOf } from "./gateway";
import { complete } from "./completion";
import { ImageError, generateImages } from "./images";
import { receiptWithProof } from "./bills";
import { RECEIPT_SIGNER, anchorData, decodeReceipt, encodeReceipt, foldProof, hashOutput, leafOf, receiptSigner, type SignedReceipt } from "./receipts";
import { chainClient } from "./server-wallet";

type Owner = { userId: string; keyId: string | null } | null;
const text = (t: string, isError = false) => ({ content: [{ type: "text" as const, text: t }], ...(isError ? { isError: true } : {}) });
const NO_KEY = text("This tool needs a Beeper API key. Create one at https://usebeeper.io/dashboard and send it as `Authorization: Bearer sk-beeper-…`.", true);
const usd = (micros: bigint | number) => `$${(Number(micros) / 1e6).toFixed(6)}`;

export function beeperMcp(owner: Owner) {
  const server = new McpServer({ name: "beeper", version: "1.0.0" }, {
    instructions: "Private, uncensored AI. 400+ chat models and image models on one prepaid balance. Prompts and answers are never stored; every chat answer comes with a Proof of Bill receipt.",
  });

  server.registerTool("list_models", {
    title: "List Beeper models",
    description: "Search the model catalogue. Returns id, name and price per 1M tokens (input/output). Use the id with `chat`.",
    inputSchema: {
      search: z.string().optional().describe("Matches model name, id or provider, e.g. 'claude', 'deepseek', 'hermes'"),
      uncensored_only: z.boolean().optional().describe("Only models served without refusals"),
      images: z.boolean().optional().describe("List image models instead of chat models"),
      limit: z.number().int().min(1).max(50).optional(),
    },
    annotations: { readOnlyHint: true },
  }, async ({ search, uncensored_only, images, limit }) => {
    const q = (search ?? "").toLowerCase();
    if (images) {
      const rows = IMAGE_MODELS.filter((m) => (!uncensored_only || m.uncensored) && `${m.name}${m.id}${m.provider}`.toLowerCase().includes(q));
      return text(rows.map((m) => `${m.id} · ${m.name} · $${m.perImage}/image${m.uncensored ? " · uncensored" : ""}`).join("\n") || "No image models match.");
    }
    const all = MODELS.filter((m) => (!uncensored_only || m.uncensored) && `${m.name}${m.id}${m.provider}`.toLowerCase().includes(q));
    const rows = all.slice(0, limit ?? 20), total = all.length;
    return text(rows.map((m) => `${m.id} · ${m.name} (${m.provider}) · $${m.input}/$${m.output} per 1M · ${m.context}${m.uncensored ? " · uncensored" : ""}`).join("\n")
      + (total > rows.length ? `\n…and ${total - rows.length} more. Narrow with \`search\`.` : "") || "No models match.");
  });

  server.registerTool("chat", {
    title: "Ask a Beeper model",
    description: "Send a prompt to any Beeper model and get its answer. Billed per token from the key's balance. Uncensored models answer without added filters. Returns the answer, its cost and a Proof of Bill receipt link.",
    inputSchema: {
      model: z.string().describe("Model id from list_models, e.g. beeper/hermes-4-405b or anthropic/claude-sonnet-4.5"),
      prompt: z.string().min(1).describe("The message to send"),
      system: z.string().optional().describe("Optional system prompt / persona"),
      max_tokens: z.number().int().min(1).max(16384).optional(),
    },
    annotations: { openWorldHint: true },
  }, async ({ model, prompt, system, max_tokens }) => {
    if (!owner) return NO_KEY;
    const body = {
      model, stream: false, ...(max_tokens ? { max_tokens } : {}),
      messages: [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: prompt }],
    };
    const res = await complete(new Request("https://usebeeper.io/v1/chat/completions", { method: "POST" }), owner, body);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return text(data?.error?.message ?? `Request failed (${res.status})`, true);
    const answer = (data.choices ?? []).map((c: { message?: { content?: string } }) => c.message?.content ?? "").join("");
    const receipt = data.receipt as SignedReceipt | undefined;
    return text(`${answer}\n\n---\n${data.model} · ${data.usage?.prompt_tokens ?? 0} in / ${data.usage?.completion_tokens ?? 0} out · $${data.usage?.cost_usd ?? 0}`
      + (receipt ? `\nReceipt: https://usebeeper.io/verify#${encodeReceipt(receipt)}` : ""));
  });

  server.registerTool("generate_image", {
    title: "Generate an image",
    description: "Create an image with a Beeper image model. Billed per image from the key's balance. Prompts involving minors are blocked.",
    inputSchema: {
      prompt: z.string().min(1).max(4000),
      model: z.string().optional().describe(`Image model id (default ${IMAGE_MODELS[0].id}). See list_models with images: true`),
      size: z.enum(["square", "portrait", "landscape"]).optional(),
    },
    annotations: { openWorldHint: true },
  }, async ({ prompt, model, size }) => {
    if (!owner) return NO_KEY;
    try {
      const r = await generateImages({ ...owner, model: model ?? IMAGE_MODELS[0].id, prompt, size, count: 1 });
      return {
        content: [
          ...r.images.map((src) => {
            const [, mimeType, data] = src.match(/^data:([^;]+);base64,(.*)$/) ?? [];
            return { type: "image" as const, data, mimeType };
          }),
          { type: "text" as const, text: `${r.model} · $${r.cost.toFixed(4)}` },
        ],
      };
    } catch (e) {
      return text(e instanceof ImageError ? e.message : "Image generation failed", true);
    }
  });

  server.registerTool("get_balance", {
    title: "Check balance",
    description: "Credit left on this API key's Beeper account, in USD.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => {
    if (!owner) return NO_KEY;
    return text(`${usd(await balanceOf(owner.userId))} of credit. Top up at https://usebeeper.io/#buy`);
  });

  server.registerTool("verify_receipt", {
    title: "Verify a Proof of Bill receipt",
    description: "Checks a Beeper receipt: signed by Beeper's wallet, included in its day's Merkle root, and that root written on Robinhood Chain. Optionally checks it covers a given answer text.",
    inputSchema: {
      receipt: z.string().describe("The receipt (base64), or a https://usebeeper.io/verify#… link"),
      answer: z.string().optional().describe("The answer text, to prove the receipt is for it"),
    },
    annotations: { readOnlyHint: true },
  }, async ({ receipt, answer }) => {
    const r = decodeReceipt(receipt.split("#").pop() ?? "");
    if (!r) return text("That is not a Beeper receipt.", true);
    const lines: string[] = [`Receipt ${r.id}: ${r.model}, ${r.promptTokens} in / ${r.completionTokens} out, ${usd(BigInt(r.costMicros))}, ${new Date(r.ts * 1000).toISOString()}`];
    const signer = await receiptSigner(r).catch(() => null);
    lines.push(signer && RECEIPT_SIGNER && getAddress(signer) === getAddress(RECEIPT_SIGNER) ? `✓ Signed by Beeper (${RECEIPT_SIGNER})` : "✕ Not signed by Beeper's wallet");
    if (answer !== undefined) {
      lines.push(hashOutput(answer) === r.outputHash.toLowerCase() ? "✓ Matches the answer text" : "✕ Does not match that answer text");
    }
    const p = await receiptWithProof(r.id, r.outputHash);
    if (!p) lines.push("✕ Not on Beeper's books");
    else if (!p.anchored) lines.push(`… The ${p.day} batch is written on chain after the day closes (00:20 UTC)`);
    else {
      lines.push(foldProof(leafOf(r), p.proof) === p.root ? `✓ In the ${p.day} Merkle root ${p.root}` : "✕ Proof does not reach the published root");
      const tx = await chainClient.getTransaction({ hash: p.tx as `0x${string}` }).catch(() => null);
      const ok = tx && RECEIPT_SIGNER && getAddress(tx.from) === getAddress(RECEIPT_SIGNER) && tx.input.toLowerCase() === anchorData(p.day, p.root).toLowerCase();
      lines.push(ok ? `✓ Root written on Robinhood Chain: https://robinhoodchain.blockscout.com/tx/${p.tx}` : "✕ Anchor transaction does not match");
    }
    return text(lines.join("\n"));
  });

  return server;
}
