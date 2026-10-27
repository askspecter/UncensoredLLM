"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./Providers";
import { FEATURED, IMAGE_MODELS, MODELS } from "@/lib/data";
import ProviderLogo from "./ProviderLogo";

type Source = { url: string; title?: string };
type Msg = { role: "user" | "assistant"; content: string; tokens?: number; images?: string[]; receipt?: string; attachment?: string; sources?: Source[] };
type Convo = { id: string; title: string; model: string; system: string; messages: Msg[]; updated: number; web?: boolean };

const STORE = "beeper.chats.v1";
// Picker groups: hand-picked models first, then every other model by provider.
const BY_PROVIDER = Object.entries(MODELS.slice(FEATURED.length).reduce<Record<string, typeof MODELS>>((acc, m) => {
  (acc[m.provider] ??= []).push(m);
  return acc;
}, {})).sort(([a], [b]) => a.localeCompare(b));
const DEFAULT_MODEL = "beeper/dolphin-mistral-24b";
const usd = (n: number) => `$${n.toFixed(n < 0.01 ? 4 : 2)}`;

// Conversations live only in this browser, nothing is stored on our servers.
// Burner chats use sessionStorage, so they're gone when the tab closes.
const store = (burner: boolean) => (burner ? sessionStorage : localStorage);
const storeKey = (burner: boolean) => (burner ? "beeper.burner.chats" : STORE);
function loadChats(burner: boolean): Convo[] {
  try { return JSON.parse(store(burner).getItem(storeKey(burner)) ?? "[]"); } catch { return []; }
}
function saveChats(c: Convo[], burner: boolean) {
  // Generated images are too large for browser storage; keep a marker instead.
  const slim = c.slice(0, 50).map((cv) => ({ ...cv, messages: cv.messages.map(({ images, attachment, ...m }) => {
    let content = m.content;
    if (images?.length) content = `${content}\n[${images.length} image(s), download them before leaving]`.trim();
    if (attachment) content = `[image attached] ${content}`.trim();
    return { ...m, content };
  }) }));
  try { store(burner).setItem(storeKey(burner), JSON.stringify(slim)); } catch { /* storage unavailable */ }
}
const IMAGE_INTENT = /\b(buat(kan)?|bikin(in|kan)?|generate|draw|create|make|render)\b.{0,40}\b(gambar|image|picture|pic|foto|photo|ilustrasi|illustration|logo|poster|wallpaper)\b|\b(gambarkan|lukiskan)\b|^\s*(draw|paint|sketch)\b/i;
const URL_RE = /https?:\/\/\S+/i;
// A cheap model that can see, offered when an image is attached to a text-only model.
const VISION_DEFAULT = MODELS.find((m) => m.id === "google/gemini-3.5-flash-lite") ?? MODELS.find((m) => m.tags.includes("vision"));
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

/** Renders [label](https://…) markdown links (web search citations) as real links. */
function linkify(text: string) {
  const parts = text.split(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g);
  return parts.map((p, i) => (i % 3 === 1
    ? <a key={i} href={parts[i + 1]} target="_blank" rel="noreferrer" className="text-ember-soft underline">{p}</a>
    : i % 3 === 2 ? null : p));
}

/** Downscales a picked image to at most 1536px and re-encodes it as JPEG, so requests stay small. */
function shrinkImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1536 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("That file isn't an image we can read"));
    img.src = URL.createObjectURL(file);
  });
}

const newConvo = (model = DEFAULT_MODEL): Convo => ({ id: Math.random().toString(36).slice(2), title: "New chat", model, system: "", messages: [], updated: Date.now() });

