import { prisma } from "@/lib/db";
import { tryTransition } from "@/lib/bounty/state-machine";
import { applyWorkerPaid, queuePayout } from "@/lib/settlement/settle";
import { paymentService } from "@/lib/payments/nimbty-nimiq.service";
import { RpcUnavailableError } from "@/lib/nimiq/rpc";
import { apiError, apiOk } from "@/lib/api/route-helpers";

const MAX_ATTEMPTS = 10;

function backoff(attempts: number): Date {
  const minutes = Math.min(5 * Math.pow(2, attempts), 120);
  return new Date(Date.now() + minutes * 60 * 1000);
}

/**
 * Settlement worker (spec §37). Vercel cron → POST here with CRON_SECRET.
 * - REVIEW_EXPIRED: silence → worker auto-paid (spec §9).
 * - PAYOUT: broadcast the signed escrow tx; retry with backoff; never double-pay.
 * - FUNDING_EXPIRED: funding window lapsed → back to DRAFT.
 * - Deadline sweep: OPEN/CLAIMED/REVISION_REQUESTED past deadline → EXPIRED_REFUNDED + creator refund.
 * All decisions re-verify DB state first; every money move is idempotent.
 */
export async function POST(req: Request) {
  return runSettlement(req);
}

export async function GET(req: Request) {
  return runSettlement(req);
}

async function runSettlement(req: Request) {
  const auth = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  // Vercel cron can't set headers — ?secret= is accepted as equivalent (still secret-guarded).
  const querySecret = new URL(req.url).searchParams.get("secret") ?? "";
  const presented = auth || querySecret;
  if (!process.env.CRON_SECRET || presented !== process.env.CRON_SECRET)
    return apiError("UNAUTHORIZED_ACTION", "Invalid cron secret.", 401);

  const now = new Date();
  const processed: Record<string, number> = { review: 0, payout: 0, funding: 0, deadline: 0, failed: 0 };

  // ── 1) Due jobs, one at a time with an atomic claim ──
  const due = await prisma.settlementJob.findMany({
    where: { status: "QUEUED", runAt: { lte: now } },
    orderBy: { runAt: "asc" }, take: 25,
  });

  for (const job of due) {
    const claimed = await prisma.settlementJob.updateMany({
      where: { id: job.id, status: "QUEUED" },
      data: { status: "PROCESSING", attempts: { increment: 1 } },
    });
    if (claimed.count !== 1) continue; // someone else took it
    try {
      if (job.kind === "REVIEW_EXPIRED") await handleReviewExpired(job.bountyId, (job.payload as { submissionId?: string }).submissionId);
      else if (job.kind === "PAYOUT") await handlePayout(job.payload as { paymentId: string; to: string; rail: "release" | "refund" });
      else if (job.kind === "FUNDING_EXPIRED") await handleFundingExpired(job.bountyId);
      else throw new Error(`UNKNOWN_JOB: ${job.kind}`);
      await prisma.settlementJob.update({ where: { id: job.id }, data: { status: "DONE", lastError: null } });
      processed[job.kind === "REVIEW_EXPIRED" ? "review" : job.kind === "PAYOUT" ? "payout" : "funding"]++;
    } catch (e) {
      const attempts = job.attempts + 1;
      const msg = (e as Error).message;
      if (attempts >= MAX_ATTEMPTS) {
        await prisma.settlementJob.update({ where: { id: job.id }, data: { status: "FAILED_PERMANENT", lastError: msg } });
        processed.failed++;
      } else {
        await prisma.settlementJob.update({ where: { id: job.id }, data: { status: "QUEUED", lastError: msg, runAt: backoff(attempts) } });
      }
    }
  }

  // ── 2) Deadline sweep (idempotent: transitions only fire from live states) ──
  const expired = await prisma.bounty.findMany({
    where: {
      deadlineAt: { lt: now },
      status: { in: ["OPEN", "CLAIMED", "REVISION_REQUESTED"] },
    },
    take: 25,
  });
  for (const b of expired) {
    const ok = await prisma.$transaction(async (tx) => {
      const won = await tryTransition(tx, b.id, b.status, "EXPIRED_REFUNDED", { settledAt: new Date() });
      if (!won) return false;
      const creator = await tx.user.findUnique({ where: { id: b.creatorId } });
      if (creator) {
        await queuePayout(tx, {
          bountyId: b.id, to: creator.walletAddress,
          amount: b.rewardAmount, currency: b.currency, kind: "CREATOR_REFUND", rail: "refund",
        });
      }
      await tx.claim.updateMany({ where: { bountyId: b.id, status: "ACTIVE" }, data: { status: "ABANDONED" } });
      return true;
    });
    if (ok) processed.deadline++;
  }

  return apiOk({ processed });
}

