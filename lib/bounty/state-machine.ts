import { Prisma, BountyStatus } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export const TERMINAL: ReadonlySet<BountyStatus> = new Set([
  BountyStatus.PAID,
  BountyStatus.WORKER_PAID,
  BountyStatus.CREATOR_REFUNDED,
  BountyStatus.EXPIRED_REFUNDED,
  BountyStatus.CANCELLED,
]);

/**
 * The ONLY legal transitions (spec §6).
 * API handlers derive the target from user INTENT; the client
 * can never pass a status value. All transitions are validated here.
 */
export const ALLOWED_TRANSITIONS: Record<BountyStatus, ReadonlySet<BountyStatus>> = {
  [BountyStatus.DRAFT]:              new Set([BountyStatus.FUNDING, BountyStatus.CANCELLED]),
  [BountyStatus.FUNDING]:            new Set([BountyStatus.FUNDED, BountyStatus.DRAFT]),
  [BountyStatus.FUNDED]:             new Set([BountyStatus.OPEN]),
  [BountyStatus.OPEN]:               new Set([BountyStatus.CLAIMED, BountyStatus.EXPIRED_REFUNDED]),
  [BountyStatus.CLAIMED]:            new Set([BountyStatus.SUBMITTED, BountyStatus.EXPIRED_REFUNDED]),
  [BountyStatus.SUBMITTED]:          new Set([BountyStatus.PAID, BountyStatus.REVISION_REQUESTED, BountyStatus.DISPUTED]),
  [BountyStatus.REVISION_REQUESTED]: new Set([BountyStatus.SUBMITTED, BountyStatus.EXPIRED_REFUNDED]),
  [BountyStatus.DISPUTED]:           new Set([BountyStatus.WORKER_PAID, BountyStatus.CREATOR_REFUNDED]),
  [BountyStatus.PAID]:               new Set(),
  [BountyStatus.WORKER_PAID]:        new Set(),
  [BountyStatus.CREATOR_REFUNDED]:   new Set(),
  [BountyStatus.EXPIRED_REFUNDED]:   new Set(),
  [BountyStatus.CANCELLED]:          new Set(),
};

export class TransitionError extends Error {
  constructor(public from: BountyStatus, public to: BountyStatus) {
    super(`Illegal bounty transition ${from} -> ${to}`);
    this.name = "TransitionError";
  }
}

export function assertTransition(from: BountyStatus, to: BountyStatus): void {
  if (!ALLOWED_TRANSITIONS[from]?.has(to)) throw new TransitionError(from, to);
}

/**
 * Atomic optimistic transition — the race-safe primitive used for
 * claims (exactly one claimer), review actions and dispute resolution.
 * Returns whether THIS caller won the transition.
 */
export async function tryTransition(
  tx: Tx,
  bountyId: string,
  from: BountyStatus,
  to: BountyStatus,
  extraData: Prisma.BountyUpdateInput = {},
): Promise<boolean> {
  assertTransition(from, to);
  const res = await tx.bounty.updateMany({
    where: { id: bountyId, status: from },
    data: { status: to, ...extraData },
  });
  return res.count === 1;
}
