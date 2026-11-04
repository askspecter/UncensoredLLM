"use client";
import { useEffect, useMemo, useState } from "react";
import { createPublicClient, encodeFunctionData, erc20Abi, formatEther, formatUnits, http, keccak256, parseEventLogs, parseUnits, toHex } from "viem";
import { useAuth } from "./Providers";
import { FEATURED, MODELS } from "@/lib/data";
import { USDG, robinhood } from "@/lib/chain";
import { CURVE_LAUNCHER_ABI, LAUNCHER_ABI, MAX_CREATOR_TAX_BPS, PONS_ABI, PONS_FACTORY } from "@/lib/launch";

const chain = createPublicClient({ chain: robinhood, transport: http() });
const DEFAULT_MODEL = "venice/venice-uncensored-1-2";
// Pons launches deploy a token and its curve: ~3.8M gas. Some mobile wallets cap at 1.2M unless told.
const LAUNCH_GAS = BigInt(4_500_000);
// A Beeper curve launch (token, curve and router clones, optional creator buy) is ~1.5M gas.
const CURVE_LAUNCH_GAS = BigInt(2_500_000);
// Beeper curve virtual reserves, to preview the creator's first buy (contracts/src/launch/BeeperCurve.sol).
const VIRTUAL_QUOTE = BigInt(6_000e6), VIRTUAL_TOKENS = BigInt("1073000000000000000000000000");
const TOTAL_SUPPLY = BigInt("1000000000000000000000000000");
const clamp = (v: string, lo: number, hi: number, d: number) => { const n = Number(v); return Number.isFinite(n) && v.trim() !== "" ? Math.min(Math.max(n, lo), hi) : d; };

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

/**
 * Launches a coin paired with USDG whose fees pay its holders in AI credit for the chosen model. With kind "curve"
 * it uses Beeper's own curve: anti sniper protection and the creator's first buy happen in the launch transaction.
 */
