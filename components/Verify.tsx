"use client";
import { useCallback, useEffect, useState } from "react";
import { createPublicClient, getAddress, http } from "viem";
import { explorerTx, robinhood } from "@/lib/chain";
import { anchorData, decodeReceipt, foldProof, hashOutput, leafOf, receiptSigner, type SignedReceipt } from "@/lib/receipts-core";

const client = createPublicClient({ chain: robinhood, transport: http(process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL || undefined) });
type Check = { label: string; ok: boolean | null; detail: string };

export default function Verify() {
  const [input, setInput] = useState("");
  const [text, setText] = useState("");
  const [receipt, setReceipt] = useState<SignedReceipt | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (raw: string, output: string) => {
    const r = decodeReceipt(raw);
    setReceipt(r);
    if (!r) return setChecks([{ label: "Receipt", ok: false, detail: "Not a Beeper receipt" }]);
    setBusy(true);
    const out: Check[] = [];
    try {
      const { signer } = await fetch("/api/receipts").then((x) => x.json());
      const recovered = await receiptSigner(r).catch(() => null);
      const sigOk = Boolean(recovered && signer && getAddress(recovered) === getAddress(signer));
      out.push({ label: "Signed by Beeper", ok: sigOk, detail: sigOk ? `Signature recovers to ${signer}` : "Signature doesn't match Beeper's signing wallet" });

      if (output.trim()) {
        const ok = hashOutput(output) === r.outputHash.toLowerCase();
        out.push({ label: "Matches the answer you got", ok, detail: ok ? "The text hashes to the receipt's output hash" : "This text is not what the receipt covers" });
      }

      const res = await fetch(`/api/receipts/${r.id}?h=${r.outputHash}`);
      const p = res.ok ? await res.json() : null;
      if (!p) out.push({ label: "On Beeper's books", ok: false, detail: "No such receipt" });
      else if (!p.anchored) out.push({ label: "Written on chain", ok: null, detail: `The ${p.day} batch is committed to Robinhood Chain after the day closes (00:20 UTC)` });
      else {
        const rootOk = foldProof(leafOf(r), p.proof) === p.root;
        out.push({ label: "In the day's Merkle root", ok: rootOk, detail: rootOk ? `${p.proof.length} proof steps up to ${p.root.slice(0, 18)}…` : "Proof doesn't lead to the published root" });
        const tx = await client.getTransaction({ hash: p.tx }).catch(() => null);
        const chainOk = Boolean(tx && signer && getAddress(tx.from) === getAddress(signer) && tx.input.toLowerCase() === anchorData(p.day, p.root).toLowerCase());
        out.push({ label: "Root written on Robinhood Chain", ok: chainOk, detail: chainOk ? `Block ${tx!.blockNumber}, sent by Beeper's signing wallet` : "The anchor transaction doesn't match" });
        if (chainOk) out.push({ label: "Transaction", ok: true, detail: p.tx });
      }
    } catch (e) {
      out.push({ label: "Check failed", ok: false, detail: (e as Error).message.slice(0, 120) });
    }
    setChecks(out);
    setBusy(false);
  }, []);

  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (h) { setInput(h); run(h, ""); }
  }, [run]);

  return (
    <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_1fr] [&>*]:min-w-0">
      <div className="card p-5">
        <label className="text-xs text-mute">Receipt</label>
        <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={4} placeholder="Paste a receipt (from the chat, the x-beeper-receipt header or the API response)"
          className="mt-1 w-full rounded-md border border-line bg-ink p-3 font-mono text-xs outline-none focus:border-ember" />
        <label className="mt-3 block text-xs text-mute">Answer text (optional)</label>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Paste the answer to prove this receipt is for it"
          className="mt-1 w-full rounded-md border border-line bg-ink p-3 text-sm outline-none focus:border-ember" />
        <button onClick={() => run(input, text)} disabled={!input.trim() || busy} className="btn btn-primary mt-3 w-full disabled:opacity-50">{busy ? "Checking…" : "Verify"}</button>
        <p className="mt-3 text-xs text-mute">Every check runs in your browser against Robinhood Chain. Beeper only supplies the proof.</p>
      </div>
      <div className="card p-5">
        {receipt ? (
          <dl className="grid grid-cols-2 gap-3 font-mono text-xs [&>div]:min-w-0">
            <div><dt className="text-mute">Model</dt><dd className="truncate text-bone">{receipt.model}</dd></div>
            <div><dt className="text-mute">Charged</dt><dd className="text-bone">${(Number(receipt.costMicros) / 1e6).toFixed(6)}</dd></div>
            <div><dt className="text-mute">Tokens in / out</dt><dd className="text-bone">{receipt.promptTokens.toLocaleString()} / {receipt.completionTokens.toLocaleString()}</dd></div>
            <div><dt className="text-mute">Time (UTC)</dt><dd className="text-bone">{new Date(receipt.ts * 1000).toISOString().slice(0, 19).replace("T", " ")}</dd></div>
            <div className="col-span-2"><dt className="text-mute">Output hash</dt><dd className="break-all text-bone">{receipt.outputHash}</dd></div>
          </dl>
        ) : <p className="text-sm text-mute">Open a receipt from the chat, or paste one.</p>}
        {checks.length > 0 && (
          <ul className="mt-5 space-y-3 border-t border-line pt-4 text-sm">
            {checks.map((c) => (
              <li key={c.label} className="flex gap-3">
                <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] ${c.ok === null ? "border border-warn text-warn" : c.ok ? "bg-ember text-ink" : "bg-danger text-ink"}`}>{c.ok === null ? "…" : c.ok ? "✓" : "✕"}</span>
                <div className="min-w-0">
                  <p className="text-bone">{c.label}</p>
                  {c.label === "Transaction"
                    ? <a href={explorerTx(c.detail)} target="_blank" rel="noreferrer" className="block truncate font-mono text-xs text-ember-soft underline">{c.detail}</a>
                    : <p className="break-words text-xs text-mute">{c.detail}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
