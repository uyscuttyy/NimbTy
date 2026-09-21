import { prisma } from "@/lib/db";
import { requireUser, AuthError } from "@/lib/auth/session";
import { tryTransition } from "@/lib/bounty/state-machine";
import { apiError, apiOk } from "@/lib/api/route-helpers";

/** Claim — worker only. Up to 3 claimers allowed via optimistic transition (spec §19). */
export async function POST(_req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return apiError((e as AuthError).code ?? "WALLET_NOT_CONNECTED", "Connect your wallet first.", 401);
  }
  const { publicId } = await params;
  const bounty = await prisma.bounty.findUnique({ where: { publicId } });
  if (!bounty) return apiError("INVALID_BOUNTY", "That bounty doesn't exist.", 404);
  if (bounty.creatorId === user.id) return apiError("SELF_CLAIM", "You can't claim your own bounty.", 403);
  if (bounty.deadlineAt.getTime() <= Date.now())
    return apiError("BOUNTY_EXPIRED", "The deadline passed before anyone claimed it.", 410);

  // Count existing active claims for this bounty
  const claimCount = await prisma.claim.count({
    where: { bountyId: bounty.id, status: "ACTIVE" },
  });
  if (claimCount >= 3)
    return apiError("CLAIM_LIMIT_REACHED", "This bounty already has 3 workers.", 409);

  try {
    const claim = await prisma.$transaction(async (tx) => {
      // First claim transitions OPEN → CLAIMED; subsequent claims just add claim record
      if (bounty.status === "OPEN") {
        const won = await tryTransition(tx, bounty.id, "OPEN", "CLAIMED");
        if (!won) return null;
      } else if (bounty.status !== "CLAIMED") {
        return null; // not claimable
      }
      return tx.claim.create({
        data: { bountyId: bounty.id, workerId: user.id, status: "ACTIVE" },
      });
    });
    if (!claim) return apiError("ALREADY_CLAIMED", "Someone just claimed it a moment ago.", 409);
    return apiOk({
      claim: { id: claim.id, claimedAt: claim.claimedAt.toISOString() },
      reward: bounty.rewardAmount.toString(),
      deadlineAt: bounty.deadlineAt.toISOString(),
      claimNumber: claimCount + 1,
    }, 201);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "P2002") return apiError("ALREADY_CLAIMED", "You already claimed this bounty.", 409);
    console.error("bounty/claim failed", e);
    return apiError("CLAIM_FAILED", "Could not claim the bounty.", 500);
  }
}
