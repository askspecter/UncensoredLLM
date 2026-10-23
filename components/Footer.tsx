"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";

const COLS = [
  { title: "Product", links: [["/chat", "Chat"], ["/#buy", "Buy credits"], ["/sell", "Sell credits"], ["/models", "Models"], ["/dashboard", "Account"]] },
  { title: "Network", links: [["/analytics", "Analytics"], ["/leaderboard", "Leaderboard"], ["/affiliates", "Affiliates"], ["/status", "Status"]] },
  { title: "Developers", links: [["/docs", "Docs"], ["/docs#quickstart", "Quickstart"], ["/docs#mcp", "MCP server"], ["/docs#errors", "Errors"]] },
  { title: "Legal", links: [["/terms", "Terms"], ["/aup", "Acceptable use"], ["/privacy", "Privacy"]] },
];

export default function Footer() {
  // The chat is a full-height app; no footer there.
  if (usePathname() === "/chat") return null;
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:grid-cols-2 md:grid-cols-6">
        <div className="sm:col-span-2">
          <Logo />
          <p className="mt-4 max-w-xs text-sm text-mute">
            Private, uncensored inference. No logs, no lectures — just the model.
          </p>
          <div className="mt-5 flex gap-2 text-sm">
            <span className="rounded-full border border-line px-3 py-1 text-mute">X @beeper</span>
            <span className="rounded-full border border-line px-3 py-1 text-mute">Discord</span>
            <span className="rounded-full border border-line px-3 py-1 text-mute">Telegram</span>
          </div>
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
