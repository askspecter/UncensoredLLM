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
};

// Fallback when Privy isn't configured, so the site still renders in local dev.
const disabled: Auth = {
  enabled: false,
  ready: true,
  authenticated: false,
  label: null,
  login: () => console.warn("Set NEXT_PUBLIC_PRIVY_APP_ID to enable sign in."),
  logout: async () => {},
  getToken: async () => null,
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
