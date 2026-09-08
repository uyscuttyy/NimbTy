import { prisma } from "@/lib/db";
import { requireUser, AuthError } from "@/lib/auth/session";
import { tryTransition } from "@/lib/bounty/state-machine";
import { apiError, apiOk } from "@/lib/api/route-helpers";

/** REQUEST REVISION — creator only. Money stays locked; worker resubmits (spec §22). */
export async function POST(req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return apiError((e as AuthError).code ?? "WALLET_NOT_CONNECTED", "Connect your wallet first.", 401);
  }
  const { publicId } = await params;
  const body = (await req.json().catch(() => null)) as { reason?: string } | null;
  const reason = (body?.reason ?? "").trim();
  if (reason.length < 5 || reason.length > 1000)
    return apiError("REASON_REQUIRED", "Tell the worker what to fix (5–1000 chars).", 400);

  const bounty = await prisma.bounty.findUnique({
    where: { publicId },
    include: { submissions: { orderBy: { submittedAt: "desc" }, take: 1 } },
  });
  if (!bounty) return apiError("INVALID_BOUNTY", "That bounty doesn't exist.", 404);
  if (bounty.creatorId !== user.id) return apiError("UNAUTHORIZED_ACTION", "Only the creator can request a revision.", 403);
  if (bounty.status !== "SUBMITTED") return apiError("INVALID_STATE", `Nothing to revise (now ${bounty.status}).`, 409);
  const submission = bounty.submissions[0];
  if (!submission || submission.status !== "PENDING_REVIEW")
    return apiError("INVALID_STATE", "No submission awaiting review.", 409);

  try {
    const ok = await prisma.$transaction(async (tx) => {
      const won = await tryTransition(tx, bounty.id, "SUBMITTED", "REVISION_REQUESTED");
      if (!won) return false;
      await tx.submission.update({
        where: { id: submission.id },
        data: { status: "REVISION_REQUESTED", reviewNote: reason },
      });
      await tx.settlementJob.deleteMany({ where: { bountyId: bounty.id, kind: "REVIEW_EXPIRED", status: "QUEUED" } });
      return true;
    });
    if (!ok) return apiError("STATE_CHANGED", "Bounty changed under you — refresh.", 409);
    return apiOk({ status: "REVISION_REQUESTED", message: "Revision requested. The reward stays locked." });
  } catch (e) {
    console.error("bounty/revision failed", e);
    return apiError("REVISION_FAILED", "Could not request a revision.", 500);
  }
}
