export default function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg width="26" height="22" viewBox="0 0 26 22" aria-hidden>
        <rect x="1" y="1" width="24" height="20" rx="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <rect x="4.5" y="4.5" width="17" height="7" rx="1.5" fill="#e5484d" />
        <circle cx="7" cy="16.5" r="1.4" fill="currentColor" />
        <circle cx="11.5" cy="16.5" r="1.4" fill="currentColor" />
        <rect x="15.5" y="15.3" width="6" height="2.4" rx="1.2" fill="currentColor" />
      </svg>
      <span className="font-mono text-lg font-semibold lowercase leading-none tracking-tight">beeper</span>
    </span>
  );
}
