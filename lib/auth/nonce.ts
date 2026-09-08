import { prisma } from "@/lib/db";
import { randomBytes } from "node:crypto";

const NONCE_TTL_MS = 10 * 60 * 1000;

// Deterministic message: server regenerates it from stored nonce —
// the client never gets to define what is signed (spec §36).
export function buildSignMessage(walletAddress: string, nonce: string): string {
  return [
    "Sign in to NimBty",
    `Wallet: ${walletAddress}`,
    `Nonce: ${nonce}`,
    "This signature proves wallet ownership. It moves no funds.",
  ].join("\n");
}

export async function issueNonce(walletAddress: string) {
  const nonce = randomBytes(16).toString("hex");
  const row = await prisma.authNonce.create({
    data: { walletAddress, nonce, expiresAt: new Date(Date.now() + NONCE_TTL_MS) },
  });
  return { nonce, message: buildSignMessage(walletAddress, nonce), expiresAt: row.expiresAt };
}

/** Single-use, race-safe consumption. Returns false if used/expired/unknown. */
export async function consumeNonce(nonce: string, walletAddress: string): Promise<boolean> {
  const res = await prisma.authNonce.updateMany({
    where: { nonce, walletAddress, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  return res.count === 1;
}

export async function purgeStaleNonces() {
  await prisma.authNonce.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 24 * 3600 * 1000) } } });
}
