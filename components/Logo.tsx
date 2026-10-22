export default function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 2a10 10 0 0 1 0 20a6 10 0 0 0 0-20z" fill="#e5484d" />
      </svg>
      <span className="font-serif text-2xl leading-none tracking-tight">umbra</span>
    </span>
  );
}
