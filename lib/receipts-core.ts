// Proof of Bill, the parts that run anywhere (server and the /verify page). Signing lives in receipts.ts.
// A receipt commits to what a request cost without containing what was said: model, token counts,
// charge, time and the keccak256 of the generated text.
import { encodeAbiParameters, keccak256, recoverMessageAddress, stringToHex, type Hex } from "viem";

export type Receipt = {
  v: 1; id: string; model: string;
  promptTokens: number; completionTokens: number; costMicros: string;
  ts: number;       // unix seconds
  outputHash: Hex;  // keccak256 of the response text, as UTF-8
};
export type SignedReceipt = Receipt & { sig: Hex; signer: string };

export const hashOutput = (text: string) => keccak256(stringToHex(text));

export function leafOf(r: Receipt): Hex {
  return keccak256(encodeAbiParameters(
    [{ type: "uint256" }, { type: "string" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "bytes32" }],
    [BigInt(r.id), r.model, BigInt(r.promptTokens), BigInt(r.completionTokens), BigInt(r.costMicros), BigInt(r.ts), r.outputHash],
  ));
}

export async function receiptSigner(r: SignedReceipt) {
  return recoverMessageAddress({ message: { raw: leafOf(r) }, signature: r.sig });
}

export const encodeReceipt = (r: SignedReceipt) => btoa(JSON.stringify(r)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export function decodeReceipt(s: string): SignedReceipt | null {
  try { return JSON.parse(atob(s.trim().replace(/-/g, "+").replace(/_/g, "/"))); } catch { return null; }
}

// Sorted-pair Merkle tree (same rule as OpenZeppelin MerkleProof), so a proof is just a list of siblings.
const pair = (a: Hex, b: Hex) => keccak256(a < b ? `${a}${b.slice(2)}` as Hex : `${b}${a.slice(2)}` as Hex);

export function merkleRoot(leaves: Hex[]): Hex {
  if (!leaves.length) return `0x${"0".repeat(64)}`;
  let level = leaves;
  while (level.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(i + 1 < level.length ? pair(level[i], level[i + 1]) : level[i]);
    level = next;
  }
  return level[0];
}

export function merkleProof(leaves: Hex[], index: number): Hex[] {
  const proof: Hex[] = [];
  let level = leaves, i = index;
  while (level.length > 1) {
    const sib = i % 2 ? i - 1 : i + 1;
    if (sib < level.length) proof.push(level[sib]);
    const next: Hex[] = [];
    for (let j = 0; j < level.length; j += 2) next.push(j + 1 < level.length ? pair(level[j], level[j + 1]) : level[j]);
    level = next; i = Math.floor(i / 2);
  }
  return proof;
}

export const foldProof = (leaf: Hex, proof: Hex[]) => proof.reduce((acc, p) => pair(acc, p), leaf);

/** Calldata of the daily anchor transaction (sent from the server wallet to itself). */
export const anchorData = (day: string, root: Hex) => stringToHex(`beeper-bill:v1:${day}:${root}`);
