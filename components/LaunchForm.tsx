"use client";
import { useEffect, useMemo, useState } from "react";
import { createPublicClient, encodeFunctionData, formatEther, http, keccak256, parseEventLogs, toHex } from "viem";
import { useAuth } from "./Providers";
import { FEATURED, MODELS } from "@/lib/data";
import { USDG, robinhood } from "@/lib/chain";
import { LAUNCHER_ABI, MAX_CREATOR_TAX_BPS, PONS_ABI, PONS_FACTORY } from "@/lib/launch";

const chain = createPublicClient({ chain: robinhood, transport: http() });
const DEFAULT_MODEL = "venice/venice-uncensored-1-2";
// Pons launches deploy a token and its curve: ~3.8M gas. Some mobile wallets cap at 1.2M unless told.
const LAUNCH_GAS = BigInt(4_500_000);

const BY_PROVIDER = Object.entries(MODELS.slice(FEATURED.length).reduce<Record<string, typeof MODELS>>((acc, m) => {
  (acc[m.provider] ??= []).push(m);
  return acc;
}, {})).sort(([a], [b]) => a.localeCompare(b));

const LOGO_PX = 512;

/** Center-crops to a square and scales to 512px, so uploads stay small. Animated GIFs under 1 MB are kept as is. */
async function squareLogo(file: File): Promise<Blob> {
  if (file.type === "image/gif" && file.size <= 1_000_000) return file;
  const img = await createImageBitmap(file);
  const side = Math.min(img.width, img.height), out = Math.min(LOGO_PX, side);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = out;
  canvas.getContext("2d")!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, out, out);
  const as = (type: string, q?: number) => new Promise<Blob>((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error("Could not read that image"))), type, q));
  const png = await as("image/png");
  return png.size <= 900_000 ? png : as("image/jpeg", 0.9);
}

const input = "w-full rounded-md border border-line bg-ink px-3 py-2.5 text-sm text-bone outline-none focus:border-ember";

