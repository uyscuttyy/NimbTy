import { prisma } from "@/lib/db";
import { requireUser, AuthError } from "@/lib/auth/session";
import { apiError, apiOk } from "@/lib/api/route-helpers";
import { serializeBounty } from "@/lib/api/route-helpers";

/** Worker dashboard (spec §29): my claims with live bounty state. */
export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return apiError((e as AuthError).code ?? "WALLET_NOT_CONNECTED", "Connect your wallet first.", 401);
  }
  const claims = await prisma.claim.findMany({
    where: { workerId: user.id },
    orderBy: { claimedAt: "desc" },
    take: 100,
    include: {
      bounty: { include: { creator: { select: { walletAddress: true, displayName: true } } } },
      submissions: { orderBy: { submittedAt: "desc" }, take: 1 },
    },
  });
  return apiOk({
    work: claims.map((c) => ({
      claimId: c.id,
      status: c.status,
      claimedAt: c.claimedAt.toISOString(),
      bounty: serializeBounty(c.bounty),
      latestSubmission: c.submissions[0] ? {
        id: c.submissions[0].id, status: c.submissions[0].status,
        reviewNote: c.submissions[0].reviewNote,
        reviewDeadlineAt: c.submissions[0].reviewDeadlineAt.toISOString(),
      } : null,
    })),
  });
}
