// Proof of Bill, server side: the server wallet signs each receipt (see receipts-core.ts for the format).
import { serverAccount } from "./server-wallet";
import { leafOf, type Receipt, type SignedReceipt } from "./receipts-core";

export * from "./receipts-core";
export const receiptsEnabled = Boolean(serverAccount);
export const RECEIPT_SIGNER = serverAccount?.address ?? null;

export async function signReceipt(r: Receipt): Promise<SignedReceipt | null> {
  if (!serverAccount) return null;
  const sig = await serverAccount.signMessage({ message: { raw: leafOf(r) } });
  return { ...r, sig, signer: serverAccount.address };
}