/** Launches a Pons coin paired with USDG, whose creator fees pay its holders in AI credit for the chosen model. */
export default function LaunchForm({ launcher }: { launcher: `0x${string}` }) {
  const auth = useAuth();
  const [f, setF] = useState({ name: "", symbol: "", logo: "", description: "", twitter: "", telegram: "", website: "", model: DEFAULT_MODEL, tax: "1" });
  const [fee, setFee] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [logoState, setLogoState] = useState<{ busy: boolean; error: string; preview: string }>({ busy: false, error: "", preview: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  useEffect(() => { chain.readContract({ address: PONS_FACTORY, abi: PONS_ABI, functionName: "launchFee" }).then(setFee).catch(() => {}); }, []);

  const model = useMemo(() => MODELS.find((m) => m.id === f.model), [f.model]);
  const taxBps = Math.round(Math.min(Math.max(Number(f.tax) || 0, 0), MAX_CREATOR_TAX_BPS / 100) * 100);
  const valid = f.name.trim().length >= 2 && /^[A-Za-z0-9]{2,10}$/.test(f.symbol.trim()) && Boolean(model) && (!f.logo || /^https:\/\//.test(f.logo)) && !logoState.busy;

  async function uploadLogo(file: File | undefined) {
    if (!file) return;
    if (!auth.authenticated) return auth.login();
    setLogoState({ busy: true, error: "", preview: URL.createObjectURL(file) });
    try {
      const body = new FormData();
      body.append("file", await squareLogo(file));
      const res = await fetch("/api/launch/logo", { method: "POST", headers: await auth.authHeaders(), body });
      const d = await res.json().catch(() => ({ error: "Upload failed, try again" }));
      if (!res.ok || !d.url) throw new Error(d.error ?? "Upload failed, try again");
      setF((cur) => ({ ...cur, logo: d.url }));
      setLogoState((cur) => ({ ...cur, busy: false }));
    } catch (e) {
      setF((cur) => ({ ...cur, logo: "" }));
      setLogoState({ busy: false, error: (e as Error).message, preview: "" });
    }
  }

  async function launch() {
    if (!auth.authenticated) return auth.login();
    if (!auth.walletAddress) return auth.connectWallet();
    if (!valid || fee === null) return;
    setBusy(true); setNote("Preparing the launch…");
    try {
      const economics = await chain.readContract({ address: PONS_FACTORY, abi: PONS_ABI, functionName: "previewLaunchEconomics", args: [BigInt(0), USDG] });
      const data = encodeFunctionData({
        abi: LAUNCHER_ABI, functionName: "launch",
        args: [{
          name: f.name.trim(), symbol: f.symbol.trim().toUpperCase(), logo: f.logo.trim(), description: f.description.trim(),
          socials: { twitter: f.twitter.trim().replace(/^@/, ""), telegram: f.telegram.trim(), discord: "", website: f.website.trim(), farcaster: "" },
          creatorTaxBps: taxBps, launchConfigId: BigInt(0), expectedEconomics: economics,
          salt: keccak256(toHex(`${auth.walletAddress}:${f.symbol}:${Date.now()}:${Math.random()}`)), model: f.model,
        }],
      });
      setNote("Confirm the launch in your wallet");
      const hash = await auth.sendTx(auth.walletAddress, { to: launcher, data, value: fee, gas: LAUNCH_GAS });
      setNote("Launching on Robinhood Chain…");
      const receipt = await chain.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The launch failed on chain. Nothing was created.");
      const [ev] = parseEventLogs({ abi: LAUNCHER_ABI, eventName: "Launched", logs: receipt.logs });
      await fetch("/api/launch/sync", { method: "POST" }).catch(() => {});
      window.location.href = `/launch/coin/${ev.args.token}`;
    } catch (e) {
      const msg = (e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message;
      setNote(/reject|denied/i.test(msg) ? "Cancelled." : /insufficient funds/i.test(msg) ? "Not enough ETH on Robinhood Chain for the launch fee plus gas." : msg.slice(0, 180));
      setBusy(false);
    }
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_360px]">
      <div className="card min-w-0 space-y-5 p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <label className="block text-xs text-mute">Name<input className={`${input} mt-1.5`} maxLength={40} value={f.name} onChange={set("name")} placeholder="Uncensored Dog" /></label>
          <label className="block text-xs text-mute">Ticker<input className={`${input} mt-1.5 font-mono uppercase`} maxLength={10} value={f.symbol} onChange={set("symbol")} placeholder="UDOG" /></label>
        </div>
        <label className="block text-xs text-mute">AI model the coin is paired with
          <select className={`${input} mt-1.5 font-mono`} value={f.model} onChange={set("model")}>
            <optgroup label="Featured">{FEATURED.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.provider}</option>)}</optgroup>
            {BY_PROVIDER.map(([p, list]) => <optgroup key={p} label={p}>{list.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</optgroup>)}
          </select>
          <span className="mt-1.5 block text-[11px]">Holders earn Beeper credit and the coin page opens a chat with {model?.name ?? "this model"}. Locked at launch.</span>
        </label>
        <div className="text-xs text-mute">Logo (optional)
          <label className="mt-1.5 flex cursor-pointer items-center gap-4 rounded-md border border-dashed border-line bg-ink p-3 hover:border-ember">
            {logoState.preview || f.logo
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={logoState.preview || f.logo} alt="" className="h-16 w-16 shrink-0 rounded-lg border border-line object-cover" />
              : <span className="grid h-16 w-16 shrink-0 place-items-center rounded-lg border border-line font-mono text-lg text-mute">+</span>}
            <span className="min-w-0 text-sm text-bone">
              {logoState.busy ? "Uploading…" : f.logo ? "Logo uploaded. Tap to change." : "Upload an image"}
              <span className="mt-0.5 block text-[11px] text-mute">PNG, JPG, WebP or GIF. Cropped to a square.</span>
            </span>
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" disabled={logoState.busy}
              onChange={(e) => { uploadLogo(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {logoState.error && <span className="mt-1.5 block text-[11px] text-danger">{logoState.error}</span>}
        </div>
        <label className="block text-xs text-mute">Description<textarea className={`${input} mt-1.5`} rows={3} maxLength={500} value={f.description} onChange={set("description")} placeholder="What is this coin about?" /></label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-xs text-mute">X handle<input className={`${input} mt-1.5`} value={f.twitter} onChange={set("twitter")} placeholder="@handle" /></label>
          <label className="block text-xs text-mute">Telegram<input className={`${input} mt-1.5`} value={f.telegram} onChange={set("telegram")} placeholder="t.me/…" /></label>
          <label className="block text-xs text-mute">Website<input className={`${input} mt-1.5`} value={f.website} onChange={set("website")} placeholder="https://…" /></label>
        </div>
        <label className="block text-xs text-mute">Creator tax on trades (0 to {MAX_CREATOR_TAX_BPS / 100}%)
          <input className={`${input} mt-1.5`} inputMode="decimal" value={f.tax} onChange={set("tax")} />
          <span className="mt-1.5 block text-[11px]">Added to every trade on top of Pons&apos; fee. All creator fees go to holders (80%) and Beeper (20%). Most coins use 0 to 2%.</span>
        </label>
      </div>

      <div className="card min-w-0 p-5 sm:p-6 lg:sticky lg:top-24">
        <p className="eyebrow">Summary</p>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-mute">Coin</dt><dd className="truncate text-bone">{f.name || "…"} <span className="font-mono text-mute">${f.symbol.toUpperCase() || "…"}</span></dd></div>
          <div className="flex justify-between gap-3"><dt className="text-mute">Paired with</dt><dd className="text-right text-ember-soft">USDG · {model?.name ?? "…"}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-mute">Creator tax</dt><dd className="text-bone">{(taxBps / 100).toFixed(2)}%</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-mute">Holders get</dt><dd className="text-bone">80% of creator fees as AI credit</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-mute">Launch fee</dt><dd className="text-bone">{fee === null ? "…" : `${formatEther(fee)} ETH`} + gas</dd></div>
        </dl>
        <button onClick={launch} disabled={busy || (auth.authenticated && Boolean(auth.walletAddress) && !valid)} className="btn btn-primary mt-5 w-full disabled:opacity-50">
          {!auth.authenticated ? "Sign in to launch" : !auth.walletAddress ? "Connect wallet" : busy ? "Launching…" : "Launch coin"}
        </button>
        {note && <p className="mt-3 text-sm text-mute">{note}</p>}
        <p className="mt-4 text-[11px] leading-relaxed text-mute">
          The model, the USDG pairing and where fees go cannot be changed after launch by anyone, not even Beeper. Your wallet needs a little ETH on Robinhood Chain for the launch fee and gas.
          Memecoins are volatile and can go to zero.
        </p>
      </div>
    </div>
  );
}
