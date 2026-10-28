"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./Providers";
import TradeSwap from "./TradeSwap";
import HookScan from "./HookScan";

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function TradeTerminal() {
  const auth = useAuth();
  const [symbol, setSymbol] = useState("NVDA");
  const [me, setMe] = useState<{ total: number; trades: number; balance: number } | null>(null);

  const loadMe = useCallback(async () => {
    if (!auth.authenticated) return setMe(null);
    const res = await fetch("/api/trade/me", { headers: await auth.authHeaders() });
    if (res.ok) setMe(await res.json());
  }, [auth]);

  useEffect(() => {
    loadMe();
    window.addEventListener("beeper:cashback", loadMe);
    return () => window.removeEventListener("beeper:cashback", loadMe);
  }, [loadMe]);

  return (
    <>
      {me && (
        <div className="mt-8 flex flex-wrap gap-x-8 gap-y-2 rounded-md border border-line bg-ink px-4 py-3 text-sm">
          <span className="text-mute">Earned from trading <span className="text-ember">{usd(me.total)}</span></span>
          <span className="text-mute">Trades <span className="text-bone">{me.trades}</span></span>
          <span className="text-mute">AI balance <span className="text-bone">{usd(me.balance)}</span></span>
          <a href="/chat" className="ml-auto text-ember-soft underline">Spend it in chat</a>
        </div>
      )}
      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[420px_1fr]">
        <TradeSwap symbol={symbol} onSymbol={setSymbol} />
        <HookScan symbol={symbol} />
      </div>
    </>
  );
}
