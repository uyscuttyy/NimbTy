import { createPublicKey, verify as cryptoVerify } from "node:crypto";

// Standard 12-byte SPKI prefix for Ed25519 public keys (Node needs DER).
const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

// Nimiq Hub/Keyguard may prefix signed messages (same family as Bitcoin-style
// "\u0016…Signed Message:\n" prefixes). The exact Hub encoding is a known
// uncertainty — so we try every encoding OF THE EXACT SERVER MESSAGE.
// Accepting multiple encodings is safe: all of them embed our nonce message,
// so nothing foreign can ever verify.
// eslint-disable-next-line no-control-regex
const HUB_PREFIX = "\u0016Nimiq Signed Message:\n";

function candidates(message: string): Buffer[] {
  const raw = Buffer.from(message, "utf8");
  return [
    raw,
    Buffer.from(HUB_PREFIX + message, "utf8"),
    Buffer.from(HUB_PREFIX + raw.length.toString() + message, "utf8"),
  ];
}

/**
 * Ed25519 verification of `message` given a raw 32-byte pubkey + 64-byte signature (hex).
 * Nimiq keys/signatures ARE Ed25519 — this verifier serves BOTH the Nimiq Hub adapter
 * and the dev adapter. Address↔pubkey binding lives in lib/nimiq/keys.
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
    return candidates(message).some((data) => {
      try {
        return cryptoVerify(null, data, key, sig);
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}
