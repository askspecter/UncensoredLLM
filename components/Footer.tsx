import Link from "next/link";
import Logo from "./Logo";

export default function Footer() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-4 max-w-sm text-sm text-mute">
            Private, uncensored inference at a discount. No logs, no accounts, no lectures — just the model.
          </p>
        </div>
        <div className="text-sm">
          <p className="eyebrow mb-3">Product</p>
          <ul className="space-y-2 text-mute">
            <li><Link href="/#buy" className="hover:text-bone">Buy credits</Link></li>
            <li><Link href="/sell" className="hover:text-bone">Sell credits</Link></li>
            <li><Link href="/dashboard" className="hover:text-bone">Dashboard</Link></li>
            <li><Link href="/#api" className="hover:text-bone">API docs</Link></li>
          </ul>
        </div>
        <div className="text-sm">
          <p className="eyebrow mb-3">Legal</p>
          <ul className="space-y-2 text-mute">
            <li>Terms of Service</li>
            <li>Acceptable Use Policy</li>
            <li>Privacy Policy</li>
          </ul>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-5 pb-10 text-xs leading-relaxed text-mute/80">
        Credits are a prepaid grant of API access and are not redeemable for cash. Discounts depend on
        available marketplace liquidity. “Uncensored” means no additional filtering is applied by Beeper;
        users remain bound by applicable law and the Acceptable Use Policy. © {new Date().getFullYear()} Beeper.
      </div>
    </footer>
  );
}
