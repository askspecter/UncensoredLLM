import { useId } from "react";

// Bracket logo, drawn inline (iOS Safari doesn't render the striped pattern reliably inside <img>).
const SHAPES = (
  <>
    <path d="M0.8 0H17.2a.8.8 0 0 1 .8.8v5a.8.8 0 0 1-.8.8H8V39h9.2a.8.8 0 0 1 .8.8v5a.8.8 0 0 1-.8.8H.8a.8.8 0 0 1-.8-.8V.8A.8.8 0 0 1 .8 0Z" />
    <path d="M70.2 0H53.8a.8.8 0 0 0-.8.8v5a.8.8 0 0 0 .8.8H63V39h-9.2a.8.8 0 0 0-.8.8v5a.8.8 0 0 0 .8.8h16.4a.8.8 0 0 0 .8-.8V.8a.8.8 0 0 0-.8-.8Z" />
    <rect x="15.5" y="15.6" width="17.6" height="17" rx=".8" />
    <rect x="38" y="15.6" width="17.6" height="17" rx=".8" />
  </>
);

export default function BrandMark({ className = "", glow = true }: { className?: string; glow?: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 71 46" className={className} aria-hidden style={glow ? { filter: "drop-shadow(0 0 4px rgba(168,251,40,.3))" } : undefined}>
      <defs><clipPath id={`bm${id}`}>{SHAPES}</clipPath></defs>
      <g fill="#a8fb28">{SHAPES}</g>
      <g clipPath={`url(#bm${id})`} fill="#7fbf16">
        {Array.from({ length: 36 }, (_, i) => <rect key={i} x="0" y={i * 1.3 + 0.95} width="71" height="0.35" />)}
      </g>
    </svg>
  );
}
