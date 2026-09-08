import { prisma } from "@/lib/db";
import { requireUser, AuthError } from "@/lib/auth/session";
import { apiError, apiOk } from "@/lib/api/route-helpers";

/** Read a submission — bounty creator or submitting worker only. Never includes the protected deliverable. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return apiError((e as AuthError).code ?? "WALLET_NOT_CONNECTED", "Connect your wallet first.", 401);
  }
  const { id } = await params;
  const s = await prisma.submission.findUnique({
    where: { id },
    include: {
      bounty: { select: { creatorId: true, publicId: true, title: true, rewardAmount: true, currency: true, status: true } },
      worker: { select: { walletAddress: true, displayName: true } },
    },
  });
  if (!s) return apiError("INVALID_SUBMISSION", "That submission doesn't exist.", 404);
  if (s.bounty.creatorId !== user.id && s.workerId !== user.id)
    return apiError("UNAUTHORIZED_ACTION", "Only the creator and worker can view this submission.", 403);
  return apiOk({
    submission: {
      id: s.id, bountyPublicId: s.bounty.publicId, bountyTitle: s.bounty.title,
      reward: s.bounty.rewardAmount.toString(), currency: s.bounty.currency,
      workerWallet: s.worker.walletAddress, workerName: s.worker.displayName,
      summary: s.summary, proofItems: s.proofItems,
      hasFinalDeliverable: s.finalDeliverable !== null,
      revisionNumber: s.revisionNumber, status: s.status,
      reviewNote: s.reviewNote,
      reviewDeadlineAt: s.reviewDeadlineAt.toISOString(),
      submittedAt: s.submittedAt.toISOString(),
    },
  });
}
