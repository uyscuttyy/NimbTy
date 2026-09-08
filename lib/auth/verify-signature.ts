import { createPublicKey, verify as cryptoVerify } from "node:crypto";

// Standard 12-byte SPKI prefix for Ed25519 public keys (Node needs DER).
const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/**
 * Ed25519 verification of `message` given a raw 32-byte pubkey + 64-byte signature (hex).
 * Nimiq keys/signatures ARE Ed25519 — this verifier serves BOTH the Nimiq Hub adapter
 * and the dev adapter. Isolated here so Phase 2 can swap in @nimiq/core Address.fromPublicKey
 * for strict address↔pubkey binding without touching any route.
 */
export function verifyEd25519Signature(message: string, pubKeyHex: string, sigHex: string): boolean {
  try {
    const pub = Buffer.from(pubKeyHex, "hex");
    const sig = Buffer.from(sigHex, "hex");
    if (pub.length !== 32 || sig.length !== 64) return false;
    const key = createPublicKey({
      key: Buffer.concat([SPKI_ED25519_PREFIX, pub]),
      format: "der",
      type: "spki",
    });
    return cryptoVerify(null, Buffer.from(message, "utf8"), key, sig);
  } catch {
    return false;
  }
}
