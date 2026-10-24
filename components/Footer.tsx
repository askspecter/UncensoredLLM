"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";
import { BEEP } from "@/lib/token";

const COLS = [
  { title: "Product", links: [["/chat", "Chat"], ["/#buy", "Buy credits"], ["/sell", "Sell credits"], ["/bcredit", "bCREDIT"], ["/models", "Models"], ["/dashboard", "Account"]] },
  { title: "Network", links: [["/analytics", "Analytics"], ["/leaderboard", "Leaderboard"], ["/affiliates", "Affiliates"], ["/status", "Status"]] },
  { title: "Developers", links: [["/docs", "Docs"], ["/docs#quickstart", "Quickstart"], ["/docs#mcp", "MCP server"], ["/docs#errors", "Errors"]] },
  { title: "Legal", links: [["/terms", "Terms"], ["/aup", "Acceptable use"], ["/privacy", "Privacy"]] },
];

export default function Footer() {
  // The chat is a full-height app; no footer there.
  if (usePathname() === "/chat") return null;
  return (
    <footer className="mt-16 border-t border-line md:mt-24">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-8 px-5 py-10 md:py-14 md:grid-cols-6">
        <div className="col-span-2">
          <Logo />
          <p className="mt-4 max-w-xs text-sm text-mute">
            Private, uncensored inference. No logs, no lectures. Just the model.
          </p>
          <a href="https://x.com/usebeeper" target="_blank" rel="noreferrer"
            className="mt-5 inline-flex items-center gap-2 rounded border border-line px-3 py-2 text-sm hover:border-ember hover:text-ember">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
            @usebeeper
          </a>
          <p className="mt-4 text-xs text-mute">Official $BEEP CA</p>
          <a href={BEEP.explorer} target="_blank" rel="noreferrer" className="mt-1 block break-all font-mono text-xs text-bone hover:text-ember">{BEEP.address}</a>
        </div>
        {COLS.map((c) => (
          <div key={c.title} className="text-sm">
            <p className="eyebrow mb-3">{c.title}</p>
            <ul className="space-y-2 text-mute">
              {c.links.map(([href, label]) => (
                <li key={href}><Link href={href} className="hover:text-bone">{label}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto max-w-6xl px-5 pb-10 text-xs leading-relaxed text-mute/80">
        Credits are a prepaid grant of API access and are not redeemable for cash. Discounts beyond 10% depend on order-book liquidity. “Uncensored” means no additional filtering is applied by Beeper;
        users remain bound by applicable law and the Acceptable Use Policy. © {new Date().getFullYear()} Beeper.
      </div>
    </footer>
  );
}
