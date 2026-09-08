import { NextResponse } from "next/server";
import { isValidNimiqAddressFormat, normalizeWalletAddress } from "@/lib/auth/address";
import { issueNonce, purgeStaleNonces } from "@/lib/auth/nonce";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null) as { walletAddress?: string } | null;
    const addr = normalizeWalletAddress(body?.walletAddress ?? "");
    if (!isValidNimiqAddressFormat(addr)) {
      return NextResponse.json({ ok: false, code: "INVALID_ADDRESS", message: "Expected a Nimiq address like NQ07 …" }, { status: 400 });
    }
    purgeStaleNonces().catch(() => {}); // best-effort cleanup
    const { nonce, message, expiresAt } = await issueNonce(addr);
    return NextResponse.json({ ok: true, walletAddress: addr, nonce, message, expiresAt });
  } catch {
    return NextResponse.json({ ok: false, code: "NONCE_FAILED", message: "Could not start sign-in. Try again." }, { status: 500 });
  }
}
