"use client";
import { createContext, useContext, useMemo } from "react";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";

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
};

// Local testing without Privy: NEXT_PUBLIC_DEV_USER signs you in as that id (server needs DEV_AUTH_BYPASS=1).
const DEV_USER = process.env.NODE_ENV !== "production" ? process.env.NEXT_PUBLIC_DEV_USER : undefined;

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
};

const AuthContext = createContext<Auth>(disabled);
export const useAuth = () => useContext(AuthContext);

function shorten(s: string) {
  return s.length > 14 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}

function PrivyBridge({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
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
  }), [ready, authenticated, user, login, logout, getAccessToken]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  if (!APP_ID) return <AuthContext.Provider value={disabled}>{children}</AuthContext.Provider>;
  return (
    <PrivyProvider
      appId={APP_ID}
      config={{
        loginMethods: ["google", "email", "wallet"],
        appearance: {
          theme: "#13110f",
          accentColor: "#e5484d",
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
