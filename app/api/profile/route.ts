import { prisma } from "@/lib/db";
import { getSessionUser, requireUser, AuthError } from "@/lib/auth/session";
import { getApprovalRate, getLevel } from "@/lib/reputation/service";
import { apiError, apiOk } from "@/lib/api/route-helpers";

/**
 * Profile (spec §24–27). Every number derives from stored records.
 * GET /api/profile → own full profile. GET /api/profile?wallet=NQ… → public subset.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const wallet = (url.searchParams.get("wallet") ?? "").trim().toUpperCase().replace(/\s+/g, "");
  const me = await getSessionUser().catch(() => null);

  let userId: string;
  let isOwn = false;
  if (wallet) {
    const other = await prisma.user.findUnique({ where: { walletAddress: wallet } });
    if (!other) return apiError("UNKNOWN_USER", "No NimBty profile for that wallet.", 404);
    userId = other.id;
    isOwn = me?.id === other.id;
  } else {
    if (!me) {
      try { await requireUser(); } catch (e) {
        return apiError((e as AuthError).code ?? "WALLET_NOT_CONNECTED", "Connect your wallet first.", 401);
      }
      return apiError("WALLET_NOT_CONNECTED", "Connect your wallet first.", 401);
    }
    userId = me.id;
    isOwn = true;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { reputation: true, streak: true },
  });
  if (!user) return apiError("UNKNOWN_USER", "Profile not found.", 404);
  const rep = user.reputation ?? {
    bountiesPosted: 0, bountiesFunded: 0, bountiesPaid: 0, completed: 0,
    submitted: 0, approvals: 0, earned: "0", paid: "0",
    disputesOpened: 0, disputesAgainst: 0, disputesLost: 0,
  };
  const earned = rep.earned.toString();
  const paid = rep.paid.toString();
  const profile = {
    walletAddress: user.walletAddress,
    displayName: user.displayName,
    hunterName: hunterTitle(rep.completed),
    level: getLevel(rep.completed),
    approvalRate: getApprovalRate(rep.approvals, rep.submitted),
    streak: user.streak ? { current: user.streak.current, longest: user.streak.longest } : { current: 0, longest: 0 },
    worker: { completed: rep.completed, submitted: rep.submitted, approvals: rep.approvals, earned, disputesAgainst: rep.disputesAgainst, disputesLost: rep.disputesLost },
    creator: { posted: rep.bountiesPosted, funded: rep.bountiesFunded, paid: rep.bountiesPaid, spent: paid, disputesOpened: rep.disputesOpened },
    memberSince: user.createdAt.toISOString(),
  };
  if (!isOwn) return apiOk({ profile });
  const [activeWork, liveBounties, openDisputes] = await Promise.all([
    prisma.claim.count({ where: { workerId: userId, status: "ACTIVE" } }),
    prisma.bounty.count({ where: { creatorId: userId, status: { in: ["OPEN", "CLAIMED", "SUBMITTED", "REVISION_REQUESTED", "DISPUTED", "FUNDED", "FUNDING"] } } }),
    prisma.dispute.count({ where: { status: "OPEN", bounty: { OR: [{ creatorId: userId }, { claims: { some: { workerId: userId, status: "ACTIVE" } } }] } } }),
  ]);
  return apiOk({ profile, me: { activeWork, liveBounties, openDisputes } });
}

function hunterTitle(completed: number): string {
  if (completed >= 60) return "NimBty Legend";
  if (completed >= 30) return "Bounty Beast";
  if (completed >= 15) return "Task Hunter";
  if (completed >= 5) return "Bounty Rookie";
  if (completed >= 1) return "Earner";
  return "Bounty Hunter";
}
