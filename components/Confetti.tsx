"use client";
import { useEffect, useState } from "react";

const PIECES = ["🎉", "◈", "✨", "💰", "🎊"];
const COLORS = ["#FFB731", "#FF6B6B", "#8B5CF6", "#34D399", "#0582CA"];

/** Lightweight CSS confetti (respects reduced motion via globals.css). */
export function Confetti({ burst = 40 }: { burst?: number }) {
  const [pieces] = useState(() =>
    Array.from({ length: burst }, (_, i) => ({
      left: (i * 97) % 100,
      delay: ((i * 37) % 800) / 1000,
      char: PIECES[i % PIECES.length],
      color: COLORS[i % COLORS.length],
      size: 14 + ((i * 13) % 18),
    })),
  );
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGone(true), 3500);
    return () => clearTimeout(t);
  }, []);
  if (gone) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            left: `${p.left}%`, color: p.color, fontSize: p.size,
            animationDelay: `${p.delay}s`,
          }}
          className="absolute -top-8 animate-[confetti-fall_2.5s_ease-in_forwards]"
        >
          {p.char}
        </span>
      ))}
      <style>{`@keyframes confetti-fall { to { transform: translateY(110vh) rotate(360deg); } }`}</style>
    </div>
  );
}
