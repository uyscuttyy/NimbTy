import { createPublicKey, verify as cryptoVerify, createHash } from "node:crypto";
import { blake2b } from "@noble/hashes/blake2.js";

// Standard 12-byte SPKI prefix for Ed25519 public keys (Node needs DER).
const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

// Keyguard ground truth (client/src/SignMessagePrefix.ts):
// SIGNED_MESSAGE signs prefix + message; CONNECT_CHALLENGE is the distinct
// prefix for connect-style challenges (blind-signed). Nimiq Pay's native
// sign() encoding is unverified — so we try every encoding OF THE EXACT
// SERVER MESSAGE. Accepting multiple encodings is safe: all of them embed
// our nonce message, so nothing foreign can ever verify.
// eslint-disable-next-line no-control-regex
const SIGNED_PREFIX = "Nimiq Signed Message:\n";
// eslint-disable-next-line no-control-regex
const CONNECT_PREFIX = "Nimiq Connect Challenge:\n";

export const CANDIDATE_NAMES = [
  "raw",
  "signed-prefix",
  "signed-prefix+len",
  "connect-prefix",
  "connect-prefix+len",
  "blake2b(raw)",
  "blake2b(signed-prefix)",
  "blake2b(connect-prefix)",
  "sha256(raw)",
  "sha256(signed-prefix)",
  "sha256(signed-prefix+len) [Nimiq Pay native]",
];

function candidates(message: string): Buffer[] {
  const raw = Buffer.from(message, "utf8");
  const signed = Buffer.from(SIGNED_PREFIX + message, "utf8");
  const signedLen = Buffer.from(SIGNED_PREFIX + raw.length.toString() + message, "utf8");
  const connect = Buffer.from(CONNECT_PREFIX + message, "utf8");
  const connectLen = Buffer.from(CONNECT_PREFIX + raw.length.toString() + message, "utf8");
  return [
    raw,
    signed,
    signedLen,
    connect,
    connectLen,
    Buffer.from(blake2b(raw, { dkLen: 32 })),
    Buffer.from(blake2b(signed, { dkLen: 32 })),
    Buffer.from(blake2b(connect, { dkLen: 32 })),
    createHash("sha256").update(raw).digest(),
    createHash("sha256").update(signed).digest(),
    createHash("sha256").update(signedLen).digest(), // Nimiq Pay native sign()
  ];
}

/**
 * Ed25519 verification of `message` given a raw 32-byte pubkey + 64-byte signature (hex).
 * Returns the index into CANDIDATE_NAMES that verified, or -1 on failure.
 * Nimiq keys/signatures ARE Ed25519 — this verifier serves the Hub, Pay, and
 * dev adapters. Address↔pubkey binding lives in lib/nimiq/keys.
 */
export function verifyEd25519Signature(message: string, pubKeyHex: string, sigHex: string): number {
  try {
    const pub = Buffer.from(pubKeyHex, "hex");
    const sig = Buffer.from(sigHex, "hex");
    if (pub.length !== 32 || sig.length !== 64) return -1;
    const key = createPublicKey({
      key: Buffer.concat([SPKI_ED25519_PREFIX, pub]),
      format: "der",
      type: "spki",
    });
    const list = candidates(message);
    for (let i = 0; i < list.length; i++) {
      try {
        if (cryptoVerify(null, list[i], key, sig)) return i;
      } catch {
        continue;
      }
    }
    return -1;
  } catch {
    return -1;
  }
}