export default function LaunchForm({ launcher, kind = "pons" }: { launcher: `0x${string}`; kind?: "pons" | "curve" }) {
  const auth = useAuth();
  const curveMode = kind === "curve";
  const [f, setF] = useState({ name: "", symbol: "", logo: "", description: "", twitter: "", telegram: "", website: "", model: DEFAULT_MODEL, tax: "1",
    protect: true, minutes: "5", sniper: "30", maxWallet: "1", creatorBuy: "" });
  const [fee, setFee] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [logoState, setLogoState] = useState<{ busy: boolean; error: string; preview: string }>({ busy: false, error: "", preview: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    if (curveMode) { setFee(BigInt(0)); return; }
    chain.readContract({ address: PONS_FACTORY, abi: PONS_ABI, functionName: "launchFee" }).then(setFee).catch(() => {});
  }, [curveMode]);

  const model = useMemo(() => MODELS.find((m) => m.id === f.model), [f.model]);
  const taxBps = Math.round(Math.min(Math.max(Number(f.tax) || 0, curveMode ? 0.5 : 0), MAX_CREATOR_TAX_BPS / 100) * 100);
  const protectFor = f.protect ? Math.round(clamp(f.minutes, 1, 60, 5) * 60) : 0;
  const sniperBps = f.protect ? Math.round(clamp(f.sniper, 0, 50, 30) * 100) : 0;
  const maxWalletBps = f.protect ? Math.round(clamp(f.maxWallet, 0.1, 100, 1) * 100) : 10_000;
  const creatorUnits = (() => { try { return f.creatorBuy.trim() ? parseUnits(f.creatorBuy.trim(), 6) : BigInt(0); } catch { return BigInt(0); } })();
  // First buy on a fresh curve: no sniper fee, base fee only.
  const creatorNet = creatorUnits - (creatorUnits * BigInt(taxBps)) / BigInt(10_000);
  const creatorTokens = creatorUnits > BigInt(0) ? (VIRTUAL_TOKENS * creatorNet) / (VIRTUAL_QUOTE + creatorNet) : BigInt(0);
  const creatorOverCap = f.protect && creatorTokens > (TOTAL_SUPPLY * BigInt(maxWalletBps)) / BigInt(10_000);
  const valid = f.name.trim().length >= 2 && /^[A-Za-z0-9]{2,10}$/.test(f.symbol.trim()) && Boolean(model) && (!f.logo || /^https:\/\//.test(f.logo)) && !logoState.busy
    && !(curveMode && creatorOverCap);

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
    if (curveMode) return launchCurve(auth.walletAddress as `0x${string}`);
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

  async function launchCurve(me: `0x${string}`) {
    try {
      if (creatorUnits > BigInt(0)) {
        const [bal, allowance] = await Promise.all([
          chain.readContract({ address: USDG, abi: erc20Abi, functionName: "balanceOf", args: [me] }),
          chain.readContract({ address: USDG, abi: erc20Abi, functionName: "allowance", args: [me, launcher] }),
        ]);
        if (bal < creatorUnits) throw new Error(`You need ${formatUnits(creatorUnits, 6)} USDG for your first buy.`);
        if (allowance < creatorUnits) {
          setNote("Allow the launcher to use the USDG for your first buy");
          const h = await auth.sendTx(me, { to: USDG, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [launcher, creatorUnits] }) });
          await chain.waitForTransactionReceipt({ hash: h });
        }
      }
      const data = encodeFunctionData({
        abi: CURVE_LAUNCHER_ABI, functionName: "launch",
        args: [{
          name: f.name.trim(), symbol: f.symbol.trim().toUpperCase(), logo: f.logo.trim(), description: f.description.trim(),
          twitter: f.twitter.trim().replace(/^@/, ""), telegram: f.telegram.trim(), website: f.website.trim(), model: f.model,
          feeBps: taxBps, protectFor, sniperStartBps: sniperBps, maxWalletBps,
          creatorBuy: creatorUnits, minCreatorTokens: (creatorTokens * BigInt(97)) / BigInt(100),
        }],
      });
      setNote("Confirm the launch in your wallet");
      const hash = await auth.sendTx(me, { to: launcher, data, gas: CURVE_LAUNCH_GAS });
      setNote("Launching on Robinhood Chain…");
      const receipt = await chain.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The launch failed on chain. Nothing was created.");
      const [ev] = parseEventLogs({ abi: CURVE_LAUNCHER_ABI, eventName: "Launched", logs: receipt.logs });
      await fetch("/api/launch/sync", { method: "POST" }).catch(() => {});
      window.location.href = `/launch/coin/${ev.args.token}`;
    } catch (e) {
      const msg = (e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message;
      setNote(/reject|denied/i.test(msg) ? "Cancelled." : /insufficient funds/i.test(msg) ? "Not enough ETH on Robinhood Chain for gas." : msg.slice(0, 180));
      setBusy(false);
    }
  }

  const protection = curveMode && (
    <div className="space-y-4 rounded-md border border-line bg-ink p-4">
      <label className="flex cursor-pointer items-center justify-between gap-3">
        <span><span className="block text-sm font-semibold text-bone">Anti sniper protection</span>
          <span className="mt-0.5 block text-[11px] text-mute">Right after launch, buys pay an extra fee that falls to zero, and no wallet can grab more than a set share. The extra fee goes to holders.</span></span>
        <input type="checkbox" checked={f.protect} onChange={(e) => setF({ ...f, protect: e.target.checked })} className="h-5 w-5 shrink-0 accent-[var(--color-ember)]" />
      </label>
      {f.protect && (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-xs text-mute">Protected for (minutes)<input className={`${input} mt-1.5`} inputMode="numeric" value={f.minutes} onChange={set("minutes")} /></label>
          <label className="block text-xs text-mute">Starting sniper fee (%)<input className={`${input} mt-1.5`} inputMode="decimal" value={f.sniper} onChange={set("sniper")} /></label>
          <label className="block text-xs text-mute">Max per wallet (% of supply)<input className={`${input} mt-1.5`} inputMode="decimal" value={f.maxWallet} onChange={set("maxWallet")} /></label>
        </div>
      )}
      <label className="block text-xs text-mute">Your first buy (USDG, optional)
        <input className={`${input} mt-1.5`} inputMode="decimal" value={f.creatorBuy} onChange={(e) => setF({ ...f, creatorBuy: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="0" />
        <span className={`mt-1.5 block text-[11px] ${creatorOverCap ? "text-danger" : ""}`}>
          {creatorOverCap ? "That buy is above the max per wallet. Lower it or raise the limit."
            : creatorTokens > BigInt(0) ? `Bought in the launch transaction itself, before any bot: about ${Number(formatUnits(creatorTokens, 18)).toLocaleString("en-US", { maximumFractionDigits: 0 })} coins, no sniper fee.`
            : "Bought in the launch transaction itself, before any bot can, with no sniper fee."}
        </span>
      </label>
    </div>
  );

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
        <label className="block text-xs text-mute">{curveMode ? `Trading fee (0.5 to ${MAX_CREATOR_TAX_BPS / 100}%)` : `Creator tax on trades (0 to ${MAX_CREATOR_TAX_BPS / 100}%)`}
          <input className={`${input} mt-1.5`} inputMode="decimal" value={f.tax} onChange={set("tax")} />
          <span className="mt-1.5 block text-[11px]">{curveMode
            ? "Charged on every buy and sell, on the curve and after graduation. All of it goes to holders (80%, as AI credit) and Beeper (20%). Most coins use 1%."
            : "Added to every trade on top of Pons\u2019 fee. All creator fees go to holders (80%) and Beeper (20%). Most coins use 0 to 2%."}</span>
        </label>
        {protection}
      </div>

      <div className="card min-w-0 p-5 sm:p-6 lg:sticky lg:top-24">
        <p className="eyebrow">Summary</p>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-mute">Coin</dt><dd className="truncate text-bone">{f.name || "…"} <span className="font-mono text-mute">${f.symbol.toUpperCase() || "…"}</span></dd></div>
          <div className="flex justify-between gap-3"><dt className="text-mute">Paired with</dt><dd className="text-right text-ember-soft">USDG · {model?.name ?? "…"}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-mute">{curveMode ? "Trading fee" : "Creator tax"}</dt><dd className="text-bone">{(taxBps / 100).toFixed(2)}%</dd></div>
          {curveMode && <div className="flex justify-between gap-3"><dt className="text-mute">Anti sniper</dt><dd className="text-right text-bone">{f.protect ? `${protectFor / 60} min · ${sniperBps / 100}% fee · ${maxWalletBps / 100}% max` : "Off"}</dd></div>}
          {curveMode && <div className="flex justify-between gap-3"><dt className="text-mute">Graduates to</dt><dd className="text-bone">Uniswap v4, locked</dd></div>}
          <div className="flex justify-between gap-3"><dt className="text-mute">Holders get</dt><dd className="text-bone">80% of {curveMode ? "all fees" : "creator fees"} as AI credit</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-mute">Launch fee</dt><dd className="text-bone">{fee === null ? "…" : fee === BigInt(0) ? "None" : `${formatEther(fee)} ETH`} + gas</dd></div>
        </dl>
        <button onClick={launch} disabled={busy || (auth.authenticated && Boolean(auth.walletAddress) && !valid)} className="btn btn-primary mt-5 w-full disabled:opacity-50">
          {!auth.authenticated ? "Sign in to launch" : !auth.walletAddress ? "Connect wallet" : busy ? "Launching…" : "Launch coin"}
        </button>
        {note && <p className="mt-3 text-sm text-mute">{note}</p>}
        <p className="mt-4 text-[11px] leading-relaxed text-mute">
          The model, the USDG pairing{curveMode ? ", the protection settings" : ""} and where fees go cannot be changed after launch by anyone, not even Beeper. Your wallet needs a little ETH on Robinhood Chain for {curveMode ? "gas" : "the launch fee and gas"}.
          Memecoins are volatile and can go to zero.
        </p>
      </div>
    </div>
  );
}
