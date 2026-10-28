"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Logo from "./Logo";
import AuthButton from "./AuthButton";

export const NAV = [
  { href: "/chat", label: "Chat" },
  { href: "/burner", label: "Burner" },
  { href: "/trade", label: "Trade" },
  { href: "/#buy", label: "Buy" },
  { href: "/sell", label: "Sell" },
  { href: "/bcredit", label: "bCREDIT" },
  { href: "/models", label: "Models" },
  { href: "/analytics", label: "Analytics" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/affiliates", label: "Affiliates" },
  { href: "/docs", label: "Docs" },
];

export default function Nav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);

  const isActive = (href: string) => !href.startsWith("/#") && path.startsWith(href);

  return (
    <header className="sticky top-0 z-40 border-b border-line/60 bg-ink/80 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        <Link href="/" aria-label="Beeper home"><Logo /></Link>
        <div className="hidden items-center gap-1 text-sm lg:flex">
          {NAV.map((l) => (
            <Link key={l.href} href={l.href}
              className={`rounded-md px-3 py-1.5 ${isActive(l.href) ? "bg-panel-2 text-bone" : "text-mute hover:text-bone"}`}>
              {l.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="btn btn-ghost hidden text-sm sm:inline-flex">Account</Link>
          <AuthButton />
          <button onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}
            className="grid h-10 w-10 place-items-center rounded-lg border border-line lg:hidden">
            <svg width="16" height="16" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              {open ? <path d="M3 3l10 10M13 3L3 13" /> : <path d="M2 4h12M2 8h12M2 12h12" />}
            </svg>
          </button>
        </div>
      </nav>
      {open && (
        <div className="slidein border-t border-line bg-ink px-5 pb-6 pt-2 lg:hidden">
          {[...NAV, { href: "/dashboard", label: "Account" }].map((l) => (
            <Link key={l.href} href={l.href}
              className={`block border-b border-line py-3.5 text-lg ${isActive(l.href) ? "text-ember-soft" : ""}`}>{l.label}</Link>
          ))}
        </div>
      )}
    </header>
  );
}
