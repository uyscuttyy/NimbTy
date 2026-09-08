"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/SessionProvider";
import { Countdown } from "@/components/Countdown";
import { FundPanel } from "@/components/FundPanel";
import { ReviewPanel } from "@/components/ReviewPanel";
import { ShareButtons } from "@/components/ShareButtons";
import { SubmitForm } from "@/components/SubmitForm";
import { RewardBadge } from "@/components/RewardBadge";
import { Confetti } from "@/components/Confetti";
import { api, shortAddr, statusMeta, type ApiBounty } from "@/lib/ui/bounty";

interface Detail extends ApiBounty {
  activeClaim: { workerWallet: string; claimedAt: string } | null;
  latestSubmission: { id: string; status: string; revisionNumber: number; submittedAt: string; reviewDeadlineAt: string } | null;
  openDispute: { id: string; reason: string; openedByRole: string; createdAt: string } | null;
}

export default function BountyPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = use(params);
  const { user, status } = useSession();
  const [bounty, setBounty] = useState<Detail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [showClaim, setShowClaim] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<{ ok: boolean; bounty?: Detail }>(`/api/bounties/${publicId}`);
      if (!d.ok) { setNotFound(true); return; }
      setBounty(d.bounty!);
    } catch {
      setNotFound(true);
    }
  }, [publicId]);

  useEffect(() => { load(); }, [load]);

  if (notFound) {
    return (
      <div className="pt-10 text-center">
        <p className="font-display text-xl font-bold text-navy">That bounty doesn&apos;t exist.</p>
        <Link href="/explore" className="mt-2 inline-block font-bold text-primary">Find something to do →</Link>
      </div>
    );
  }
  if (!bounty) return <div className="pt-4" aria-label="Loading"><div className="h-64 animate-pulse rounded-3xl bg-slate-100" /></div>;

  const meta = statusMeta(bounty.status);
  const isCreator = !!user && user.walletAddress === bounty.creatorWallet;
  const isWorker = !!user && !!bounty.activeClaim && user.walletAddress === bounty.activeClaim.workerWallet;
  const paid = bounty.status === "PAID" || bounty.status === "WORKER_PAID";

  const claim = async () => {
    setClaiming(true); setClaimError(null);
    try {
      const d = await api<{ ok: boolean; message?: string }>(`/api/bounties/${publicId}/claim`, { method: "POST", body: "{}" });
      if (!d.ok) throw new Error(d.message ?? "Couldn't claim.");
      setShowClaim(false);
      await load();
    } catch (e) {
      setClaimError(e instanceof Error ? e.message : "Couldn't claim.");
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 pt-4">
      {paid && <Confetti />}
      <div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${meta.classes}`}>{meta.label}</span>
          {bounty.escrowLocked && <span className="text-xs font-bold text-emerald-700">🔒 Reward locked in escrow</span>}
        </div>
        <h1 className="mt-2 font-display text-2xl font-bold leading-tight text-navy sm:text-3xl">{bounty.title}</h1>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-3xl border border-slate-200 bg-white p-4 text-center">
        <div>
          <p className="text-[11px] font-bold uppercase text-slate2">Reward</p>
          <RewardBadge amount={bounty.rewardAmount} currency={bounty.currency} size="sm" />
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase text-slate2">Deadline</p>
          <p className="font-mono text-sm font-bold text-navy"><Countdown targetIso={bounty.deadlineAt} /></p>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase text-slate2">Payment</p>
          <p className="text-xs font-bold text-emerald-700">🔒 escrow</p>
        </div>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-4">
        <h2 className="font-display font-bold text-navy">What needs doing?</h2>
        <p className="mt-1 whitespace-pre-wrap text-sm text-navy">{bounty.description}</p>
        <p className="mt-3 text-xs text-slate2">Posted by {shortAddr(bounty.creatorWallet)} · {bounty.reviewHours}h review</p>
      </section>

      {status === "disconnected" && bounty.status === "OPEN" && (
        <p className="rounded-3xl bg-primary-soft p-4 text-center text-sm font-bold text-primary-dark">Connect your wallet to claim this bounty.</p>
      )}

      {bounty.status === "OPEN" && !isCreator && status === "connected" && !showClaim && (
        <button onClick={() => setShowClaim(true)} className="min-h-touch w-full rounded-2xl bg-accent-yellow px-5 py-3 font-display text-lg font-bold text-navy active:scale-[0.99]">
          DO IT — earn {bounty.rewardAmount} {bounty.currency}
        </button>
      )}

      {showClaim && (
        <div role="dialog" aria-label="Claim bounty" className="space-y-2 rounded-3xl border-2 border-accent-yellow bg-white p-4">
          <h3 className="font-display font-bold text-navy">You&apos;re taking this bounty.</h3>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-slate2">Reward</dt><dd className="font-bold">{bounty.rewardAmount} {bounty.currency}</dd></div>
            <div className="flex justify-between"><dt className="text-slate2">Deadline</dt><dd className="font-mono font-bold"><Countdown targetIso={bounty.deadlineAt} /></dd></div>
          </dl>
          <p className="text-sm font-bold text-emerald-700">🔒 The reward is already locked. Finish the work and it&apos;s yours.</p>
          {claimError && <p role="alert" className="rounded-2xl bg-accent-coral/15 px-4 py-2 text-sm font-semibold text-rose-700">{claimError}</p>}
          <div className="flex gap-2">
            <button onClick={claim} disabled={claiming} className="min-h-touch flex-1 rounded-2xl bg-navy px-4 py-3 font-bold text-white disabled:opacity-60">
              {claiming ? "Claiming…" : "START"}
            </button>
            <button onClick={() => setShowClaim(false)} className="min-h-touch rounded-2xl border border-slate-200 px-4 text-sm font-bold">Cancel</button>
          </div>
        </div>
      )}

      {(bounty.status === "DRAFT" || bounty.status === "FUNDING") && isCreator && (
        <FundPanel publicId={publicId} onLive={load} />
      )}
      {(bounty.status === "DRAFT" || bounty.status === "FUNDING") && !isCreator && (
        <p className="rounded-3xl bg-slate-100 p-4 text-center text-sm font-semibold text-slate2">This bounty isn&apos;t funded yet — check back soon.</p>
      )}

      {(bounty.status === "CLAIMED" || bounty.status === "REVISION_REQUESTED") && isWorker && (
        <div className="space-y-3">
          <div className="rounded-3xl bg-primary-soft p-4 text-center">
            <p className="font-display font-bold text-primary-dark">IN PROGRESS ⏳ <Countdown targetIso={bounty.deadlineAt} /></p>
            <p className="text-sm font-bold text-primary-dark">{bounty.rewardAmount} {bounty.currency} LOCKED</p>
          </div>
          <SubmitForm publicId={publicId} header={bounty.status === "REVISION_REQUESTED" ? "Resubmit — revision requested" : "Submit your work"} onSubmitted={load} />
        </div>
      )}

      {bounty.status === "SUBMITTED" && isWorker && bounty.latestSubmission && (
        <div className="rounded-3xl bg-accent-purple/10 p-4 text-center">
          <p className="font-display font-bold text-navy">SUBMITTED ✓ Waiting for creator review.</p>
          <p className="mt-1 text-sm text-slate2">Review time: <Countdown targetIso={bounty.latestSubmission.reviewDeadlineAt} /> — silence means you get paid.</p>
        </div>
      )}

      {(bounty.status === "SUBMITTED" || bounty.status === "REVISION_REQUESTED") && isCreator && (
        <ReviewPanel publicId={publicId} onChanged={load} />
      )}

      {bounty.status === "DISPUTED" && bounty.openDispute && (
        <div className="rounded-3xl border-2 border-accent-coral bg-white p-4">
          <h3 className="font-display font-bold text-rose-700">⚠ DISPUTED — {bounty.rewardAmount} {bounty.currency} LOCKED</h3>
          <p className="mt-1 text-sm"><span className="font-bold">Reason:</span> {bounty.openDispute.reason}</p>
          <p className="mt-1 text-xs text-slate2">Status: Awaiting resolution. Neither side can touch the reward.</p>
        </div>
      )}

      {paid && (
        <div className="rounded-3xl bg-navy p-5 text-center text-white">
          <p className="font-display text-xl font-bold">💰 PAID — {bounty.rewardAmount} {bounty.currency}</p>
          {bounty.fundingTxHash && <p className="mt-1 font-mono text-xs text-slate-300">escrow tx: {bounty.fundingTxHash.slice(0, 20)}…</p>}
        </div>
      )}
      {(bounty.status === "CREATOR_REFUNDED" || bounty.status === "EXPIRED_REFUNDED") && (
        <div className="rounded-3xl bg-slate-100 p-4 text-center text-sm font-bold text-slate2">Refunded to creator.</div>
      )}

      <ShareButtons publicId={publicId} title={bounty.title} />
    </div>
  );
}
