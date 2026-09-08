export function RewardBadge({ amount, currency, size = "md" }: { amount: string; currency: string; size?: "sm" | "md" | "lg" }) {
  const cls = size === "lg" ? "text-2xl px-4 py-2" : size === "sm" ? "text-xs px-2 py-1" : "text-sm px-3 py-1.5";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-accent-yellow/25 font-display font-bold text-navy ${cls}`}>
      <span aria-hidden>◈</span>
      {amount} {currency}
    </span>
  );
}
