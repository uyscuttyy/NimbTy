import { Currency } from "@prisma/client";

export interface FundingRequest {
  bountyId: string;
  publicId: string;
  payTo: string;
  amount: string;
  currency: Currency;
  memo: string;
  expiresAt: string;
}

export interface TransactionVerification {
  verified: boolean;
  amountOk: boolean;
  recipientOk: boolean;
  sender: string;
  txHash?: string;
  blockHeight?: number;
}

export interface PayoutResult {
  txHash: string;
  status: "BROADCAST" | "CONFIRMED" | "FAILED";
}

/**
 * Server-side financial authority (spec §32).
 * The product NEVER calls Nimiq directly — everything goes through here.
 */
export interface PaymentService {
  getEscrowAddress(): string;
  createFundingRequest(input: {
    bountyId: string;
    publicId: string;
    amount: string;
    currency: Currency;
  }): Promise<FundingRequest>;
  verifyTransaction(input: { request: FundingRequest; txHash?: string; verifySender?: string }): Promise<TransactionVerification>;
  findFundingTransaction(request: FundingRequest, sender?: string): Promise<string | null>;
  lockReward(bountyId: string, paymentId: string): Promise<void>;
  releaseToWorker(bountyId: string, to: string): Promise<PayoutResult>;
  refundCreator(bountyId: string, to: string): Promise<PayoutResult>;
}
