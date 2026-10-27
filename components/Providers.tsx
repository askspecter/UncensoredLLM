"use client";
import { createContext, useContext, useMemo } from "react";
import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { encodeFunctionData, erc20Abi } from "viem";
import { USDG, robinhood } from "@/lib/chain";

const APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

type Auth = {
  enabled: boolean;
  ready: boolean;
  authenticated: boolean;
  label: string | null;
  login: () => void;
  logout: () => Promise<void>;
  getToken: () => Promise<string | null>;
  /** Headers to authenticate a request to our own API. */
  authHeaders: () => Promise<Record<string, string>>;
  /** First connected EVM wallet, if any. */
  walletAddress: string | null;
  connectWallet: () => void;
  /** Signs a plain-text message with the connected wallet. */
  signMessage: (message: string) => Promise<{ address: string; signature: string }>;
  /** Sends `units` of USDG on Robinhood Chain from the connected wallet; resolves to the tx hash. */
  sendUsdg: (to: `0x${string}`, units: bigint) => Promise<string>;
  /** Addresses of every connected EVM wallet. */
  walletAddresses: string[];
  /** Sends a transaction on Robinhood Chain from `from` (a connected wallet); resolves to the tx hash. */
  sendTx: (from: string, tx: { to: `0x${string}`; data: `0x${string}` }) => Promise<`0x${string}`>;
};

// Local testing without Privy: NEXT_PUBLIC_DEV_USER signs you in as that id (server needs DEV_AUTH_BYPASS=1).
const DEV_USER = process.env.NODE_ENV !== "production" ? process.env.NEXT_PUBLIC_DEV_USER : undefined;
const DEV_WALLET = DEV_USER ? process.env.NEXT_PUBLIC_DEV_WALLET ?? null : null;

// Fallback when Privy isn't configured, so the site still renders in local dev.
const disabled: Auth = {
  enabled: Boolean(DEV_USER),
  ready: true,
  authenticated: Boolean(DEV_USER),
  label: DEV_USER ?? null,
  login: () => console.warn("Set NEXT_PUBLIC_PRIVY_APP_ID to enable sign in."),
  logout: async () => {},
  getToken: async () => null,
  authHeaders: async (): Promise<Record<string, string>> => (DEV_USER ? { "x-dev-user": DEV_USER } : {}),
  walletAddress: DEV_WALLET,
  connectWallet: () => {},
  sendUsdg: async () => { throw new Error("Wallet sign-in is not configured"); },
  walletAddresses: [],
  sendTx: async () => { throw new Error("Wallet sign-in is not configured"); },
  signMessage: async () => { throw new Error("Wallet sign-in is not configured"); },
};

const AuthContext = createContext<Auth>(disabled);
export const useAuth = () => useContext(AuthContext);

function shorten(s: string) {
  return s.length > 14 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}

function PrivyBridge({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user, login, logout, getAccessToken, connectWallet } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets[0];
  const value = useMemo<Auth>(() => ({
    enabled: true,
    ready,
    authenticated,
    label: user ? user.email?.address ?? user.google?.email ?? (user.wallet ? shorten(user.wallet.address) : "Account") : null,
    login: () => login(),
    logout,
    getToken: getAccessToken,
    authHeaders: async (): Promise<Record<string, string>> => {
      const token = await getAccessToken();
      return token ? { authorization: `Bearer ${token}` } : {};
    },
    walletAddress: wallet?.address ?? null,
    connectWallet: () => connectWallet(),
    signMessage: async (message) => {
      if (!wallet) throw new Error("Connect a wallet first");
      const provider = await wallet.getEthereumProvider();
      const signature = (await provider.request({ method: "personal_sign", params: [message, wallet.address] })) as string;
      return { address: wallet.address, signature };
    },
    sendUsdg: async (to, units) => {
      if (!wallet) throw new Error("Connect a wallet first");
      await wallet.switchChain(robinhood.id);
      const provider = await wallet.getEthereumProvider();
      const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, units] });
      return (await provider.request({ method: "eth_sendTransaction", params: [{ from: wallet.address, to: USDG, data }] })) as string;
    },
    walletAddresses: wallets.map((w) => w.address),
    sendTx: async (from, tx) => {
      const w = wallets.find((x) => x.address.toLowerCase() === from.toLowerCase());
      if (!w) throw new Error(`Connect ${from.slice(0, 6)}…${from.slice(-4)} first`);
      await w.switchChain(robinhood.id);
      const provider = await w.getEthereumProvider();
      return (await provider.request({ method: "eth_sendTransaction", params: [{ from: w.address, to: tx.to, data: tx.data }] })) as `0x${string}`;
    },
  }), [ready, authenticated, user, login, logout, getAccessToken, connectWallet, wallet, wallets]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  if (!APP_ID) return <AuthContext.Provider value={disabled}>{children}</AuthContext.Provider>;
  return (
    <PrivyProvider
      appId={APP_ID}
      config={{
        loginMethods: ["google", "email", "wallet"],
        supportedChains: [robinhood],
        defaultChain: robinhood,
        appearance: {
          theme: "#0d110c",
          accentColor: "#a8fb28",
          logo: "/beeper-logo.svg",
          landingHeader: "Sign in to Beeper",
          walletChainType: "ethereum-only",
        },
      }}
    >
      <PrivyBridge>{children}</PrivyBridge>
    </PrivyProvider>
  );
}
