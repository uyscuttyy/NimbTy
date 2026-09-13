/**
 * Key/address utilities backed by the real @nimiq/core (Node/WASM build).
 * Lazy eval-require keeps Next from statically bundling the WASM at build time.
 * Network IDs verified against core-rs-albatrossactoring primitives/src/networks.rs:
 * TestAlbatross = 5, MainAlbatross = 24.
 */
import { addressFromPublicKeyHexPure } from "./address";

export const NETWORK_IDS = { testnet: 5, mainnet: 24 } as const;

export function networkIdFor(network: string): number {
  const override = parseInt(process.env.NIMIQ_NETWORK_ID ?? "", 10);
  if (Number.isInteger(override)) return override;
  return network === "mainnet" ? NETWORK_IDS.mainnet : NETWORK_IDS.testnet;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let N: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function nimiq(): any {
  if (N) return N;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const req = eval("require") as NodeRequire;
  N = req("@nimiq/core");
  return N;
}

/** Derive the NQ address that owns an Ed25519 public key (32-byte hex).
 * Pure-JS implementation (see ./address) — no WASM, works on cold serverless.
 * Previously verified against @nimiq/core KeyPair.toAddress(): address = first
 * 20 bytes of Blake2b-256(pubkey). (Address.fromPublicKeys in @nimiq/core 2.21
 * ignores its input — do NOT use it.) */
export function addressFromPublicKeyHex(pubKeyHex: string): string {
  return addressFromPublicKeyHexPure(pubKeyHex);
}

/** IBAN-mod97 checksum over an NQ address (spaces ignored, case-insensitive). */
export function isValidNimiqAddress(address: string): boolean {
  const a = address.replace(/[\s-]/g, "").toUpperCase();
  if (!/^NQ[0-9]{2}[0-9A-Z]{32}$/.test(a)) return false;
  const rearranged = a.slice(4) + a.slice(0, 4);
  let remainder = "";
  for (const ch of rearranged) {
    const code = ch >= "0" && ch <= "9" ? ch : String(ch.charCodeAt(0) - 55);
    remainder = (BigInt(remainder + code) % 97n).toString();
  }
  return remainder === "1";
}

export function sameAddress(a: string, b: string): boolean {
  return a.replace(/\s+/g, "").toUpperCase() === b.replace(/\s+/g, "").toUpperCase();
}

export interface SignedPayout {
  txHash: string;
  rawHex: string;
  valueLuna: bigint;
  feeLuna: bigint;
  validityStartHeight: number;
  networkId: number;
}

/**
 * Build + sign an escrow payout OFFLINE (no consensus needed for signing).
 * Relaying happens separately via RPC sendRawTransaction.
 */
export function signPayout(input: {
  escrowPrivateKeyHex: string;
  toAddress: string;
  valueLuna: bigint;
  feeLuna: bigint;
  validityStartHeight: number;
  networkId: number;
  memo: string;
}): SignedPayout {
  const n = nimiq();
  const kp = n.KeyPair.derive(n.PrivateKey.fromHex(input.escrowPrivateKeyHex));
  const sender = kp.toAddress();
  const recipient = n.Address.fromUserFriendlyAddress(input.toAddress);
  const data = new Uint8Array(Buffer.from(input.memo, "utf8"));
  const tx = n.TransactionBuilder.newBasicWithData(
    sender, recipient, data, input.valueLuna, input.feeLuna,
    input.validityStartHeight, input.networkId,
  );
  kp.signTransaction(tx);
  const hash: string = tx.hash();
  return {
    txHash: hash.toUpperCase().startsWith("0X") ? hash : hash,
    rawHex: tx.toHex(),
    valueLuna: input.valueLuna,
    feeLuna: input.feeLuna,
    validityStartHeight: input.validityStartHeight,
    networkId: input.networkId,
  };
}
