import { prisma } from "@/lib/db";
import { requireUser, AuthError } from "@/lib/auth/session";
import { tryTransition } from "@/lib/bounty/state-machine";
import { apiError, apiOk } from "@/lib/api/route-helpers";

const PROOF_TYPES = ["TEXT", "LINK", "IMAGE", "FILE"] as const;
type ProofItem = { type: (typeof PROOF_TYPES)[number]; text?: string; url?: string; label?: string };

function validateProof(items: unknown): { ok: boolean; message?: string; value?: ProofItem[] } {
  if (!Array.isArray(items) || items.length === 0 || items.length > 20)
    return { ok: false, message: "Add 1–20 proof items (text, links, images, files)." };
  const out: ProofItem[] = [];
  for (const raw of items) {
    const it = raw as Record<string, unknown>;
    if (!it || !PROOF_TYPES.includes(it.type as (typeof PROOF_TYPES)[number]))
      return { ok: false, message: "Each proof item needs a valid type (TEXT/LINK/IMAGE/FILE)." };
    const type = it.type as ProofItem["type"];
    if (type === "TEXT") {
      const text = String(it.text ?? "").trim();
      if (text.length < 3 || text.length > 2000) return { ok: false, message: "Proof text must be 3–2000 chars." };
      out.push({ type, text });
    } else {
      const url = String(it.url ?? "").trim();
      if (!/^https?:\/\/\S{4,2000}$/.test(url)) return { ok: false, message: `${type} proof needs a valid https:// URL.` };
      const label = String(it.label ?? "").trim().slice(0, 120);
      out.push({ type, url, ...(label ? { label } : {}) });
    }
  }
  return { ok: true, value: out };
}

/**
 * Submit work — worker only. CLAIMED→SUBMITTED or REVISION_REQUESTED→SUBMITTED.
 * Starts the on-chain-timestamped review window; money stays locked.
 */
export async function POST(req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return apiError((e as AuthError).code ?? "WALLET_NOT_CONNECTED", "Connect your wallet first.", 401);
  }
  const { publicId } = await params;
  const bounty = await prisma.bounty.findUnique({
    where: { publicId },
    include: { claims: { where: { workerId: user.id, status: "ACTIVE" }, take: 1 } },
  });
  if (!bounty) return apiError("INVALID_BOUNTY", "That bounty doesn't exist.", 404);
  if (bounty.status !== "CLAIMED" && bounty.status !== "REVISION_REQUESTED")
    return apiError("INVALID_STATE", `This bounty is ${bounty.status} — nothing to submit.`, 409);
  const claim = bounty.claims[0];
  if (!claim) return apiError("NOT_YOUR_WORK", "Only the worker who claimed this bounty can submit.", 403);
  if (bounty.deadlineAt.getTime() <= Date.now())
    return apiError("WORK_EXPIRED", "The deadline passed before submission. The escrow will refund the creator.", 410);

  const body = (await req.json().catch(() => null)) as {
    summary?: string; proofItems?: unknown; finalDeliverable?: unknown;
  } | null;
  if (!body) return apiError("INVALID_BODY", "Malformed request.", 400);
  const summary = (body.summary ?? "").trim();
  if (summary.length < 10 || summary.length > 2000)
    return apiError("INVALID_SUMMARY", "Say what you completed (10–2000 chars).", 400);
  const proof = validateProof(body.proofItems);
  if (!proof.ok) return apiError("INVALID_PROOF", proof.message ?? "Invalid proof.", 400);

  // finalDeliverable is PROTECTED (spec §10): stored, never listed, served only
  // through the gated deliverable endpoint after PAID/WORKER_PAID.
  let finalDeliverable: ProofItem[] | null = null;
  if (body.finalDeliverable !== undefined && body.finalDeliverable !== null) {
    const fd = validateProof(body.finalDeliverable);
    if (!fd.ok) return apiError("INVALID_DELIVERABLE", `Final deliverable: ${fd.message}`, 400);
    finalDeliverable = fd.value ?? null;
  }

  try {
    const reviewDeadlineAt = new Date(Date.now() + bounty.reviewHours * 3600 * 1000);
    const result = await prisma.$transaction(async (tx) => {
      const from = bounty.status as "CLAIMED" | "REVISION_REQUESTED";
      const won = await tryTransition(tx, bounty.id, from, "SUBMITTED");
      if (!won) return null;
      const count = await tx.submission.count({ where: { bountyId: bounty.id } });
      const submission = await tx.submission.create({
        data: {
          bountyId: bounty.id, claimId: claim.id, workerId: user.id,
          summary, proofItems: proof.value as object,
          ...(finalDeliverable ? { finalDeliverable: finalDeliverable as object } : {}),
          revisionNumber: count, status: "PENDING_REVIEW", reviewDeadlineAt,
        },
      });
      await tx.settlementJob.deleteMany({ where: { bountyId: bounty.id, kind: "REVIEW_EXPIRED", status: "QUEUED" } });
      await tx.settlementJob.create({
        data: {
          bountyId: bounty.id, kind: "REVIEW_EXPIRED",
          payload: { submissionId: submission.id },
          runAt: reviewDeadlineAt,
        },
      });
      await tx.reputation.update({
        where: { userId: user.id },
        data: { submitted: { increment: 1 } },
      });
      return submission;
    });
    if (!result) return apiError("STATE_CHANGED", "Bounty changed under you — refresh.", 409);
    return apiOk({
      submission: {
        id: result.id, status: result.status, revisionNumber: result.revisionNumber,
        reviewDeadlineAt: result.reviewDeadlineAt.toISOString(),
        submittedAt: result.submittedAt.toISOString(),
      },
    }, 201);
  } catch (e) {
    console.error("bounty/submit failed", e);
    return apiError("SUBMIT_FAILED", "Could not submit your work.", 500);
  }
}
