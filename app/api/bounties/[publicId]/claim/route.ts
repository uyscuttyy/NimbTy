import { prisma } from "@/lib/db";
import { requireUser, AuthError } from "@/lib/auth/session";
import { tryTransition } from "@/lib/bounty/state-machine";
import { apiError, apiOk } from "@/lib/api/route-helpers";

/** Claim — worker only. Exactly one claimer wins via optimistic transition (spec §19). */
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
  if (bounty.status !== "OPEN") {
    if (bounty.status === "CLAIMED") return apiError("ALREADY_CLAIMED", "Someone already claimed this bounty.", 409);
    return apiError("INVALID_STATE", `This bounty is ${bounty.status} — not claimable.`, 409);
  }
  if (bounty.deadlineAt.getTime() <= Date.now())
    return apiError("BOUNTY_EXPIRED", "The deadline passed before anyone claimed it.", 410);

  try {
    const claim = await prisma.$transaction(async (tx) => {
      const won = await tryTransition(tx, bounty.id, "OPEN", "CLAIMED");
      if (!won) return null;
      return tx.claim.create({
        data: { bountyId: bounty.id, workerId: user.id, status: "ACTIVE" },
      });
    });
    if (!claim) return apiError("ALREADY_CLAIMED", "Someone just claimed it a moment ago.", 409);
    return apiOk({
      claim: { id: claim.id, claimedAt: claim.claimedAt.toISOString() },
      reward: bounty.rewardAmount.toString(),
      deadlineAt: bounty.deadlineAt.toISOString(),
    }, 201);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "P2002") return apiError("ALREADY_CLAIMED", "You already claimed this bounty.", 409);
    console.error("bounty/claim failed", e);
    return apiError("CLAIM_FAILED", "Could not claim the bounty.", 500);
  }
}
