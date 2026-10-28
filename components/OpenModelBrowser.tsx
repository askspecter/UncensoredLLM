"use client";
import { useState } from "react";
import OpenModelPicker from "./OpenModelPicker";

/** The long-tail search on /models: picking a model copies its id. */
export default function OpenModelBrowser() {
  const [copied, setCopied] = useState("");
  return (
    <div className="card overflow-hidden">
      <OpenModelPicker onClose={() => setCopied("")} onPick={(id) => { navigator.clipboard?.writeText(id); setCopied(id); }} />
      {copied && <p className="px-4 py-3 font-mono text-xs text-mute">Copied <span className="text-ember-soft">{copied}</span>. Use it as the model in chat or with your API key.</p>}
    </div>
  );
}
