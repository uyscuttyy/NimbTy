import { prisma } from "@/lib/db";
import { requireUser, AuthError } from "@/lib/auth/session";
import { tryTransition } from "@/lib/bounty/state-machine";
import { apiError, apiOk } from "@/lib/api/route-helpers";

/**
 * Open a dispute — either party, reason required. Reward stays locked (spec §23).
 * From SUBMITTED only (the state with a reviewable submission).
 */
export async function POST(req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return apiError((e as AuthError).code ?? "WALLET_NOT_CONNECTED", "Connect your wallet first.", 401);
  }
  const { publicId } = await params;
  const body = (await req.json().catch(() => null)) as { reason?: string; evidence?: unknown } | null;
  const reason = (body?.reason ?? "").trim();
  if (reason.length < 10 || reason.length > 2000)
    return apiError("REASON_REQUIRED", "Explain what's wrong (10–2000 chars). Both sides see this.", 400);

  const bounty = await prisma.bounty.findUnique({
    where: { publicId },
    include: {
      claims: { where: { status: "ACTIVE" }, take: 1 },
      submissions: { orderBy: { submittedAt: "desc" }, take: 1 },
      disputes: { where: { status: "OPEN" }, take: 1 },
    },
  });
  if (!bounty) return apiError("INVALID_BOUNTY", "That bounty doesn't exist.", 404);
  const claim = bounty.claims[0];
  const isCreator = bounty.creatorId === user.id;
  const isWorker = claim?.workerId === user.id;
  if (!isCreator && !isWorker) return apiError("UNAUTHORIZED_ACTION", "Only the creator and worker can dispute.", 403);
  if (bounty.status !== "SUBMITTED") return apiError("INVALID_STATE", `Disputes open from SUBMITTED (now ${bounty.status}).`, 409);
  if (bounty.disputes[0]) return apiError("DISPUTE_EXISTS", "A dispute is already open.", 409);
  const submission = bounty.submissions[0];
  if (!submission || submission.status !== "PENDING_REVIEW")
    return apiError("INVALID_STATE", "No submission awaiting review.", 409);

  try {
    const dispute = await prisma.$transaction(async (tx) => {
      const won = await tryTransition(tx, bounty.id, "SUBMITTED", "DISPUTED");
      if (!won) return null;
      await tx.submission.update({ where: { id: submission.id }, data: { status: "DISPUTED" } });
      await tx.settlementJob.deleteMany({ where: { bountyId: bounty.id, kind: "REVIEW_EXPIRED", status: "QUEUED" } });
      const d = await tx.dispute.create({
        data: {
          bountyId: bounty.id, submissionId: submission.id,
          openedById: user.id, openedByRole: isCreator ? "CREATOR" : "WORKER",
          reason, evidence: (body?.evidence as object) ?? undefined, status: "OPEN",
        },
      });
      const otherId = isCreator ? claim?.workerId : bounty.creatorId;
      await tx.reputation.update({ where: { userId: user.id }, data: { disputesOpened: { increment: 1 } } });
      if (otherId) {
        await tx.reputation.upsert({
          where: { userId: otherId },
          create: { userId: otherId, disputesAgainst: 1 },
          update: { disputesAgainst: { increment: 1 } },
        });
      }
      return d;
    });
    if (!dispute) return apiError("STATE_CHANGED", "Bounty changed under you — refresh.", 409);
    return apiOk({
      dispute: { id: dispute.id, status: dispute.status, reason: dispute.reason },
      message: "Dispute opened. The reward stays locked until resolution.",
    }, 201);
  } catch (e) {
    console.error("bounty/dispute failed", e);
    return apiError("DISPUTE_FAILED", "Could not open the dispute.", 500);
  }
}
