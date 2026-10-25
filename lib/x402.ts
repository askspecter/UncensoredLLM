// x402 (https://x402.org, spec v2): pay per request in USDG on Robinhood Chain, no account or API key.
// Scheme "exact" with EIP-3009: the client signs a transferWithAuthorization for the quoted maximum,
// the server wallet submits it (paying gas), and the money goes straight from the payer to the treasury.
// The payment tops up a balance tied to the payer's address; the request is billed at its real cost
// and anything left over pays for that wallet's next requests.
import { getAddress, isAddress, parseSignature, parseAbi, verifyTypedData, type Hex } from "viem";
import { PAY_TO, USDG, robinhood } from "./chain";
import { sql } from "./db";
import { addToBalance } from "./billing";
import { findModel } from "./data";
import { chainClient, serverAccount, walletClient } from "./server-wallet";

export const X402_NETWORK = `eip155:${robinhood.id}`;
export const x402Enabled = Boolean(serverAccount && PAY_TO);
const DOMAIN = { name: "Global Dollar", version: "1", chainId: robinhood.id, verifyingContract: USDG } as const;
const TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
  ],
} as const;
const USDG_ABI = parseAbi([
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
  "function balanceOf(address) view returns (uint256)",
]);
const TIMEOUT = 300;
const DEFAULT_MAX_TOKENS = 2048;
const MIN_PRICE = BigInt(1000); // $0.001

/** Wallet-owned balance: one Beeper account per paying address. */
export const x402Account = (address: string) => `x402_${address.toLowerCase()}`;

/** Most a request can cost (USDG units = micro-dollars), plus 25% headroom; also caps max_tokens to what was quoted. */
export function quote(body: Record<string, unknown>): { amount: bigint; maxTokens: number } | null {
  const model = findModel(String(body.model ?? ""));
  if (!model || !Array.isArray(body.messages)) return null;
  const maxTokens = Math.min(Number(body.max_tokens ?? body.max_completion_tokens) || DEFAULT_MAX_TOKENS, 16_384);
  const promptTokens = Math.ceil(JSON.stringify(body.messages).length / 3);
  const cost = BigInt(Math.ceil((promptTokens * model.input + maxTokens * model.output) * 1.25));
  return { amount: cost > MIN_PRICE ? cost : MIN_PRICE, maxTokens };
}

type Requirement = { scheme: "exact"; network: string; amount: string; asset: string; payTo: string; maxTimeoutSeconds: number; extra: { name: string; version: string; assetTransferMethod: "eip3009" } };
type Payload = {
  x402Version: number; accepted: Requirement;
  payload: { signature: Hex; authorization: { from: string; to: string; value: string; validAfter: string; validBefore: string; nonce: Hex } };
};

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64");

function requirement(amount: bigint): Requirement {
  return {
    scheme: "exact", network: X402_NETWORK, amount: amount.toString(), asset: USDG, payTo: PAY_TO!,
    maxTimeoutSeconds: TIMEOUT, extra: { name: DOMAIN.name, version: DOMAIN.version, assetTransferMethod: "eip3009" },
  };
}

export function paymentRequired(req: Request, amount: bigint, error = "PAYMENT-SIGNATURE header is required") {
  const body = {
    x402Version: 2, error,
    resource: { url: req.url, description: "Beeper chat completion, billed at actual token cost; unused amount stays as credit for this wallet", mimeType: "application/json" },
    accepts: [requirement(amount)],
  };
  return Response.json(body, { status: 402, headers: { "PAYMENT-REQUIRED": b64(body) } });
}

export function decodePayment(header: string): Payload | null {
  try { return JSON.parse(Buffer.from(header, "base64").toString("utf8")); } catch { return null; }
}

