import { blake2b } from "@noble/hashes/blake2.js";
import { hexToBytes } from "@noble/hashes/utils.js";

/**
 * Pure-JS NQ address utilities (no @nimiq/core, no WASM — safe in browsers,
 * edge, and serverless cold starts where the core WASM may never initialize).
 * address = Blake2b-256(pubkey)[:20], Nimiq base32 + IBAN check digits.
 * Proven 5/5 against core KeyPair.toAddress().
 */
const NIMIQ_B32 = "0123456789ABCDEFGHJKLMNPQRSTUVXYZ";

function b32encode(bytes: Uint8Array): string {
  let out = "";
  let bits = 0;
  let acc = 0;
  for (const byte of bytes) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += NIMIQ_B32[(acc >>> bits) & 31];
    }
    acc &= (1 << bits) - 1;
  }
  if (bits > 0) out += NIMIQ_B32[(acc << (5 - bits)) & 31];
  return out;
}

function ibanValid(a: string): boolean {
  const r = a.slice(4) + a.slice(0, 4);
  let rem = 0;
  for (const ch of r) {
    const code = ch >= "0" && ch <= "9" ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of code) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}

/** Derive the NQ address (no spaces, uppercase) owning a 32-byte hex Ed25519 pubkey. */
export function addressFromPublicKeyHexPure(pubKeyHex: string): string {
  const digest = blake2b(hexToBytes(pubKeyHex), { dkLen: 32 }).slice(0, 20);
  const body = b32encode(digest);
  for (let c = 0; c < 100; c++) {
    const check = String(c).padStart(2, "0");
    if (ibanValid(`NQ${check}${body}`)) return `NQ${check}${body}`;
  }
  throw new Error("Could not derive an address from that key.");
}
