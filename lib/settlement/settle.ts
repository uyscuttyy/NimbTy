import type { Prisma } from "@prisma/client";
import { tryTransition } from "@/lib/bounty/state-machine";

/**
 * Shared money-movement primitives (Phases 5–6).
 * Every financial act = validated transition + Payment row + PAYOUT job.
 * The cron worker ONLY executes queued PAYOUT jobs — never decides who wins.
 */

export async function queuePayout(
  tx: Prisma.TransactionClient,
  input: { bountyId: string; to: string; amount: unknown; currency: "NIM" | "USDT"; kind: "WORKER_PAYOUT" | "CREATOR_REFUND"; rail: "release" | "refund" },
) {
  const payment = await tx.payment.create({
    data: {
      bountyId: input.bountyId, kind: input.kind,
      sender: process.env.ESCROW_ACCOUNT_ADDRESS ?? "", recipient: input.to,
      amount: input.amount as never, currency: input.currency, status: "PENDING",
    },
  });
  await tx.settlementJob.create({
    data: {
      bountyId: input.bountyId, kind: "PAYOUT",
      payload: { paymentId: payment.id, to: input.to, rail: input.rail },
      runAt: new Date(),
    },
  });
  return payment.id;
}

/** SUBMITTED → PAID with full bookkeeping. Caller must hold the winning submission + claim. */
export async function applyWorkerPaid(
  tx: Prisma.TransactionClient,
  input: {
    bountyId: string; submissionId: string; claimId: string;
    workerId: string; workerWallet: string; creatorId: string;
    amount: unknown; currency: "NIM" | "USDT";
  },
): Promise<boolean> {
  const won = await tryTransition(tx, input.bountyId, "SUBMITTED", "PAID", { settledAt: new Date() });
  if (!won) return false;
  await tx.submission.update({ where: { id: input.submissionId }, data: { status: "APPROVED" } });
  await tx.claim.update({ where: { id: input.claimId }, data: { status: "WORK_COMPLETED" } });
  await tx.settlementJob.deleteMany({ where: { bountyId: input.bountyId, kind: "REVIEW_EXPIRED", status: "QUEUED" } });
  await queuePayout(tx, {
    bountyId: input.bountyId, to: input.workerWallet,
    amount: input.amount, currency: input.currency, kind: "WORKER_PAYOUT", rail: "release",
  });
  await tx.reputation.update({
    where: { userId: input.workerId },
    data: { completed: { increment: 1 }, approvals: { increment: 1 }, earned: { increment: input.amount as never } },
  });
  await tx.reputation.update({ where: { userId: input.creatorId }, data: { bountiesPaid: { increment: 1 } } });
  await recordCompletion(tx, input.workerId);
  return true;
}

export async function recordCompletion(tx: Prisma.TransactionClient, workerId: string) {
  const streak = await tx.streak.findUnique({ where: { userId: workerId } });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const last = streak?.lastCompletedOn ? new Date(streak.lastCompletedOn) : null;
  last?.setHours(0, 0, 0, 0);
  let current = 1;
  if (last) {
    const days = Math.round((today.getTime() - last.getTime()) / 86400000);
    if (days === 0) current = streak?.current ?? 1;
    else if (days === 1) current = (streak?.current ?? 0) + 1;
  }
  await tx.streak.upsert({
    where: { userId: workerId },
    create: { userId: workerId, current, longest: current, lastCompletedOn: new Date() },
    update: { current, longest: Math.max(streak?.longest ?? 0, current), lastCompletedOn: new Date() },
  });
}
