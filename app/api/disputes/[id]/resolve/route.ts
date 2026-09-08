import { prisma } from "@/lib/db";
import { tryTransition } from "@/lib/bounty/state-machine";
import { queuePayout, recordCompletion } from "@/lib/settlement/settle";
import { apiError, apiOk } from "@/lib/api/route-helpers";

/**
 * Arbiter resolution (MVP: human arbiter via ARBITER_KEY, spec §23).
 * WORKER_WINS → WORKER_PAID + payout (deliverable unlocks).
 * CREATOR_WINS → CREATOR_REFUNDED + refund (deliverable STAYS locked — spec §8).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const key = req.headers.get("x-arbiter-key") ?? "";
  if (!process.env.ARBITER_KEY || key !== process.env.ARBITER_KEY)
    return apiError("UNAUTHORIZED_ACTION", "Arbiter access only.", 403);

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { resolution?: string; note?: string } | null;
  const resolution = body?.resolution;
  if (resolution !== "WORKER_WINS" && resolution !== "CREATOR_WINS")
    return apiError("INVALID_RESOLUTION", "resolution must be WORKER_WINS or CREATOR_WINS.", 400);
  const note = (body?.note ?? "").trim().slice(0, 1000);

  const dispute = await prisma.dispute.findUnique({
    where: { id },
    include: {
      bounty: {
        include: {
          claims: { where: { status: "ACTIVE" }, take: 1 },
          submissions: { orderBy: { submittedAt: "desc" }, take: 1 },
        },
      },
    },
  });
  if (!dispute) return apiError("INVALID_DISPUTE", "That dispute doesn't exist.", 404);
  if (dispute.status !== "OPEN") return apiError("DISPUTE_CLOSED", "This dispute is already resolved.", 409);
  const bounty = dispute.bounty;
  if (bounty.status !== "DISPUTED") return apiError("INVALID_STATE", `Bounty is ${bounty.status}, not DISPUTED.`, 409);
  const submission = bounty.submissions[0];
  const claim = bounty.claims[0];
  if (!submission || !claim) return apiError("INVALID_STATE", "Dispute lost its submission context.", 500);

  try {
    if (resolution === "WORKER_WINS") {
      const worker = await prisma.user.findUnique({ where: { id: claim.workerId } });
      if (!worker) return apiError("WORKER_MISSING", "Worker record vanished.", 500);
      const ok = await prisma.$transaction(async (tx) => {
        const won = await tryTransition(tx, bounty.id, "DISPUTED", "WORKER_PAID", { settledAt: new Date() });
        if (!won) return false;
        await tx.submission.update({ where: { id: submission.id }, data: { status: "APPROVED" } });
        await tx.claim.update({ where: { id: claim.id }, data: { status: "WORK_COMPLETED" } });
        await queuePayout(tx, {
          bountyId: bounty.id, to: worker.walletAddress,
          amount: bounty.rewardAmount, currency: bounty.currency, kind: "WORKER_PAYOUT", rail: "release",
        });
        await tx.reputation.update({
          where: { userId: worker.id },
          data: { completed: { increment: 1 }, approvals: { increment: 1 }, earned: { increment: bounty.rewardAmount } },
        });
        await tx.reputation.update({ where: { userId: bounty.creatorId }, data: { bountiesPaid: { increment: 1 }, disputesLost: { increment: 1 } } });
        await recordCompletion(tx, worker.id);
        await tx.dispute.update({
          where: { id: dispute.id },
          data: { status: "RESOLVED", resolution: "WORKER_WINS", resolutionNote: note || null, resolvedAt: new Date(), resolvedBy: "arbiter" },
        });
        return true;
      });
      if (!ok) return apiError("STATE_CHANGED", "Bounty changed under you.", 409);
      return apiOk({ status: "WORKER_PAID", settlement: "QUEUED" });
    }

    // CREATOR_WINS — refund, deliverable stays locked
    const creator = await prisma.user.findUnique({ where: { id: bounty.creatorId } });
    if (!creator) return apiError("CREATOR_MISSING", "Creator record vanished.", 500);
    const ok = await prisma.$transaction(async (tx) => {
      const won = await tryTransition(tx, bounty.id, "DISPUTED", "CREATOR_REFUNDED", { settledAt: new Date() });
      if (!won) return false;
      await queuePayout(tx, {
        bountyId: bounty.id, to: creator.walletAddress,
        amount: bounty.rewardAmount, currency: bounty.currency, kind: "CREATOR_REFUND", rail: "refund",
      });
      await tx.reputation.update({ where: { userId: claim.workerId }, data: { disputesLost: { increment: 1 } } });
      await tx.dispute.update({
        where: { id: dispute.id },
        data: { status: "RESOLVED", resolution: "CREATOR_WINS", resolutionNote: note || null, resolvedAt: new Date(), resolvedBy: "arbiter" },
      });
      return true;
    });
    if (!ok) return apiError("STATE_CHANGED", "Bounty changed under you.", 409);
    return apiOk({ status: "CREATOR_REFUNDED", settlement: "QUEUED" });
  } catch (e) {
    console.error("dispute/resolve failed", e);
    return apiError("RESOLVE_FAILED", "Could not resolve the dispute.", 500);
  }
}
