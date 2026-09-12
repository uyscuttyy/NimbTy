import { prisma } from "@/lib/db";
import { requireUser, AuthError } from "@/lib/auth/session";
import { tryTransition } from "@/lib/bounty/state-machine";
import { paymentService } from "@/lib/payments/nimbTy-nimiq.service";
import { RpcUnavailableError } from "@/lib/nimiq/rpc";
import { apiError, apiOk, serializeBounty } from "@/lib/api/route-helpers";

const FUNDING_WINDOW_MS = 35 * 60 * 1000;

/**
 * Two-step real funding (spec §17/§18):
 * 1) POST {} → DRAFT→FUNDING, returns {payTo, amount, memo} for the wallet.
 * 2) User pays on-chain, then POST {txHash} → verified on-chain → FUNDED→OPEN.
 * Unverifiable funding stays FUNDING. Nothing is ever assumed.
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
    include: { creator: { select: { walletAddress: true, displayName: true } } },
  });
  if (!bounty) return apiError("INVALID_BOUNTY", "That bounty doesn't exist.", 404);
  if (bounty.creatorId !== user.id) return apiError("UNAUTHORIZED_ACTION", "Only the creator can fund this bounty.", 403);

  const body = (await req.json().catch(() => ({}))) as { txHash?: string; detect?: boolean };
  const txHash = (body.txHash ?? "").trim() || undefined;
  const detect = body.detect === true;

  try {
    // ── Step 1: open the funding window ──
    if (!txHash && !detect) {
      // Resume: the window is already open (e.g. user paid in-app but the
      // confirm didn't finish) — hand back the same payment details.
      if (bounty.status === "FUNDING") {
        const pending = await prisma.payment.findFirst({
          where: { bountyId: bounty.id, kind: "ESCROW_FUNDING", status: "PENDING" },
          orderBy: { createdAt: "desc" },
        });
        if (pending) {
          const existing = await paymentService.createFundingRequest({
            bountyId: bounty.id, publicId: bounty.publicId,
            amount: bounty.rewardAmount.toString(), currency: bounty.currency,
          });
          return apiOk({ funding: existing, paymentId: pending.id, resumed: true });
        }
      }
      if (bounty.status !== "DRAFT")
        return apiError("INVALID_STATE", `Funding can't start from ${bounty.status}. Refresh the page and continue where you left off.`, 409);
      let escrow: string;
      try {
        escrow = paymentService.getEscrowAddress();
      } catch {
        return apiError("ESCROW_UNCONFIGURED", "Escrow is not configured on this server.", 500);
      }
      const result = await prisma.$transaction(async (tx) => {
        const won = await tryTransition(tx, bounty.id, "DRAFT", "FUNDING");
        if (!won) return null;
        const payment = await tx.payment.create({
          data: {
            bountyId: bounty.id, kind: "ESCROW_FUNDING",
            sender: bounty.creator.walletAddress, recipient: escrow,
            amount: bounty.rewardAmount, currency: bounty.currency, status: "PENDING",
          },
        });
        await tx.settlementJob.create({
          data: {
            bountyId: bounty.id, kind: "FUNDING_EXPIRED",
            payload: { paymentId: payment.id },
            runAt: new Date(Date.now() + FUNDING_WINDOW_MS),
          },
        });
        return payment;
      });
      if (!result) return apiError("STATE_CHANGED", "Bounty changed under you — refresh and try again.", 409);
      const request = await paymentService.createFundingRequest({
        bountyId: bounty.id, publicId: bounty.publicId,
        amount: bounty.rewardAmount.toString(), currency: bounty.currency,
      });
      return apiOk({ funding: request, paymentId: result.id }, 201);
    }

    // ── Step 2: confirm the on-chain payment ──
    if (bounty.status === "OPEN" || bounty.status === "FUNDED") {
      return apiOk({ bounty: serializeBounty(bounty), alreadyLive: true });
    }
    if (bounty.status !== "FUNDING")
      return apiError("INVALID_STATE", `Nothing to confirm (now ${bounty.status}).`, 409);

    const payment = await prisma.payment.findFirst({
      where: { bountyId: bounty.id, kind: "ESCROW_FUNDING", status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
    if (!payment) return apiError("PAYMENT_MISSING", "No pending funding found.", 409);

    const request = await paymentService.createFundingRequest({
      bountyId: bounty.id, publicId: bounty.publicId,
      amount: bounty.rewardAmount.toString(), currency: bounty.currency,
    });
    let v;
    try {
      // Autodetect: creator paid from any wallet app — server finds the tx.
      // verifySender binds the match to the creator's wallet either way.
      v = await paymentService.verifyTransaction({ request, txHash, verifySender: bounty.creator.walletAddress });
    } catch (e) {
      if (e instanceof RpcUnavailableError)
        return apiError("RPC_UNAVAILABLE", "Can't reach the chain right now — your funding stays reserved, retry shortly.", 503);
      throw e;
    }
    if (!v.verified && !txHash && detect)
      return apiError("FUNDING_NOT_FOUND", "No matching payment found at the escrow address yet. Pay first, wait for confirmation, then retry.", 422);
    if (!v.verified) {
      // Sender binding covers HTLC-routed Nimiq Pay payments via relatedAddresses.
      if (!v.senderOk)
        return apiError("FUNDING_WRONG_SENDER", "That transaction wasn't sent from your wallet.", 422);
      return apiError("FUNDING_UNVERIFIED", "That transaction doesn't match this bounty yet (wrong amount, recipient, memo, or not yet mined).", 422,
        { amountOk: v.amountOk, recipientOk: v.recipientOk, blockHeight: v.blockHeight ?? null });
    }

    const confirmedHash = txHash ?? v.txHash;
    if (!confirmedHash) return apiError("FUNDING_UNVERIFIED", "No transaction to confirm.", 422);

    const updated = await prisma.$transaction(async (tx) => {
      const toFunded = await tryTransition(tx, bounty.id, "FUNDING", "FUNDED", {
        fundingTxHash: confirmedHash, fundedAt: new Date(),
      });
      if (!toFunded) return null;
      await tx.payment.update({
        where: { id: payment.id },
        data: { transactionHash: confirmedHash, status: "CONFIRMED", confirmedAt: new Date(), chainMeta: { blockHeight: v.blockHeight, sender: v.sender } },
      });
      await tx.settlementJob.deleteMany({ where: { bountyId: bounty.id, kind: "FUNDING_EXPIRED", status: "QUEUED" } });
      // FUNDED→OPEN is automatic once money is verified (spec §18).
      await tryTransition(tx, bounty.id, "FUNDED", "OPEN");
      await tx.reputation.update({
        where: { userId: user.id },
        data: { bountiesFunded: { increment: 1 }, paid: { increment: bounty.rewardAmount } },
      });
      return tx.bounty.findUnique({
        where: { id: bounty.id },
        include: { creator: { select: { walletAddress: true, displayName: true } } },
      });
    });
    if (!updated) return apiError("STATE_CHANGED", "Bounty changed under you — refresh.", 409);
    return apiOk({ bounty: serializeBounty(updated), live: true });
  } catch (e) {
    if (e instanceof RpcUnavailableError)
      return apiError("RPC_UNAVAILABLE", "Can't reach the chain right now — retry shortly.", 503);
    console.error("bounty/fund failed", e);
    return apiError("FUND_FAILED", "Funding failed unexpectedly.", 500);
  }
}
