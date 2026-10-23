"use client";
import { useEffect } from "react";
import { useAuth } from "./Providers";

const KEY = "beeper.ref";
const TTL = 365 * 24 * 3600 * 1000;

/** Remembers ?ref=code for a year and links it to the account after sign-in. */
export default function RefCapture() {
  const auth = useAuth();

  useEffect(() => {
    try {
      const code = new URLSearchParams(window.location.search).get("ref");
      if (code && /^[a-z0-9]{3,20}$/i.test(code)) localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }));
    } catch { /* storage unavailable */ }
  }, []);

  useEffect(() => {
    if (!auth.authenticated) return;
    let saved: { code: string; at: number; sent?: boolean } | null = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) ?? "null"); } catch { return; }
    if (!saved || saved.sent || Date.now() - saved.at > TTL) return;
    (async () => {
      const res = await fetch("/api/affiliate/attach", {
        method: "POST",
        headers: { "content-type": "application/json", ...(await auth.authHeaders()) },
        body: JSON.stringify({ code: saved!.code }),
      }).catch(() => null);
      if (res?.ok) try { localStorage.setItem(KEY, JSON.stringify({ ...saved, sent: true })); } catch { /* ignore */ }
    })();
  }, [auth]);

  return null;
}
