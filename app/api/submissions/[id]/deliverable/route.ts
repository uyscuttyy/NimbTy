import { prisma } from "@/lib/db";
import { requireUser, AuthError } from "@/lib/auth/session";
import { apiError, apiOk } from "@/lib/api/route-helpers";

/**
 * Protected final deliverable (spec §10).
 * Served ONLY when the bounty reached PAID or WORKER_PAID — never on
 * CREATOR_REFUNDED, never during DISPUTED. Frontend hiding is not security;
 * this gate is the security.
 */
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
    include: { bounty: { select: { creatorId: true, status: true, publicId: true } } },
  });
  if (!s) return apiError("INVALID_SUBMISSION", "That submission doesn't exist.", 404);
  if (s.bounty.creatorId !== user.id && s.workerId !== user.id)
    return apiError("UNAUTHORIZED_ACTION", "Only the creator and worker can access this.", 403);
  if (s.bounty.status !== "PAID" && s.bounty.status !== "WORKER_PAID")
    return apiError("DELIVERABLE_LOCKED", "The final deliverable unlocks only when the worker is paid.", 403, { bountyStatus: s.bounty.status });
  if (!s.finalDeliverable) return apiError("NO_DELIVERABLE", "No protected deliverable was attached.", 404);
  return apiOk({ deliverable: s.finalDeliverable });
}
