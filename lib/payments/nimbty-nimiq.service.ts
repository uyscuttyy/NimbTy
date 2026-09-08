import type { Currency } from "@prisma/client";
import { requireEnv, env } from "@/lib/env";
import { NimiqRpc, RpcError, RpcUnavailableError, nimToLuna, lunaToNim, rpcUrlFor, normalizeTransaction } from "@/lib/nimiq/rpc";
import { networkIdFor, sameAddress, signPayout } from "@/lib/nimiq/keys";
import { prisma } from "@/lib/db";
import type {
  FundingRequest,
  PayoutResult,
  PaymentService,
  TransactionVerification,
} from "./types";

export class UnsupportedRailError extends Error {
  constructor(currency: string) {
    super(`UNSUPPORTED_RAIL: ${currency} payouts are not connected in this MVP (NIM rail only). Bounty stays locked — never silently converted.`);
    this.name = "UnsupportedRailError";
  }
}

/**
 * Real Nimiq payment service (Phase 2, extended Phase 8).
 * - Funding is verified ON-CHAIN: recipient + Luna value + memo + block inclusion,
 *   either by explicit tx hash or by scanning the escrow address (autodetect).
 * - Payouts are signed LOCALLY with the testnet escrow key and relayed via RPC.
 * - Anything unverifiable stays PENDING. Nothing is ever faked.
 */
export class NimbtyNimiqService implements PaymentService {
  getEscrowAddress(): string {
    return requireEnv("ESCROW_ACCOUNT_ADDRESS");
  }

  private rpc(): NimiqRpc {
    return new NimiqRpc(rpcUrlFor(env.NIMIQ_NETWORK));
  }

  async createFundingRequest(input: {
    bountyId: string;
    publicId: string;
    amount: string;
    currency: Currency;
  }): Promise<FundingRequest> {
    if (input.currency !== "NIM") throw new UnsupportedRailError(input.currency);
    return {
      bountyId: input.bountyId,
      publicId: input.publicId,
      payTo: this.getEscrowAddress(),
      amount: input.amount,
      currency: input.currency,
      memo: `nimbty:${input.publicId}`,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };
  }

  async verifyTransaction(input: {
    request: FundingRequest;
    txHash?: string;
    verifySender?: string;
  }): Promise<TransactionVerification> {
    const { request } = input;
    if (request.currency !== "NIM") throw new UnsupportedRailError(request.currency);
    let txHash = input.txHash;
    if (!txHash) {
      const found = await this.findFundingTransaction(request, input.verifySender);
      if (!found) {
        return { verified: false, amountOk: false, recipientOk: false, sender: "" };
      }
      txHash = found;
    }
    const rpc = this.rpc(); // throws RpcUnavailableError when unconfigured
    const raw = await rpc.getTransactionByHash(txHash);
    if (!raw) {
      return { verified: false, amountOk: false, recipientOk: false, sender: "", txHash };
    }
    const tx = normalizeTransaction(raw);
    const recipientOk = sameAddress(tx.recipient, request.payTo);
    const amountOk = tx.valueLuna === nimToLuna(request.amount);
    const memoOk = tx.memoText.includes(request.memo);
    const included = tx.blockNumber !== null;
    return {
      verified: recipientOk && amountOk && memoOk && included,
      amountOk: amountOk && memoOk,
      recipientOk,
      sender: tx.sender,
      txHash,
      blockHeight: tx.blockNumber ?? undefined,
    };
  }

  /**
   * Autodetect: scan recent escrow txs for one matching amount + memo
   * (+ sender when known). Lets creators pay from any wallet app, no hash paste.
   */
  async findFundingTransaction(request: FundingRequest, sender?: string): Promise<string | null> {
    if (request.currency !== "NIM") throw new UnsupportedRailError(request.currency);
    const rpc = this.rpc();
    const expected = nimToLuna(request.amount);
    const recent = await rpc.getTransactionsByAddress(request.payTo, 25);
    // Newest first when the node orders that way; prefer confirmed txs.
    const sorted = [...recent].sort((a, b) => (b.blockNumber ?? 0) - (a.blockNumber ?? 0));
    for (const raw of sorted) {
      const tx = normalizeTransaction(raw);
      if (tx.blockNumber === null) continue;
      if (!sameAddress(tx.recipient, request.payTo)) continue;
      if (tx.valueLuna !== expected) continue;
      if (!tx.memoText.includes(request.memo)) continue;
      if (sender && !sameAddress(tx.sender, sender)) continue;
      return tx.hash;
    }
    return null;
  }

  async lockReward(_bountyId: string, paymentId: string): Promise<void> {
    await prisma.payment.update({
      where: { id: paymentId },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    });
  }

  async releaseToWorker(bountyId: string, to: string): Promise<PayoutResult> {
    return this.payout(bountyId, to, "WORKER_PAYOUT");
  }

  async refundCreator(bountyId: string, to: string): Promise<PayoutResult> {
    return this.payout(bountyId, to, "CREATOR_REFUND");
  }

  private async payout(bountyId: string, to: string, kind: "WORKER_PAYOUT" | "CREATOR_REFUND"): Promise<PayoutResult> {
    const bounty = await prisma.bounty.findUnique({ where: { id: bountyId } });
    if (!bounty) throw new Error(`PAYOUT_UNKNOWN_BOUNTY: ${bountyId}`);
    if (bounty.currency !== "NIM") throw new UnsupportedRailError(bounty.currency);

    const valueLuna = nimToLuna(bounty.rewardAmount.toString());
    const rpc = this.rpc();
    const head = await rpc.getBlockNumber();
    const perByte = await rpc.getMinFeePerByte();
    const feeLuna = BigInt(Math.max(138, perByte * 300));

    const escrow = this.getEscrowAddress();
    const account = await rpc.getAccountByAddress(escrow);
    if (account && BigInt(account.balance) < valueLuna + feeLuna) {
      throw new RpcError("INSUFFICIENT_ESCROW", `Escrow holds ${lunaToNim(account.balance)} NIM, needs ${lunaToNim(valueLuna + feeLuna)}. Payout job will retry after top-up.`);
    }

    const signed = signPayout({
      escrowPrivateKeyHex: requireEnv("ESCROW_ACCOUNT_PRIVATE_KEY"),
      toAddress: to,
      valueLuna,
      feeLuna,
      validityStartHeight: head,
      networkId: networkIdFor(env.NIMIQ_NETWORK),
      memo: `nimbty:${bounty.publicId}:${kind === "WORKER_PAYOUT" ? "pay" : "refund"}`,
    });
    const hash = await rpc.sendRawTransaction(signed.rawHex);
    return { txHash: hash, status: "BROADCAST" };
  }
}

export const paymentService = new NimbtyNimiqService();
export { RpcUnavailableError };
