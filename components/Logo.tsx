import BrandMark from "./BrandMark";

export default function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-serif text-[1.5rem] leading-none tracking-wide text-ember sm:gap-2.5 sm:text-[1.7rem] ${className}`}>
      <BrandMark className="h-[18px] w-auto sm:h-[21px]" />
      <span>BEEPER</span>
    </span>
  );
}
