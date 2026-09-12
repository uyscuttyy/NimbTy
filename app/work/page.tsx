"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BountyCard } from "@/components/BountyCard";
import { EmptyState } from "@/components/EmptyState";
import { Countdown } from "@/components/Countdown";
import { api, type ApiBounty } from "@/lib/ui/bounty";

interface WorkItem {
  claimId: string;
  status: string;
  claimedAt: string;
  bounty: ApiBounty;
  latestSubmission: { id: string; status: string; reviewNote: string | null; reviewDeadlineAt: string } | null;
}

const GROUPS: [string, (w: WorkItem) => boolean][] = [
  ["Active", (w) => w.bounty.status === "CLAIMED"],
  ["Submitted", (w) => w.bounty.status === "SUBMITTED"],
  ["Revision", (w) => w.bounty.status === "REVISION_REQUESTED"],
  ["Completed", (w) => ["PAID", "WORKER_PAID", "CREATOR_REFUNDED", "EXPIRED_REFUNDED", "DISPUTED"].includes(w.bounty.status)],
];

export default function WorkPage() {
  const [work, setWork] = useState<WorkItem[] | null>(null);
  const [tab, setTab] = useState("Active");
  // "You got paid" banner: bounties settled since this device last acknowledged.
  const [seenAt, setSeenAt] = useState<number>(() => {
    try { return Number(localStorage.getItem("nimbTy_work_seen_at")) || 0; } catch { return 0; }
  });

  useEffect(() => {
    api<{ ok: boolean; work?: WorkItem[] }>("/api/work")
      .then((d) => setWork(d.work ?? []))
      .catch(() => setWork([]));
  }, []);

  const freshPaid = (work ?? []).filter(
    (w) => ["PAID", "WORKER_PAID"].includes(w.bounty.status)
      && w.bounty.settledAt && new Date(w.bounty.settledAt).getTime() > seenAt,
  );
  const dismissPaid = () => {
    const now = Date.now();
    setSeenAt(now);
    try { localStorage.setItem("nimbTy_work_seen_at", String(now)); } catch { /* private mode */ }
  };

  if (work !== null && work.length === 0) {
    return (
      <div className="pt-4">
        <h1 className="font-display text-2xl font-bold text-navy">My work</h1>
        <div className="mt-3"><EmptyState title="Nothing here yet." hint="Go find something worth doing." actionHref="/explore" actionLabel="Explore bounties" /></div>
      </div>
    );
  }

  const items = (work ?? []).filter((w) => GROUPS.find(([g]) => g === tab)?.[1](w) ?? false);

  return (
    <div className="space-y-4 pt-4">
      <h1 className="font-display text-2xl font-bold text-navy">My work</h1>
      {freshPaid.length > 0 && (
        <div role="status" className="space-y-2 rounded-3xl bg-accent-mint/15 p-4">
          {freshPaid.map((w) => (
            <p key={w.claimId} className="text-sm font-bold text-emerald-800">
              You got paid {w.bounty.rewardAmount} {w.bounty.currency} for{" "}
              <Link href={`/n/${w.bounty.publicId}`} className="underline">{w.bounty.title}</Link>
            </p>
          ))}
          <button onClick={dismissPaid} className="min-h-touch rounded-2xl bg-navy px-4 py-2 text-xs font-bold text-white">
            Got it
          </button>
        </div>
      )}
      <div className="flex gap-1" role="tablist" aria-label="Work filter">
        {GROUPS.map(([g]) => (
          <button key={g} role="tab" aria-selected={tab === g} onClick={() => setTab(g)}
            className={`min-h-touch rounded-2xl px-3 text-xs font-bold ${tab === g ? "bg-navy text-white" : "border border-slate-200 bg-white text-slate2"}`}>
            {g}
          </button>
        ))}
      </div>
      {work === null && <div className="h-32 animate-pulse rounded-3xl bg-slate-100" />}
      {work !== null && items.length === 0 && <p className="text-sm text-slate2">Nothing in {tab.toLowerCase()} right now.</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((w, i) => (
          <div key={w.claimId} className="space-y-1">
            <BountyCard bounty={w.bounty} index={i} />
            {w.latestSubmission?.status === "REVISION_REQUESTED" && w.latestSubmission.reviewNote && (
              <p className="rounded-2xl bg-accent-coral/15 px-3 py-2 text-xs"><span className="font-bold">Creator said:</span> “{w.latestSubmission.reviewNote}”</p>
            )}
            {w.bounty.status === "SUBMITTED" && w.latestSubmission && (
              <p className="rounded-2xl bg-accent-purple/10 px-3 py-2 text-xs font-bold">Review: <Countdown targetIso={w.latestSubmission.reviewDeadlineAt} /></p>
            )}
            {(w.bounty.status === "CLAIMED" || w.bounty.status === "REVISION_REQUESTED") && (
              <Link href={`/n/${w.bounty.publicId}`} className="block text-center text-xs font-bold text-primary">Continue work →</Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
