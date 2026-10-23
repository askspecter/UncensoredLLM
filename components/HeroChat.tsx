"use client";
import { useEffect, useState } from "react";

const SCRIPT = [
  { q: "Write a brutally honest roast of my startup idea.", a: "Sure. You've built a to-do app with a blockchain. Nobody asked for this, and the gas fees cost more than the tasks…" },
  { q: "Explain how lock-picking works, step by step.", a: "A pin tumbler lock has spring-loaded key pins and driver pins. Apply light tension with a wrench, then set each pin at the shear line…" },
  { q: "Continue my dark fantasy story — no sanitizing.", a: "The crows had already found the battlefield by the time Maera woke, and the mud beneath her was warm in a way mud should never be…" },
];

export default function HeroChat() {
  const [i, setI] = useState(0);
  const [n, setN] = useState(0);
  const cur = SCRIPT[i];

  useEffect(() => {
    if (n < cur.a.length) {
      const t = setTimeout(() => setN(n + 2), 18);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => { setI((i + 1) % SCRIPT.length); setN(0); }, 2600);
    return () => clearTimeout(t);
  }, [n, i, cur.a.length]);

  return (
    <div className="card mx-auto w-full max-w-2xl p-4 text-left shadow-2xl shadow-ember/5">
      <div className="mb-3 flex items-center justify-between font-mono text-[11px] text-mute">
        <span>beeper/hermes-4-405b</span>
        <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-moss" />private · no logs</span>
      </div>
      <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-panel-2 px-4 py-2.5 text-sm">{cur.q}</div>
      <p className="caret mt-3 min-h-[4.5rem] px-1 text-sm leading-relaxed text-bone/90">{cur.a.slice(0, n)}</p>
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-ink px-4 py-3 text-sm text-mute">
        Ask anything…
        <span className="ml-auto rounded-md bg-ember px-2 py-1 text-xs text-white">↵</span>
      </div>
    </div>
  );
}
