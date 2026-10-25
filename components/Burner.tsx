"use client";
import { useCallback, useEffect, useState } from "react";
import Chat from "./Chat";
import PayUsdg, { type UsdgPay } from "./PayUsdg";
import { HOUSE_DISCOUNT, MAX_PURCHASE, MIN_PURCHASE, MODELS } from "@/lib/data";

// The burner key lives only in this tab: closing it forgets the account unless the key was saved.
const KEY = "beeper.burner.key";
const ORDER = "beeper.burner.order";
const PRESETS = [5, 10, 25, 50];
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

type Order = { id: string; credit: number; total: number; pay: UsdgPay };
const read = <T,>(k: string): T | null => { try { return JSON.parse(sessionStorage.getItem(k) ?? "null"); } catch { return null; } };
const write = (k: string, v: unknown) => { try { v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };

export default function Burner() {
  const [key, setKey] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [phase, setPhase] = useState<"loading" | "start" | "pay" | "chat">("loading");
  const [amount, setAmount] = useState(10);
  const [resume, setResume] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const headers = useCallback(async (): Promise<Record<string, string>> => (key ? { authorization: `Bearer ${key}` } : {}), [key]);

  const load = useCallback(async (k: string) => {
    const r = await fetch("/api/me", { headers: { authorization: `Bearer ${k}` } });
    if (!r.ok) return null;
    return (await r.json()).user.balance as number;
  }, []);

  // Pick up where this tab left off.
  useEffect(() => {
    const k = read<string>(KEY);
    if (!k) return setPhase("start");
    setKey(k);
    load(k).then((b) => {
      if (b === null) { write(KEY, null); setKey(null); return setPhase("start"); }
      setBalance(b);
      const o = read<Order>(ORDER);
      setOrder(o);
      setPhase(b > 0 ? "chat" : o ? "pay" : "start");
    });
  }, [load]);

  const onPaid = useCallback(async (k: string | null = key) => {
    write(ORDER, null); setOrder(null);
    if (k) setBalance(await load(k));
    setPhase("chat");
  }, [key, load]);

  async function fund() {
    setBusy(true); setError("");
    try {
      let k = key;
      if (!k) {
        const r = await fetch("/api/burner", { method: "POST" });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? "Could not create a burner");
        k = d.key as string;
        write(KEY, k); setKey(k);
      }
      const r = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${k}` },
        body: JSON.stringify({ credit: amount, payment: "usdg" }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Could not create the payment");
      if (d.status === "paid") return onPaid(k);
      const o: Order = { id: d.id, credit: d.credit, total: d.total, pay: d.pay };
      write(ORDER, o); setOrder(o); setPhase("pay");
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  }

  async function doResume(e: React.FormEvent) {
    e.preventDefault(); setError("");
    const k = resume.trim();
    const b = k.startsWith("sk-beeper-") ? await load(k) : null;
    if (b === null) return setError("That isn't a burner key.");
    write(KEY, k); setKey(k); setBalance(b); setPhase(b > 0 ? "chat" : "start");
  }

  function burn() {
    if (!confirm("Burn this session? Chats are wiped. Without the key, any balance left is gone for good.")) return;
    write(KEY, null); write(ORDER, null);
    try { sessionStorage.removeItem("beeper.burner.chats"); } catch { /* ignore */ }
    setKey(null); setOrder(null); setBalance(null); setPhase("start");
  }

  const copyKey = () => { if (key) { navigator.clipboard?.writeText(key); setCopied(true); setTimeout(() => setCopied(false), 1500); } };

  if (phase === "loading") return <div className="h-[calc(100dvh-4rem)]" />;

  if (phase === "chat" && key) {
    return (
      <>
        <div className="mx-auto flex h-12 max-w-6xl items-center gap-2 border-b border-line px-4 text-xs">
          <span className="rounded bg-ember px-2 py-1 font-serif text-sm leading-none text-ink">BURNER</span>
          <span className="truncate font-mono text-mute">{balance !== null ? `${usd(balance)} left` : ""}</span>
          <div className="ml-auto flex gap-2">
            <button onClick={copyKey} className="rounded border border-line px-2.5 py-1.5 text-mute hover:text-bone">{copied ? "Copied" : "Copy key"}</button>
            <button onClick={() => setPhase("start")} className="rounded border border-line px-2.5 py-1.5 text-mute hover:text-bone">Top up</button>
            <button onClick={burn} className="rounded border border-danger/50 px-2.5 py-1.5 text-danger hover:bg-danger/10">Burn</button>
          </div>
        </div>
        <Chat burnerKey={key} onBalance={setBalance} height="h-[calc(100dvh-7rem)]" />
      </>
    );
  }

  const price = Math.round(amount * (1 - HOUSE_DISCOUNT) * 100) / 100;
  const valid = amount >= MIN_PURCHASE && amount <= MAX_PURCHASE;

  return (
    <div className="mx-auto max-w-xl px-5 py-12 md:py-20">
      <p className="eyebrow">Burner mode</p>
      <h1 className="mt-3 text-4xl leading-[1.05] font-semibold tracking-[-0.035em] text-bone md:text-6xl">
        Your AI on a <span className="text-ember">burner.</span>
      </h1>
      <p className="mt-4 text-mute">No account. No email. No wallet connect. Send USDG, get {MODELS.length} models. Close the tab and it&apos;s gone.</p>

      {phase === "pay" && order && key ? (
        <div className="card mt-8 p-5">
          <div className="rounded-md border border-warn/40 bg-warn/10 p-4">
            <p className="text-sm text-bone">This key is your account. Save it to come back later.</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate font-mono text-xs text-bone">{key}</code>
              <button onClick={copyKey} className="shrink-0 rounded border border-line px-3 py-1 text-xs text-mute hover:text-bone">{copied ? "Copied" : "Copy"}</button>
            </div>
            <p className="mt-2 text-[11px] text-mute">We can&apos;t recover it. Lose the key and the balance is gone.</p>
          </div>
          <p className="mt-5 text-sm text-mute">{usd(order.credit)} of AI credit for {usd(order.total)}.</p>
          <PayUsdg orderId={order.id} pay={order.pay} onPaid={() => onPaid()} headers={headers} />
          <button onClick={() => { write(ORDER, null); setOrder(null); setPhase("start"); }} className="mt-4 text-xs text-mute underline">Change amount</button>
        </div>
      ) : (
        <div className="card mt-8 p-5">
          <p className="text-sm text-mute">{key ? "Add credit to this burner" : "How much AI do you want?"}</p>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {PRESETS.map((p) => (
              <button key={p} onClick={() => setAmount(p)}
                className={`rounded-md border py-2.5 font-mono text-sm ${amount === p ? "border-ember text-bone" : "border-line text-mute hover:text-bone"}`}>${p}</button>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 rounded-md border border-line bg-ink px-3 focus-within:border-ember">
            <span className="text-mute">$</span>
            <input type="number" inputMode="decimal" min={MIN_PURCHASE} max={MAX_PURCHASE} value={amount} onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full bg-transparent py-2.5 font-mono text-sm outline-none" />
            <span className="shrink-0 text-xs text-mute">credit</span>
          </label>
          <div className="mt-4 flex items-baseline justify-between text-sm">
            <span className="text-mute">You pay about</span>
            <span className="font-mono text-bone">{valid ? `${usd(price)} USDG` : `$${MIN_PURCHASE} to $${MAX_PURCHASE}`}</span>
          </div>
          <button onClick={fund} disabled={!valid || busy} className="btn btn-primary mt-4 w-full disabled:opacity-50">
            {busy ? "Creating…" : key ? "Top up with USDG" : "Create burner"}
          </button>
          {key && balance !== null && balance > 0 && <button onClick={() => setPhase("chat")} className="mt-3 w-full text-xs text-mute underline">Back to chat ({usd(balance)} left)</button>}
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        </div>
      )}

      {!key && phase === "start" && (
        <form onSubmit={doResume} className="mt-6 flex gap-2">
          <input value={resume} onChange={(e) => setResume(e.target.value)} placeholder="Have a burner key? sk-beeper-…"
            className="min-w-0 flex-1 rounded-md border border-line bg-ink px-3 py-2.5 font-mono text-xs outline-none focus:border-ember" />
          <button className="btn btn-ghost text-sm">Resume</button>
        </form>
      )}

      <ul className="mt-10 space-y-3 text-sm text-mute">
        <li><span className="text-bone">Nothing to sign up for.</span> The account is a random key. No email, no wallet, no name.</li>
        <li><span className="text-bone">Pay from anywhere.</span> Any wallet or exchange that sends USDG on Robinhood Chain.</li>
        <li><span className="text-bone">Gone when you close the tab.</span> Chats live in this tab only. Keep the key if you want the balance later.</li>
        <li><span className="text-bone">Works as an API key too.</span> Use it with any OpenAI-compatible SDK.</li>
      </ul>
    </div>
  );
}
