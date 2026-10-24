"use client";
import { useState } from "react";

export default function CopyAddress({ value, className = "" }: { value: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button"
      onClick={() => { navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => {}); }}
      className={`btn btn-primary shrink-0 ${className}`}>
      {done ? "Copied ✓" : "Copy CA"}
    </button>
  );
}
