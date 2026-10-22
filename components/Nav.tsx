import Link from "next/link";
import Logo from "./Logo";
import AuthButton from "./AuthButton";

const links = [
  { href: "/#buy", label: "Buy credits" },
  { href: "/sell", label: "Sell credits" },
  { href: "/#models", label: "Models" },
  { href: "/#privacy", label: "Privacy" },
  { href: "/#api", label: "API" },
  { href: "/#faq", label: "FAQ" },
];

export default function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/60 bg-ink/75 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/"><Logo /></Link>
        <div className="hidden gap-7 text-sm text-mute md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-bone">{l.label}</Link>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Link href="/#buy" className="btn btn-ghost hidden text-sm sm:inline-flex">Get a key</Link>
          <AuthButton />
        </div>
      </nav>
    </header>
  );
}
