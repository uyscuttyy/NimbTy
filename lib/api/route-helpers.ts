import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import type { Bounty, User } from "@prisma/client";

export function apiError(code: string, message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, code, message, ...extra }, { status });
}

export function apiOk<T extends Record<string, unknown>>(data: T, status = 200) {
  return NextResponse.json({ ok: true, ...data }, { status });
}

type BountyWithCreator = Bounty & { creator: Pick<User, "walletAddress" | "displayName"> };

/** Public-safe bounty JSON. Decimals → strings; no secrets ever. */
export function serializeBounty(b: BountyWithCreator) {
  return {
    id: b.id,
    publicId: b.publicId,
    title: b.title,
    description: b.description,
    rewardAmount: b.rewardAmount.toString(),
    currency: b.currency,
    deadlineAt: b.deadlineAt.toISOString(),
    reviewHours: b.reviewHours,
    status: b.status,
    escrowLocked: ["FUNDED", "OPEN", "CLAIMED", "SUBMITTED", "REVISION_REQUESTED", "DISPUTED"].includes(b.status),
    fundingTxHash: b.fundingTxHash,
    fundedAt: b.fundedAt?.toISOString() ?? null,
    settledAt: b.settledAt?.toISOString() ?? null,
    createdAt: b.createdAt.toISOString(),
    creatorWallet: b.creator.walletAddress,
    creatorName: b.creator.displayName,
  };
}

/** Short URL-safe public id, e.g. n3f9kq2x. Uniqueness enforced by caller/DB. */
export function generatePublicId(): string {
  return "n" + randomBytes(5).toString("base64url").slice(0, 7).toLowerCase();
}
