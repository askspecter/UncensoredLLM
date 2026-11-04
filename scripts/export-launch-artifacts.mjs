// Copies the launchpad's creation bytecode from the Foundry build into lib/, for deploying from the admin page.
// Run after `cd contracts && forge build`.
import { readFileSync, writeFileSync } from "node:fs";

const read = (name) => JSON.parse(readFileSync(new URL(`../contracts/out/${name}.sol/${name}.json`, import.meta.url), "utf8")).bytecode.object;
const out = {
  router: read("CreditRouter"), launcher: read("BeeperLauncher"),
  curve: read("BeeperCurve"), curveLauncher: read("BeeperCurveLauncher"), guard: read("GraduationGuard"),
};
writeFileSync(new URL("../lib/launch-bytecode.json", import.meta.url), JSON.stringify(out) + "\n");
for (const [k, v] of Object.entries(out)) console.log(`[launch] ${k} ${(v.length - 2) / 2} bytes`);
