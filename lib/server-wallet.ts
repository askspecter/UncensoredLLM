// Beeper's server wallet (SERVER_WALLET_KEY): settles x402 payments, signs bill receipts and anchors daily roots.
// It never holds customer funds; x402 payments go straight from the payer to the treasury.
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { robinhood } from "./chain";

const KEY = process.env.SERVER_WALLET_KEY;
export const serverAccount = KEY && /^0x[0-9a-fA-F]{64}$/.test(KEY) ? privateKeyToAccount(KEY as `0x${string}`) : null;

const transport = http(process.env.ROBINHOOD_RPC_URL || undefined);
export const chainClient = createPublicClient({ chain: robinhood, transport });
export const walletClient = serverAccount ? createWalletClient({ account: serverAccount, chain: robinhood, transport }) : null;
