"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./Providers";

type Status = { configured: boolean; connected: boolean; since: string | null; models: number };

const NOTES: Record<string, string> = {
  connected: "Featherless connected. Open models now run on your Featherless plan.",
  denied: "You declined on Featherless. Nothing was connected.",
  error: "Could not connect Featherless. Please try again.",
};

/** Links the user's own Featherless account over OAuth, so the open-model long tail runs on their plan. */
export default function FeatherlessConnect() {
  const auth = useAuth();
  const [s, setS] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    if (!auth.authenticated) return;
    const res = await fetch("/api/featherless/status", { headers: await auth.authHeaders() });
    if (res.ok) setS(await res.json());
  }, [auth]);

  useEffect(() => {
    load();
    const r = new URL(window.location.href).searchParams.get("featherless");
    if (r && NOTES[r]) setNote(NOTES[r]);
  }, [load]);

  if (!s?.configured) return null;

  async function connect() {
    setBusy(true); setNote("");
    const res = await fetch("/api/featherless/connect", { method: "POST", headers: await auth.authHeaders() });
    const data = await res.json().catch(() => ({}));
    if (data.url) window.location.href = data.url;
    else { setNote(data.error ?? "Could not start the connection."); setBusy(false); }
  }

  async function disconnect() {
    setBusy(true);
    await fetch("/api/featherless/status", { method: "DELETE", headers: await auth.authHeaders() });
    await load(); setBusy(false); setNote("Featherless disconnected.");
  }

  return (
    <div className="card mt-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="font-semibold text-bone">Featherless {s.connected && <span className="ml-2 rounded border border-moss/50 px-1.5 py-0.5 font-mono text-[10px] text-moss">connected</span>}</p>
          <p className="mt-2 text-sm text-mute">
            Run {s.models.toLocaleString("en-US")} open Hugging Face models (ids starting with <span className="font-mono">hf/</span>) on your own
            Featherless plan, in Beeper chat and through your Beeper API key. Those requests are billed by Featherless, not from your Beeper balance.
            Featherless never logs prompts.
          </p>
        </div>
        {s.connected
          ? <button onClick={disconnect} disabled={busy} className="btn btn-ghost text-sm disabled:opacity-50">Disconnect</button>
          : <button onClick={connect} disabled={busy} className="btn btn-primary text-sm disabled:opacity-50">{busy ? "Opening Featherless…" : "Connect Featherless"}</button>}
      </div>
      {note && <p className="mt-3 text-sm text-mute">{note}</p>}
    </div>
  );
}
