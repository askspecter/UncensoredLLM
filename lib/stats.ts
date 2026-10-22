// Deterministic demo metrics (seeded) so server and client render the same numbers.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export type Day = { date: string; values: Record<string, number> };

export function series(keys: string[], days: number, base: number, seed: number): Day[] {
  const r = rng(seed);
  const end = Date.UTC(2026, 9, 22);
  return Array.from({ length: days }, (_, i) => {
    const t = end - (days - 1 - i) * 86_400_000;
    const growth = 0.55 + (i / days) * 0.6;
    const values = Object.fromEntries(keys.map((k, j) => [k, Math.round(base * growth * (0.6 + r() * 0.8) / (j + 1))]));
    return { date: new Date(t).toISOString().slice(5, 10), values };
  });
}

export const BANDS = [
  { band: "40–50%", liquidity: 108_700, orders: 340 },
  { band: "30–40%", liquidity: 52_300, orders: 412 },
  { band: "20–30%", liquidity: 31_900, orders: 318 },
  { band: "10–20%", liquidity: 15_400, orders: 211 },
  { band: "0–10%", liquidity: 6_530, orders: 89 },
];

const HANDLES = ["ghost_7f1", "0xnoir", "anon_ba2", "shade.eth", "void_runner", "nullbyte", "wisp_44", "degen_420", "midnight_c", "pager_dad", "lowkey_ai", "rook_99", "hex.sol", "silentk", "x0r_cat"];

export function leaderboard(kind: "buyers" | "sellers" | "affiliates", seed: number) {
  const r = rng(seed);
  const scale = kind === "buyers" ? 48_000 : kind === "sellers" ? 62_000 : 3_400;
  return HANDLES.map((h, i) => ({
    handle: h,
    volume: Math.round(scale / (1 + i * 0.45) * (0.9 + r() * 0.2)),
    count: Math.round((kind === "affiliates" ? 60 : 300) / (1 + i * 0.3) * (0.8 + r() * 0.4)),
    saved: 0.32 + r() * 0.16,
  })).sort((a, b) => b.volume - a.volume);
}
