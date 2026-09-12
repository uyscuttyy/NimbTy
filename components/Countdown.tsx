"use client";
import { useEffect, useState } from "react";
import { formatCountdown, msLeft } from "@/lib/ui/bounty";

/** Display-only countdown. Server timestamps are the source of truth. */
export function Countdown({ targetIso, className = "" }: { targetIso: string; className?: string }) {
  // Null until mounted so the first client render matches SSR exactly.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = new Date(targetIso).getTime() - (now ?? new Date(targetIso).getTime());
  void msLeft;
  return (
    <span className={`font-mono tabular-nums ${className}`} suppressHydrationWarning>
      {formatCountdown(left)}
    </span>
  );
}
