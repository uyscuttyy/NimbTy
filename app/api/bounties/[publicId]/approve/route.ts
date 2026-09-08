import { prisma } from "@/lib/db";
import { requireUser, AuthError } from "@/lib/auth/session";
import { applyWorkerPaid } from "@/lib/settlement/settle";
import { apiError, apiOk } from "@/lib/api/route-helpers";

/**
 * APPROVE & PAY — creator only. SUBMITTED→PAID, then money moves via an
 * idempotent PAYOUT SettlementJob (executed by the cron worker, never the browser).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return apiError((e as AuthError).code ?? "WALLET_NOT_CONNECTED", "Connect your wallet first.", 401);
  }
  const { publicId } = await params;
  const bounty = await prisma.bounty.findUnique({
    where: { publicId },
    include: {
      claims: { where: { status: "ACTIVE" }, take: 1 },
      submissions: { orderBy: { submittedAt: "desc" }, take: 1 },
    },
  });
  if (!bounty) return apiError("INVALID_BOUNTY", "That bounty doesn't exist.", 404);
  if (bounty.creatorId !== user.id) return apiError("UNAUTHORIZED_ACTION", "Only the creator can approve.", 403);
  if (bounty.status !== "SUBMITTED") return apiError("INVALID_STATE", `Nothing to approve (now ${bounty.status}).`, 409);
  const submission = bounty.submissions[0];
  const claim = bounty.claims[0];
  if (!submission || submission.status !== "PENDING_REVIEW" || !claim)
    return apiError("INVALID_STATE", "No submission awaiting review.", 409);

  const worker = await prisma.user.findUnique({ where: { id: claim.workerId } });
  if (!worker) return apiError("WORKER_MISSING", "Worker record vanished — cannot pay.", 500);

  try {
    const ok = await prisma.$transaction((tx) => applyWorkerPaid(tx, {
      bountyId: bounty.id, submissionId: submission.id, claimId: claim.id,
      workerId: worker.id, workerWallet: worker.walletAddress, creatorId: user.id,
      amount: bounty.rewardAmount, currency: bounty.currency,
    }));
    if (!ok) return apiError("STATE_CHANGED", "Bounty changed under you — refresh.", 409);
    return apiOk({ status: "PAID", settlement: "QUEUED", message: "Approved. The payout is queued and will broadcast from escrow." });
  } catch (e) {
    console.error("bounty/approve failed", e);
    return apiError("APPROVE_FAILED", "Could not approve.", 500);
  }
}
