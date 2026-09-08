import { NextResponse } from "next/server";
import { isValidNimiqAddressFormat, normalizeWalletAddress } from "@/lib/auth/address";
import { buildSignMessage, consumeNonce } from "@/lib/auth/nonce";
import { verifyEd25519Signature } from "@/lib/auth/verify-signature";
import { createSessionToken, setSessionCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null) as {
      walletAddress?: string; nonce?: string; signatureHex?: string; pubKeyHex?: string;
    } | null;
    if (!body) return NextResponse.json({ ok: false, code: "INVALID_BODY", message: "Malformed request." }, { status: 400 });

    const addr = normalizeWalletAddress(body.walletAddress ?? "");
    if (!isValidNimiqAddressFormat(addr))
      return NextResponse.json({ ok: false, code: "INVALID_ADDRESS", message: "Invalid Nimiq address." }, { status: 400 });

    // 1) Burn the nonce BEFORE verifying the signature → a bad signature can never be replayed.
    const consumed = await consumeNonce(body.nonce ?? "", addr);
    if (!consumed)
      return NextResponse.json({ ok: false, code: "NONCE_INVALID", message: "Sign-in attempt expired. Please connect again." }, { status: 400 });

    if (!body.signatureHex || !body.pubKeyHex)
      return NextResponse.json({ ok: false, code: "VERIFICATION_UNSUPPORTED", message: "Wallet did not return a public key. Signature verification is impossible without it." }, { status: 400 });

    // 2) Real cryptographic check (Ed25519) over the exact server-issued message.
    const valid = verifyEd25519Signature(buildSignMessage(addr, body.nonce ?? ""), body.pubKeyHex, body.signatureHex);
    if (!valid)
      return NextResponse.json({ ok: false, code: "SIGNATURE_INVALID", message: "Signature check failed. Nothing was signed correctly." }, { status: 401 });

    // 2b) Address↔pubkey binding: the key that signed must OWN the stated Nimiq address.
    // Dev wallets (throwaway keys, free-picked addresses) bypass only when explicitly allowed.
    if (process.env.ALLOW_UNVERIFIED_WALLET_LOGIN !== "true") {
      let bound: string | null = null;
      try {
        const { addressFromPublicKeyHex } = await import("@/lib/nimiq/keys");
        bound = addressFromPublicKeyHex(body.pubKeyHex);
      } catch {
        bound = null;
      }
      if (!bound || normalizeWalletAddress(bound) !== addr)
        return NextResponse.json({ ok: false, code: "ADDRESS_KEY_MISMATCH", message: "That key does not own this address. Sign with the address's own wallet." }, { status: 401 });
    }

    // 3) Wallet = identity. First sign-in creates the User (spec §30/§31).
    const user = await prisma.user.upsert({
      where: { walletAddress: addr },
      create: { walletAddress: addr },
      update: {},
      select: { id: true, walletAddress: true, displayName: true },
    });
    // Ensure 1:1 engagement rows exist so profile/reputation endpoints are stable.
    await prisma.reputation.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} });
    await prisma.streak.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} });

    await setSessionCookie(createSessionToken(user.id, user.walletAddress));
    return NextResponse.json({ ok: true, user });
  } catch (e) {
    console.error("auth/verify failed", e);
    return NextResponse.json({ ok: false, code: "VERIFY_FAILED", message: "Sign-in failed unexpectedly. Try again." }, { status: 500 });
  }
}
