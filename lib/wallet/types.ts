export type WalletAdapterId = "hub" | "dev" | "pay";

export interface SignedChallenge {
  walletAddress: string;
  message: string;
  signatureHex: string;
  pubKeyHex: string;
}

export interface WalletAdapter {
  id: WalletAdapterId;
  label: string;
  isAvailable(): boolean;
  /** Resolve the user's Nimiq address (no key access, ever — spec §31). */
  connect(): Promise<{ walletAddress: string }>;
  /** Sign the EXACT server-issued challenge message. */
  sign(message: string, walletAddress: string): Promise<SignedChallenge>;
}

export type WalletErrorCode =
  | "WALLET_UNAVAILABLE" | "WALLET_REJECTED" | "SIGNATURE_REJECTED"
  | "ED25519_UNSUPPORTED" | "INVALID_ADDRESS_INPUT" | "PAY_MODE_PHASE_2";

export class WalletError extends Error {
  constructor(public code: WalletErrorCode, message: string) { super(message); }
}

export function toHex(b: Uint8Array): string {
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}
