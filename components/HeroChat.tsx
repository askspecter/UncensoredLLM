"use client";
import { useEffect, useState } from "react";

const SCRIPT = [
  { model: "DOLPHIN-24B", q: "roast my startup idea", a: "A TODO APP ON A BLOCKCHAIN. NOBODY ASKED. THE GAS FEES COST MORE THAN THE TASKS." },
  { model: "HERMES-4-405B", q: "how do pin tumbler locks work", a: "SPRING PINS STACK IN THE PLUG. LIGHT TENSION + SET EACH PIN AT THE SHEAR LINE AND IT TURNS." },
  { model: "EURYALE-70B", q: "continue my dark fantasy story", a: "THE CROWS FOUND THE BATTLEFIELD FIRST. MAERA WOKE IN MUD THAT WAS WARM IN A WAY MUD SHOULD NEVER BE." },
];

/** The hero device: a pager whose LCD types out an unfiltered answer. */
export default function HeroChat() {
  const [i, setI] = useState(0);
  const [n, setN] = useState(0);
  const cur = SCRIPT[i];

  useEffect(() => {
    if (n < cur.a.length) {
      const t = setTimeout(() => setN(n + 1), 28);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => { setI((i + 1) % SCRIPT.length); setN(0); }, 2800);
    return () => clearTimeout(t);
  }, [n, i, cur.a.length]);

  return (
    <div className="mx-auto w-full max-w-xl rounded-[34px] border-[3px] border-[#2f352d] bg-[#1b1e1a] p-5 shadow-[0_40px_80px_rgba(0,0,0,.6),inset_0_2px_0_#3a4137] sm:p-6">
      <div className="lcd min-h-[13.5rem] p-4 text-left font-serif text-[1.55rem] leading-[1.15] sm:p-5">
        <p className="text-lg opacity-70">MSG 0{i + 1} · {cur.model} · PRIVATE</p>
        <p>&gt; {cur.q}</p>
        <p className="caret-lcd">{cur.a.slice(0, n)}<span className="animate-pulse">█</span></p>
      </div>
      <div className="mt-5 flex justify-center gap-3" aria-hidden>
        {[0, 1, 2].map((k) => <span key={k} className="h-6 w-14 rounded-full border-2 border-[#3b4239] bg-[#2c312a]" />)}
      </div>
    </div>
  );
}
