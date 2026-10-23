/* eslint-disable @next/next/no-img-element */
export default function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-serif text-[1.45rem] leading-none tracking-wide text-ember sm:gap-2.5 sm:text-[1.7rem] ${className}`}
      style={{ textShadow: "0 0 12px rgba(168,251,40,.45)" }}>
      <img src="/brand/mark.svg" alt="" aria-hidden width={34} height={22} className="h-[18px] w-auto sm:h-[22px]" style={{ filter: "drop-shadow(0 0 6px rgba(168,251,40,.45))" }} />
      <span>BEEPER</span>
    </span>
  );
}