function Bubble({ m }: { m: Msg }) {
  // Minimal formatting: fenced code blocks in mono, everything else as wrapped text.
  const parts = m.content.split(/```/);
  return (
    <div className={m.role === "user" ? "ml-auto max-w-[85%] rounded-lg rounded-br-none bg-panel-2 px-4 py-2.5" : "max-w-full"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {m.attachment && <img src={m.attachment} alt="Attached image" className="mb-2 max-h-60 rounded-md border border-line" />}
      {parts.map((p, i) => i % 2
        ? <pre key={i} className="my-2 overflow-x-auto rounded-lg border border-line bg-ink p-3 font-mono text-[13px]"><code>{p.replace(/^\w*\n/, "")}</code></pre>
        : <p key={i} className="whitespace-pre-wrap leading-relaxed">{linkify(p)}</p>)}
      {m.sources?.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {m.sources.map((src, i) => (
            <a key={src.url} href={src.url} target="_blank" rel="noreferrer" title={src.title ?? src.url}
              className="max-w-[16rem] truncate rounded border border-line px-2 py-1 font-mono text-[11px] text-mute hover:border-ember hover:text-bone">{i + 1}. {host(src.url)}</a>
          ))}
        </div>
      ) : null}
      {m.images?.map((src, i) => (
        <figure key={i} className="mt-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="Generated image" className="max-h-[28rem] rounded-md border border-line" />
          <a href={src} download={`beeper-${Date.now()}-${i}.png`} className="mt-1 inline-block text-xs text-ember-soft underline">Download</a>
        </figure>
      ))}
    </div>
  );
}

/** `burnerKey` runs the chat as a burner account (authenticated by its key) instead of the signed-in user. */
export default function Chat({ burnerKey, onBalance, height = "h-[calc(100dvh-4rem)]" }: { burnerKey?: string; onBalance?: (usd: number) => void; height?: string } = {}) {
  const privy = useAuth();
  const burner = Boolean(burnerKey);
  const auth = useMemo(() => (burnerKey
    ? { ...privy, authenticated: true, login: () => {}, authHeaders: async (): Promise<Record<string, string>> => ({ authorization: `Bearer ${burnerKey}` }) }
    : privy), [privy, burnerKey]);
  const [chats, setChats] = useState<Convo[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [showSystem, setShowSystem] = useState(false);
  const [attachment, setAttachment] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [sidebar, setSidebar] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const c = loadChats(burner);
    const list = c.length ? c : [newConvo()];
    setChats(list);
    setActiveId(list[0].id);
  }, []);
  useEffect(() => { if (chats.length) saveChats(chats, burner); }, [chats, burner]);

  const active = chats.find((c) => c.id === activeId) ?? chats[0];
  const imageModel = IMAGE_MODELS.find((m) => m.id === active?.model) ?? null;
  const model = MODELS.find((m) => m.id === active?.model) ?? MODELS[0];
  const lastUser = !imageModel && !busy ? active?.messages.findLast((m) => m.role === "user")?.content ?? "" : "";
  const hint = attachment && !imageModel && !model.tags.includes("vision") ? "vision"
    : IMAGE_INTENT.test(lastUser) ? "image" : URL_RE.test(lastUser) && !active?.web ? "url" : null;
  const [size, setSize] = useState<"square" | "portrait" | "landscape">("square");

  const refreshBalance = useCallback(async () => {
    try {
      const r = await fetch("/api/me", { headers: await auth.authHeaders() });
      if (r.ok) {
        const b = (await r.json()).user.balance;
        setBalance(b);
        onBalance?.(b);
      }
    } catch { /* ignore */ }
  }, [auth, onBalance]);
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
    if (!active || (!input.trim() && !attachment) || busy) return;
    if (attachment && !imageModel && !model.tags.includes("vision")) return;
    if (!auth.authenticated) return auth.login();
    setError("");
    const id = active.id;
    const history: Msg[] = [...active.messages, { role: "user", content: input.trim(), ...(attachment && !imageModel ? { attachment } : {}) }];
    update(id, (c) => ({ ...c, title: c.messages.length ? c.title : (input.trim() || "Image").slice(0, 40), messages: [...history, { role: "assistant", content: "" }], updated: Date.now() }));
    setInput("");
    setAttachment(null);
    setBusy(true);

    if (imageModel) {
      try {
        const res = await fetch("/api/image", {
          method: "POST",
          headers: { "content-type": "application/json", ...(await auth.authHeaders()) },
          body: JSON.stringify({ model: imageModel.id, prompt: history.at(-1)!.content, size }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
        update(id, (c) => ({ ...c, messages: [...history, { role: "assistant", content: "", images: data.images }] }));
      } catch (err) {
        setError((err as Error).message);
        update(id, (c) => ({ ...c, messages: history }));
      } finally {
        setBusy(false);
        refreshBalance();
      }
      return;
    }

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
          messages: [...(active.system.trim() ? [{ role: "system", content: active.system.trim() }] : []), ...history.map(({ role, content, attachment: a }) => (
            a ? { role, content: [{ type: "text", text: content || "What is in this image?" }, { type: "image_url", image_url: { url: a } }] } : { role, content }
          ))],
          ...(active.web ? { plugins: [{ id: "web", max_results: 5 }] } : {}),
        }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message ?? err?.error ?? `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "", text = "", tokens = 0, receipt: string | undefined;
      const sources: Source[] = [];
      const images: string[] = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (line.startsWith(": beeper-receipt ")) { receipt = line.slice(17).trim(); continue; }
          if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
          try {
            const chunk = JSON.parse(line.slice(6));
            const delta = chunk.choices?.[0]?.delta ?? {};
            text += delta.content ?? "";
            for (const a of [...(delta.annotations ?? []), ...(chunk.choices?.[0]?.message?.annotations ?? [])]) {
              const u = a?.url_citation?.url;
              if (u && !sources.some((x) => x.url === u)) sources.push({ url: u, title: a.url_citation.title });
            }
            for (const img of delta.images ?? []) if (img?.image_url?.url) images.push(img.image_url.url);
            if (chunk.usage) tokens = (chunk.usage.prompt_tokens ?? 0) + (chunk.usage.completion_tokens ?? 0);
          } catch { /* partial line */ }
        }
        update(id, (c) => ({ ...c, messages: [...history, { role: "assistant", content: text, images: [...images] }] }));
      }
      update(id, (c) => ({ ...c, messages: [...history, { role: "assistant", content: text || (images.length ? "" : "(no response)"), tokens, images, receipt, ...(sources.length ? { sources } : {}) }] }));
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
    <div className={`mx-auto flex ${height} max-w-6xl`}>
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
          <button onClick={() => setSidebar(!sidebar)} className="rounded border border-line px-3 py-1.5 text-xs md:hidden">Chats</button>
          <ProviderLogo provider={imageModel ? imageModel.provider : model.provider} size={30} />
          <select value={active.model} onChange={(e) => update(active.id, (c) => ({ ...c, model: e.target.value }))}
            className="min-w-0 max-w-[60vw] rounded border border-line bg-ink px-3 py-1.5 text-sm outline-none focus:border-ember">
            <optgroup label="Featured">
              {FEATURED.map((m) => <option key={m.id} value={m.id}>{m.uncensored ? "🔓 " : ""}{m.name}</option>)}
            </optgroup>
            <optgroup label="Image">
              {IMAGE_MODELS.map((m) => <option key={m.id} value={m.id}>🖼 {m.uncensored ? "🔓 " : ""}{m.name}</option>)}
            </optgroup>
            {BY_PROVIDER.map(([provider, list]) => (
              <optgroup key={provider} label={provider}>
                {list.map((m) => <option key={m.id} value={m.id}>{m.uncensored ? "🔓 " : ""}{m.name}</option>)}
              </optgroup>
            ))}
          </select>
          {imageModel ? (
            <div className="flex rounded border border-line p-0.5 text-xs">
              {(["square", "portrait", "landscape"] as const).map((sz) => (
                <button key={sz} onClick={() => setSize(sz)} className={`rounded px-2 py-1 uppercase ${size === sz ? "bg-ember text-ink" : "text-mute"}`}>{sz}</button>
              ))}
            </div>
          ) : (
            <button onClick={() => setShowSystem(!showSystem)} className={`rounded border px-3 py-1.5 text-xs ${active.system ? "border-ember text-bone" : "border-line text-mute"}`}>Persona</button>
          )}
          <span className="ml-auto font-mono text-xs text-mute">
            {balance !== null && <>balance {usd(balance)} · </>}{imageModel ? `$${imageModel.perImage} / image` : `$${model.input}/$${model.output} per 1M`}
          </span>
        </div>
        {showSystem && (
          <div className="border-b border-line p-4">
            <textarea value={active.system} onChange={(e) => update(active.id, (c) => ({ ...c, system: e.target.value }))} rows={3}
              placeholder="System prompt / persona, e.g. “You are a blunt, unfiltered writing partner.”"
              className="w-full rounded-md border border-line bg-ink p-3 text-sm outline-none focus:border-ember" />
          </div>
        )}

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-6">
          {active.messages.length === 0 && (
            <div className="mx-auto mt-16 max-w-md text-center">
              <h2 className="font-serif text-5xl uppercase text-ember">{imageModel ? "Imagine anything." : "Ask anything."}</h2>
              <p className="mt-2 text-sm text-mute">
                {imageModel
                  ? <>Describe the image you want: {imageModel.style.toLowerCase()}. ${imageModel.perImage} per image. Prompts involving minors are blocked.</>
                  : <>Private and unfiltered. Billed per token from your balance{model.uncensored ? ". This model is uncensored" : ""}.</>}
              </p>
            </div>
          )}
          {active.messages.map((m, i) => (
            <div key={i} className="text-[15px]">
              <Bubble m={m} />
              {m.role === "assistant" && busy && i === active.messages.length - 1 && <span className="caret" />}
              {m.role === "assistant" && m.tokens ? (
                <p className="mt-1 font-mono text-[10px] text-mute">
                  {m.tokens.toLocaleString()} tokens
                  {m.receipt && <> · <a href={`/verify#${m.receipt}`} target="_blank" rel="noreferrer" className="text-ember-soft underline">receipt</a></>}
                </p>
              ) : null}
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {hint && (
          <div className="mx-4 mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-panel p-2.5 text-sm text-mute">
            {hint === "vision" && VISION_DEFAULT ? (
              <>
                <span className="min-w-0 flex-1">{model.name} can&apos;t see images. Switch to a model that can.</span>
                <button type="button" onClick={() => update(active.id, (c) => ({ ...c, model: VISION_DEFAULT.id }))}
                  className="btn btn-primary h-8 px-3 text-xs">Use {VISION_DEFAULT.name}</button>
              </>
            ) : hint === "image" ? (
              <>
                <span className="min-w-0 flex-1">Chat models write text only. To create an image, switch to an image model.</span>
                <button type="button" onClick={() => { update(active.id, (c) => ({ ...c, model: IMAGE_MODELS[0].id })); setInput(lastUser); }}
                  className="btn btn-primary h-8 px-3 text-xs">Use {IMAGE_MODELS[0].name}</button>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1">Turn on Web and the model can search and read pages.</span>
                <button type="button" onClick={() => { update(active.id, (c) => ({ ...c, web: true })); setInput(lastUser); }}
                  className="btn btn-primary h-8 px-3 text-xs">Turn on Web</button>
              </>
            )}
          </div>
        )}
        {error && (
          <p className="mx-4 mb-2 rounded-lg border border-danger/40 bg-danger/10 p-2.5 text-sm text-ember-soft">
            {error} {/credit|balance/i.test(error) && <a href="/#buy" className="underline">Top up</a>}
          </p>
        )}
        {attachment && (
          <div className="mx-3 mb-2 flex items-center gap-3 rounded-lg border border-line bg-panel p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={attachment} alt="To attach" className="h-12 w-12 rounded object-cover" />
            <span className="flex-1 text-xs text-mute">Image attached. It goes to the model with your next message.</span>
            <button type="button" onClick={() => setAttachment(null)} className="px-2 text-sm text-mute hover:text-danger">✕</button>
          </div>
        )}
        <form onSubmit={send} className="flex items-end gap-2 border-t border-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {!imageModel && (
            <>
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { try { setAttachment(await shrinkImage(f)); } catch (err) { setError((err as Error).message); } } }} />
              <button type="button" onClick={() => fileRef.current?.click()} title="Attach an image" aria-label="Attach an image"
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-md border ${attachment ? "border-ember text-bone" : "border-line text-mute hover:text-bone"}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m21.4 11.1-8.5 8.5a5.5 5.5 0 0 1-7.8-7.8l8.5-8.5a3.7 3.7 0 0 1 5.2 5.2l-8.5 8.5a1.8 1.8 0 0 1-2.6-2.6l7.8-7.8" /></svg>
              </button>
              <button type="button" onClick={() => update(active.id, (c) => ({ ...c, web: !c.web }))} aria-pressed={Boolean(active.web)}
                title={active.web ? "Web search on. Your question is sent to a search engine." : "Turn on web search"}
                className={`h-11 shrink-0 rounded-md border px-3 text-xs ${active.web ? "border-ember bg-ember/10 text-bone" : "border-line text-mute hover:text-bone"}`}>Web</button>
            </>
          )}
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={1}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) { e.preventDefault(); send(); } }}
            placeholder={!auth.authenticated ? "Sign in to start chatting" : imageModel ? "Describe an image…" : "Ask anything…"}
            className="max-h-40 min-h-[2.75rem] flex-1 resize-none rounded-md border border-line bg-ink px-4 py-2.5 text-base outline-none focus:border-ember" />
          {busy
            ? <button type="button" onClick={() => abortRef.current?.abort()} className="btn btn-ghost h-11 text-sm">Stop</button>
            : <button className="btn btn-primary h-11 text-sm">{auth.authenticated ? "Send" : "Sign in"}</button>}
        </form>
      </section>
    </div>
  );
}
