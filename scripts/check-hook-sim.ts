// Checks lib/hook-sim.ts against swaps executed on a Robinhood Chain fork (contracts/test/fixtures/replay.txt,
// written by `forge test --match-test test_replayLog -vv`). Every number must match exactly.
import { readFileSync } from "node:fs";
// @ts-expect-error Node runs this file directly (--experimental-strip-types), which needs the .ts extension
import { simulate, type Swap } from "../lib/hook-sim.ts";

const lines = readFileSync(new URL("../contracts/test/fixtures/replay.txt", import.meta.url), "utf8").trim().split("\n");
const [, p0, liq] = lines[0].split("|");
const swaps: Swap[] = [], expected: string[][] = [];
for (let i = 1; i < lines.length; i += 2) {
  const [, , at, side, amount] = lines[i].split("|");
  swaps.push({ at: Number(at), buy: side === "buy", amount: BigInt(amount) });
  expected.push(lines[i + 1].split("|").slice(1));
}
const cfg = { baseFeeBps: 100, launchFeeBps: 500, launchWindow: 3600, maxSwapUsdg: BigInt(500e6), lpFeePips: 3000 };
const got = simulate(cfg, BigInt(p0), BigInt(liq), swaps);
let bad = 0;
got.forEach((r, i) => {
  const want = expected[i];
  const have = r.refused ? ["refused"] : [r.beep, r.usdg, r.burnedBeep, r.toBcredit].map(String);
  const ok = want.join("|") === have.join("|");
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} swap ${i} ${r.buy ? "buy " : "sell"} ${have.join(" ")}${ok ? "" : `  want ${want.join(" ")}`}`);
});
console.log(bad ? `${bad} mismatches` : `all ${got.length} swaps match the fork`);
process.exit(bad ? 1 : 0);
