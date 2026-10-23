"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./Providers";
import { MODELS } from "@/lib/data";

type Msg = { role: "user" | "assistant"; content: string; tokens?: number };
type Convo = { id: string; title: string; model: string; system: string; messages: Msg[]; updated: number };

const STORE = "beeper.chats.v1";
const DEFAULT_MODEL = "beeper/dolphin-mistral-24b";
const usd = (n: number) => `$${n.toFixed(n < 0.01 ? 4 : 2)}`;

// Conversations live only in this browser — nothing is stored on our servers.
function loadChats(): Convo[] {
  try { return JSON.parse(localStorage.getItem(STORE) ?? "[]"); } catch { return []; }
}
function saveChats(c: Convo[]) {
  try { localStorage.setItem(STORE, JSON.stringify(c.slice(0, 50))); } catch { /* storage unavailable */ }
}
const newConvo = (model = DEFAULT_MODEL): Convo => ({ id: Math.random().toString(36).slice(2), title: "New chat", model, system: "", messages: [], updated: Date.now() });

function Bubble({ m }: { m: Msg }) {
  // Minimal formatting: fenced code blocks in mono, everything else as wrapped text.
  const parts = m.content.split(/```/);
  return (
    <div className={m.role === "user" ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-panel-2 px-4 py-2.5" : "max-w-full"}>
      {parts.map((p, i) => i % 2
        ? <pre key={i} className="my-2 overflow-x-auto rounded-lg border border-line bg-ink p-3 font-mono text-[13px]"><code>{p.replace(/^\w*\n/, "")}</code></pre>
        : <p key={i} className="whitespace-pre-wrap leading-relaxed">{p}</p>)}
    </div>
  );
}

export default function Chat() {
  const auth = useAuth();
  const [chats, setChats] = useState<Convo[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [showSystem, setShowSystem] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const c = loadChats();
    const list = c.length ? c : [newConvo()];
    setChats(list);
    setActiveId(list[0].id);
  }, []);
  useEffect(() => { if (chats.length) saveChats(chats); }, [chats]);

  const active = chats.find((c) => c.id === activeId) ?? chats[0];
  const model = MODELS.find((m) => m.id === active?.model) ?? MODELS[0];

  const refreshBalance = useCallback(async () => {
    try {
      const r = await fetch("/api/me", { headers: await auth.authHeaders() });
      if (r.ok) setBalance((await r.json()).user.balance);
    } catch { /* ignore */ }
  }, [auth]);
  useEffect(() => { if (auth.authenticated) refreshBalance(); }, [auth.authenticated, refreshBalance]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [active?.messages.length, active?.messages.at(-1)?.content]);

  const update = (id: string, fn: (c: Convo) => Convo) => setChats((cs) => cs.map((c) => (c.id === id ? fn(c) : c)));

  function startNew() {
    const c = newConvo(active?.model);
    setChats((cs) => [c, ...cs]);
    setActiveId(c.id);
    setSidebar(false);
    setError("");
  }

  function remove(id: string) {
    setChats((cs) => {
      const rest = cs.filter((c) => c.id !== id);
      const list = rest.length ? rest : [newConvo()];
      if (id === activeId) setActiveId(list[0].id);
      return list;
    });
  }

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (!active || !input.trim() || busy) return;
    if (!auth.authenticated) return auth.login();
    setError("");
    const id = active.id;
    const history: Msg[] = [...active.messages, { role: "user", content: input.trim() }];
    update(id, (c) => ({ ...c, title: c.messages.length ? c.title : input.trim().slice(0, 40), messages: [...history, { role: "assistant", content: "" }], updated: Date.now() }));
    setInput("");
    setBusy(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        signal: ctrl.signal,
        headers: { "content-type": "application/json", ...(await auth.authHeaders()) },
        body: JSON.stringify({
          model: active.model,
          stream: true,
          messages: [...(active.system.trim() ? [{ role: "system", content: active.system.trim() }] : []), ...history.map(({ role, content }) => ({ role, content }))],
        }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message ?? err?.error ?? `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "", text = "", tokens = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
          try {
            const chunk = JSON.parse(line.slice(6));
            text += chunk.choices?.[0]?.delta?.content ?? "";
            if (chunk.usage) tokens = (chunk.usage.prompt_tokens ?? 0) + (chunk.usage.completion_tokens ?? 0);
          } catch { /* partial line */ }
        }
        update(id, (c) => ({ ...c, messages: [...history, { role: "assistant", content: text }] }));
      }
      update(id, (c) => ({ ...c, messages: [...history, { role: "assistant", content: text || "(no response)", tokens }] }));
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError((err as Error).message);
        update(id, (c) => ({ ...c, messages: c.messages.at(-1)?.content ? c.messages : history }));
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
      refreshBalance();
    }
  }

  if (!active) return null;
  const sorted = [...chats].sort((a, b) => b.updated - a.updated);

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-6xl">
      {/* Conversations */}
      <aside className={`${sidebar ? "fixed inset-0 z-30 block bg-ink/95 p-4 pt-20" : "hidden"} w-full shrink-0 border-r border-line md:static md:block md:w-64 md:bg-transparent md:p-4`}>
        <button onClick={startNew} className="btn btn-ghost w-full text-sm">+ New chat</button>
        <ul className="mt-4 space-y-1 overflow-y-auto text-sm">
          {sorted.map((c) => (
            <li key={c.id} className={`group flex items-center rounded-lg ${c.id === active.id ? "bg-panel-2" : "hover:bg-panel"}`}>
              <button onClick={() => { setActiveId(c.id); setSidebar(false); }} className="min-w-0 flex-1 truncate px-3 py-2 text-left">{c.title}</button>
              <button onClick={() => remove(c.id)} aria-label="Delete chat" className="px-2 text-mute opacity-0 hover:text-ember-soft group-hover:opacity-100">×</button>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-xs text-mute">Chats are saved only in this browser. Beeper never stores them.</p>
      </aside>

      {/* Conversation */}
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <button onClick={() => setSidebar(!sidebar)} className="rounded-full border border-line px-3 py-1.5 text-xs md:hidden">Chats</button>
          <select value={active.model} onChange={(e) => update(active.id, (c) => ({ ...c, model: e.target.value }))}
            className="min-w-0 max-w-[60vw] rounded-full border border-line bg-ink px-3 py-1.5 text-sm outline-none focus:border-ember">
            {MODELS.map((m) => <option key={m.id} value={m.id}>{m.uncensored ? "🔓 " : ""}{m.name}</option>)}
          </select>
          <button onClick={() => setShowSystem(!showSystem)} className={`rounded-full border px-3 py-1.5 text-xs ${active.system ? "border-ember text-bone" : "border-line text-mute"}`}>Persona</button>
          <span className="ml-auto font-mono text-xs text-mute">
            {balance !== null && <>balance {usd(balance)} · </>}${model.input}/${model.output} per 1M
          </span>
        </div>
        {showSystem && (
          <div className="border-b border-line p-4">
            <textarea value={active.system} onChange={(e) => update(active.id, (c) => ({ ...c, system: e.target.value }))} rows={3}
              placeholder="System prompt / persona — e.g. “You are a blunt, unfiltered writing partner.”"
              className="w-full rounded-xl border border-line bg-ink p-3 text-sm outline-none focus:border-ember" />
          </div>
        )}

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-6">
          {active.messages.length === 0 && (
            <div className="mx-auto mt-16 max-w-md text-center">
              <h2 className="font-serif text-4xl">Ask anything.</h2>
              <p className="mt-2 text-sm text-mute">Private and unfiltered. Billed per token from your balance{model.uncensored ? " — this model is uncensored" : ""}.</p>
            </div>
          )}
          {active.messages.map((m, i) => (
            <div key={i} className="text-[15px]">
              <Bubble m={m} />
              {m.role === "assistant" && busy && i === active.messages.length - 1 && <span className="caret" />}
              {m.role === "assistant" && m.tokens ? <p className="mt-1 font-mono text-[10px] text-mute">{m.tokens.toLocaleString()} tokens</p> : null}
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {error && (
          <p className="mx-4 mb-2 rounded-lg border border-ember/40 bg-ember/10 p-2.5 text-sm text-ember-soft">
            {error} {/credit|balance/i.test(error) && <a href="/#buy" className="underline">Top up</a>}
          </p>
        )}
        <form onSubmit={send} className="flex items-end gap-2 border-t border-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={1}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) { e.preventDefault(); send(); } }}
            placeholder={auth.authenticated ? "Ask anything…" : "Sign in to start chatting"}
            className="max-h-40 min-h-[2.75rem] flex-1 resize-none rounded-xl border border-line bg-ink px-4 py-2.5 text-base outline-none focus:border-ember" />
          {busy
            ? <button type="button" onClick={() => abortRef.current?.abort()} className="btn btn-ghost h-11 text-sm">Stop</button>
            : <button className="btn btn-primary h-11 text-sm">{auth.authenticated ? "Send" : "Sign in"}</button>}
        </form>
      </section>
    </div>
  );
}
