import Link from "next/link";
import type { ApiBounty } from "@/lib/ui/bounty";
import { formatShortLeft, msLeft, statusMeta } from "@/lib/ui/bounty";
import { RewardBadge } from "./RewardBadge";

const CARD_TINTS = ["bg-white", "bg-accent-yellow/10", "bg-accent-mint/10", "bg-accent-purple/10", "bg-accent-pink/15"];

export function BountyCard({ bounty, index = 0 }: { bounty: ApiBounty; index?: number }) {
  const meta = statusMeta(bounty.status);
  const tint = CARD_TINTS[index % CARD_TINTS.length];
  return (
    <Link
      href={`/n/${bounty.publicId}`}
      className={`block rounded-3xl border border-slate-200/80 ${tint} p-4 shadow-sm transition-transform hover:-translate-y-0.5 focus-visible:-translate-y-0.5`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-base font-semibold leading-snug text-navy">{bounty.title}</h3>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${meta.classes}`}>{meta.label}</span>
      </div>
      <p className="mt-1 line-clamp-2 text-sm text-slate2">{bounty.description}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <RewardBadge amount={bounty.rewardAmount} currency={bounty.currency} size="sm" />
        <span className="text-xs font-semibold text-slate2">
          {bounty.status === "OPEN" ? `⏳ ${formatShortLeft(msLeft(bounty.deadlineAt))}` : bounty.escrowLocked ? "🔒 locked" : ""}
        </span>
      </div>
    </Link>
  );
}
