export default function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-serif text-[1.35rem] leading-none tracking-wide text-ember sm:gap-2 sm:text-[1.65rem] ${className}`} style={{ textShadow: "0 0 12px rgba(182,255,59,.45)" }}>
      <span aria-hidden>[■■]</span>
      <span>BEEPER</span>
    </span>
  );
}
