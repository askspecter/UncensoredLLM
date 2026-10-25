// Copies BeeperHook's creation bytecode from the Foundry build into lib/, for deploying from the admin page.
// Run after `cd contracts && forge build`.
import { readFileSync, writeFileSync } from "node:fs";

const out = JSON.parse(readFileSync(new URL("../contracts/out/BeeperHook.sol/BeeperHook.json", import.meta.url), "utf8"));
writeFileSync(new URL("../lib/beeper-hook-bytecode.json", import.meta.url), JSON.stringify({ bytecode: out.bytecode.object }) + "\n");
console.log(`[hook] bytecode ${(out.bytecode.object.length - 2) / 2} bytes`);
