import { prisma } from "@/lib/db";
import { getSessionUser, requireUser, AuthError } from "@/lib/auth/session";
import { tryTransition } from "@/lib/bounty/state-machine";
import { apiError, apiOk, serializeBounty } from "@/lib/api/route-helpers";

export async function GET(_req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const bounty = await prisma.bounty.findUnique({
    where: { publicId },
    include: {
      creator: { select: { walletAddress: true, displayName: true } },
      claims: { where: { status: "ACTIVE" }, include: { worker: { select: { walletAddress: true } } }, take: 1 },
      submissions: { orderBy: { submittedAt: "desc" }, take: 1, select: { id: true, status: true, revisionNumber: true, submittedAt: true, reviewDeadlineAt: true } },
      disputes: { where: { status: "OPEN" }, take: 1, select: { id: true, reason: true, openedByRole: true, createdAt: true } },
    },
  });
  if (!bounty) return apiError("INVALID_BOUNTY", "That bounty doesn't exist.", 404);
  const { claims, submissions, disputes, ...rest } = bounty;
  const activeClaim = claims[0];
  return apiOk({
    bounty: {
      ...serializeBounty({ ...rest, creator: bounty.creator }),
      activeClaim: activeClaim ? { workerWallet: activeClaim.worker.walletAddress, claimedAt: activeClaim.claimedAt.toISOString() } : null,
      latestSubmission: submissions[0] ? {
        id: submissions[0].id, status: submissions[0].status,
        revisionNumber: submissions[0].revisionNumber,
        submittedAt: submissions[0].submittedAt.toISOString(),
        reviewDeadlineAt: submissions[0].reviewDeadlineAt.toISOString(),
      } : null,
      openDispute: disputes[0] ? {
        id: disputes[0].id, reason: disputes[0].reason,
        openedByRole: disputes[0].openedByRole,
        createdAt: disputes[0].createdAt.toISOString(),
      } : null,
    },
  });
}

/** Cancel — creator only, and ONLY before any worker claims (DRAFT/FUNDING). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return apiError((e as AuthError).code ?? "WALLET_NOT_CONNECTED", "Connect your wallet first.", 401);
  }
  const { publicId } = await params;
  const bounty = await prisma.bounty.findUnique({ where: { publicId } });
  if (!bounty) return apiError("INVALID_BOUNTY", "That bounty doesn't exist.", 404);
  if (bounty.creatorId !== user.id) return apiError("UNAUTHORIZED_ACTION", "Only the creator can cancel this bounty.", 403);
  if (bounty.status !== "DRAFT" && bounty.status !== "FUNDING")
    return apiError("CANCEL_FORBIDDEN", "This bounty already has locked funds or a worker — it can't be casually cancelled.", 409);
  try {
    const ok = await prisma.$transaction(async (tx) => {
      const won = await tryTransition(tx, bounty.id, bounty.status, "CANCELLED");
      if (won) await tx.settlementJob.deleteMany({ where: { bountyId: bounty.id, status: "QUEUED" } });
      return won;
    });
    if (!ok) return apiError("STATE_CHANGED", "Bounty changed under you — refresh and try again.", 409);
    const me = await getSessionUser();
    void me;
    return apiOk({ status: "CANCELLED" });
  } catch (e) {
    console.error("bounty/cancel failed", e);
    return apiError("CANCEL_FAILED", "Could not cancel the bounty.", 500);
  }
}
