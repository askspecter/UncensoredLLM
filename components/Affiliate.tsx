"use client";
import { useState } from "react";
import { useAuth } from "./Providers";

import { AFFILIATE_COMMISSION as COMMISSION } from "@/lib/data";

export function Estimator() {
  const [refs, setRefs] = useState(20);
  const [spend, setSpend] = useState(150);
  const monthly = refs * spend * COMMISSION;
  return (
    <div className="card p-6">
      <p className="eyebrow">Earnings estimator</p>
      <div className="mt-6 space-y-6">
        <div>
          <div className="flex justify-between text-sm"><span className="text-mute">Referred buyers</span><span className="font-mono">{refs}</span></div>
          <input type="range" min={1} max={500} value={refs} onChange={(e) => setRefs(+e.target.value)} className="mt-2 w-full accent-[#e5484d]" />
        </div>
        <div>
          <div className="flex justify-between text-sm"><span className="text-mute">Avg. top-up / month</span><span className="font-mono">${spend}</span></div>
          <input type="range" min={5} max={2000} step={5} value={spend} onChange={(e) => setSpend(+e.target.value)} className="mt-2 w-full accent-[#e5484d]" />
        </div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4 rounded-xl bg-panel-2 p-4">
        <div><p className="text-xs text-mute">per month</p><p className="font-serif text-3xl">${monthly.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p></div>
        <div><p className="text-xs text-mute">per year</p><p className="font-serif text-3xl text-moss">${(monthly * 12).toLocaleString("en-US", { maximumFractionDigits: 0 })}</p></div>
      </div>
      <p className="mt-3 text-xs text-mute">Illustration only, not a guarantee. Refunds and disputes reduce commission.</p>
    </div>
  );
}

export function ReferralLink() {
  const { authenticated, label, login } = useAuth();
  const [copied, setCopied] = useState(false);
  if (!authenticated) {
    return <button onClick={login} className="btn btn-primary">Become an affiliate</button>;
  }
  const code = (label ?? "anon").replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase() || "anon";
  const link = `https://beeper.so/?ref=${code}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="rounded-full border border-line bg-ink px-4 py-2.5 font-mono text-sm text-ember-soft">{link}</code>
      <button className="btn btn-primary text-sm" onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); }}>{copied ? "Copied ✓" : "Copy link"}</button>
    </div>
  );
}
