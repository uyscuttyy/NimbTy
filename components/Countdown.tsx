"use client";
import { useEffect, useState } from "react";
import { formatCountdown, msLeft } from "@/lib/ui/bounty";

/** Display-only countdown. Server timestamps are the source of truth. */
export function Countdown({ targetIso, className = "" }: { targetIso: string; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = new Date(targetIso).getTime() - now;
  void msLeft;
  return (
    <span className={`font-mono tabular-nums ${className}`} suppressHydrationWarning>
      {formatCountdown(left)}
    </span>
  );
}