async function handleReviewExpired(bountyId: string | null, submissionId?: string) {
  if (!bountyId || !submissionId) return;
  const bounty = await prisma.bounty.findUnique({
    where: { id: bountyId },
    include: {
      claims: { where: { status: "ACTIVE" }, take: 1 },
      submissions: { where: { id: submissionId }, take: 1 },
    },
  });
  if (!bounty || bounty.status !== "SUBMITTED") return; // already moved — nothing to do
  const submission = bounty.submissions[0];
  const claim = bounty.claims[0];
  if (!submission || submission.status !== "PENDING_REVIEW" || !claim) return;
  if (submission.reviewDeadlineAt.getTime() > Date.now()) return; // not yet — clock safety
  const worker = await prisma.user.findUnique({ where: { id: claim.workerId } });
  if (!worker) throw new Error("WORKER_MISSING: cannot auto-settle without worker record");
  await prisma.$transaction((tx) => applyWorkerPaid(tx, {
    bountyId: bounty.id, submissionId: submission.id, claimId: claim.id,
    workerId: worker.id, workerWallet: worker.walletAddress, creatorId: bounty.creatorId,
    amount: bounty.rewardAmount, currency: bounty.currency,
  }));
}

async function handlePayout(payload: { paymentId: string; to: string; rail: "release" | "refund" }) {
  const payment = await prisma.payment.findUnique({ where: { id: payload.paymentId } });
  if (!payment) return;
  if (payment.status === "CONFIRMED") return; // already broadcast — idempotent
  // Execution-time guard: never pay for a bounty whose funding isn't proven
  // on-chain. (Stale/dev rows must never move real money.)
  const bounty = await prisma.bounty.findUnique({ where: { id: payment.bountyId } });
  if (!bounty || !["PAID", "WORKER_PAID", "CREATOR_REFUNDED", "EXPIRED_REFUNDED"].includes(bounty.status))
    throw new Error(`PAYOUT_BOUNTY_NOT_PAYABLE: bounty ${payment.bountyId} is ${bounty?.status ?? "missing"}`);
  const funding = await prisma.payment.findFirst({
    where: { bountyId: payment.bountyId, kind: "ESCROW_FUNDING", status: "CONFIRMED" },
    orderBy: { createdAt: "desc" },
  });
  if (!funding?.transactionHash) throw new Error("PAYOUT_FUNDING_UNPROVEN: no confirmed funding payment");
  try {
    const v = await paymentService.verifyTransaction({
      request: {
        bountyId: bounty.id, publicId: bounty.publicId,
        amount: bounty.rewardAmount.toString(), currency: bounty.currency,
        payTo: process.env.ESCROW_ACCOUNT_ADDRESS ?? "", memo: `nimbty:${bounty.publicId}`,
        expiresAt: new Date().toISOString(),
      },
      txHash: funding.transactionHash,
    });
    if (!v.verified) throw new Error("PAYOUT_FUNDING_UNPROVEN: funding tx does not verify on-chain");
  } catch (e) {
    if (e instanceof RpcUnavailableError) throw e; // retry later
    throw e instanceof Error && e.message.startsWith("PAYOUT_") ? e : new Error(`PAYOUT_FUNDING_UNPROVEN: ${(e as Error).message}`);
  }
  try {
    const res = payment.kind === "CREATOR_REFUND"
      ? await paymentService.refundCreator(payment.bountyId, payload.to)
      : await paymentService.releaseToWorker(payment.bountyId, payload.to);
    await prisma.payment.update({
      where: { id: payment.id },
      data: { transactionHash: res.txHash, status: "CONFIRMED", confirmedAt: new Date() },
    });
  } catch (e) {
    if (e instanceof RpcUnavailableError) throw e; // retried with backoff
    throw e;
  }
}

async function handleFundingExpired(bountyId: string | null) {
  if (!bountyId) return;
  await prisma.$transaction(async (tx) => {
    const b = await tx.bounty.findUnique({ where: { id: bountyId } });
    if (!b || b.status !== "FUNDING") return;
    await tryTransition(tx, bountyId, "FUNDING", "DRAFT");
    await tx.payment.updateMany({
      where: { bountyId, kind: "ESCROW_FUNDING", status: "PENDING" },
      data: { status: "FAILED" },
    });
  });
}