/** Checks the signed authorization against the quote. Returns the payer, or an error for the 402 body. */
export async function verifyPayment(p: Payload, amount: bigint): Promise<{ payer: `0x${string}`; value: bigint } | { error: string }> {
  const a = p?.payload?.authorization;
  if (!a || p.accepted?.scheme !== "exact" || p.accepted?.network !== X402_NETWORK) return { error: "Unsupported scheme or network" };
  if (!isAddress(a.from) || !isAddress(a.to) || getAddress(a.to) !== getAddress(PAY_TO!)) return { error: "Payment must go to the Beeper treasury" };
  if (getAddress(p.accepted.asset) !== getAddress(USDG)) return { error: "Only USDG is accepted" };
  const value = BigInt(a.value), now = Math.floor(Date.now() / 1000);
  if (value < amount) return { error: `Authorized ${value} but this request needs ${amount}` };
  if (Number(a.validAfter) > now || Number(a.validBefore) < now + 30) return { error: "Authorization is not valid now" };
  const ok = await verifyTypedData({
    address: getAddress(a.from), domain: DOMAIN, types: TYPES, primaryType: "TransferWithAuthorization",
    message: { from: getAddress(a.from), to: getAddress(a.to), value, validAfter: BigInt(a.validAfter), validBefore: BigInt(a.validBefore), nonce: a.nonce },
    signature: p.payload.signature,
  }).catch(() => false);
  if (!ok) return { error: "Invalid signature" };
  return { payer: getAddress(a.from), value };
}

/**
 * Credits the payment to the payer's account. If that account already holds enough for `amount`
 * (left over from earlier payments), the authorization is recorded but not submitted on chain.
 */
export async function collect(p: Payload, payer: `0x${string}`, value: bigint, amount: bigint) {
  const a = p.payload.authorization;
  const account = x402Account(payer);
  await sql`INSERT INTO users (id) VALUES (${account}) ON CONFLICT (id) DO NOTHING`;
  const claimed = await sql`INSERT INTO x402_payments (nonce, payer, value_micros, status) VALUES (${a.nonce}, ${payer.toLowerCase()}, ${value.toString()}, 'pending') ON CONFLICT (nonce) DO NOTHING RETURNING nonce`;
  if (!claimed.length) return { error: "This payment was already used" } as const;

  const [{ balance_micros }] = await sql<{ balance_micros: string }[]>`SELECT balance_micros FROM users WHERE id = ${account}`;
  if (BigInt(balance_micros) >= amount) {
    await sql`UPDATE x402_payments SET status = 'prepaid' WHERE nonce = ${a.nonce}`;
    return { account, transaction: null };
  }

  const bal = await chainClient.readContract({ address: USDG, abi: USDG_ABI, functionName: "balanceOf", args: [payer] });
  if (bal < value) { await sql`DELETE FROM x402_payments WHERE nonce = ${a.nonce}`; return { error: "insufficient_funds" } as const; }
  const { v, r, s } = parseSignature(p.payload.signature);
  const args = [payer, getAddress(a.to), value, BigInt(a.validAfter), BigInt(a.validBefore), a.nonce, Number(v ?? 27), r, s] as const;
  try {
    await chainClient.simulateContract({ account: serverAccount!, address: USDG, abi: USDG_ABI, functionName: "transferWithAuthorization", args });
    const hash = await walletClient!.writeContract({ address: USDG, abi: USDG_ABI, functionName: "transferWithAuthorization", args });
    const receipt = await chainClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
    if (receipt.status !== "success") throw new Error("reverted");
    await sql.begin(async (tx) => {
      await tx`UPDATE x402_payments SET status = 'settled', tx_hash = ${hash} WHERE nonce = ${a.nonce}`;
      await addToBalance(tx, account, value, "topup", `x402:${hash}`);
    });
    return { account, transaction: hash };
  } catch (e) {
    console.error("[x402] settlement failed", e);
    await sql`DELETE FROM x402_payments WHERE nonce = ${a.nonce} AND tx_hash IS NULL`;
    return { error: "Settlement failed" } as const;
  }
}

export const paymentResponse = (o: { success: boolean; transaction: string; payer: string; errorReason?: string }) =>
  b64({ ...o, network: X402_NETWORK });
