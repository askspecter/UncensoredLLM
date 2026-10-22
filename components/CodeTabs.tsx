"use client";
import { useState } from "react";

const SNIPPETS = {
  curl: `curl https://api.umbra.ai/v1/chat/completions \\
  -H "Authorization: Bearer $UMBRA_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "umbra/hermes-4-405b",
    "messages": [{"role": "user", "content": "Ask anything."}]
  }'`,
  python: `import os
from openai import OpenAI

client = OpenAI(
    base_url="https://api.umbra.ai/v1",
    api_key=os.environ["UMBRA_KEY"],
)

res = client.chat.completions.create(
    model="umbra/dolphin-mistral-24b",
    messages=[{"role": "user", "content": "Ask anything."}],
)
print(res.choices[0].message.content)`,
  node: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.umbra.ai/v1",
  apiKey: process.env.UMBRA_KEY,
});

const res = await client.chat.completions.create({
  model: "umbra/deepseek-v3.2",
  messages: [{ role: "user", content: "Ask anything." }],
});`,
};

export default function CodeTabs() {
  const [tab, setTab] = useState<keyof typeof SNIPPETS>("python");
  return (
    <div className="card overflow-hidden">
      <div className="flex gap-1 border-b border-line px-3 pt-3">
        {(Object.keys(SNIPPETS) as (keyof typeof SNIPPETS)[]).map((k) => (
          <button key={k} onClick={() => setTab(k)}
            className={`rounded-t-lg px-3 py-2 font-mono text-xs ${tab === k ? "bg-ink text-bone" : "text-mute hover:text-bone"}`}>{k}</button>
        ))}
      </div>
      <pre className="overflow-x-auto bg-ink p-5 font-mono text-[13px] leading-relaxed text-bone/90"><code>{SNIPPETS[tab]}</code></pre>
    </div>
  );
}
