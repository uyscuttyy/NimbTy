"use client";
import HubApi from "@nimiq/hub-api";
import type { WalletAdapter } from "./types";
import { WalletError, toHex } from "./types";

function hubEndpoint(): string {
  const custom = process.env.NEXT_PUBLIC_HUB_BASE_URL;
  if (custom) return custom;
  return process.env.NEXT_PUBLIC_NIMIQ_NETWORK === "mainnet"
    ? "https://hub.nimiq.com"
    : "https://hub.nimiq-testnet.com";
}

let hub: InstanceType<typeof HubApi> | null = null;
function getHub(): InstanceType<typeof HubApi> {
  if (!hub) hub = new HubApi(hubEndpoint());
  return hub;
}

/* ────────────────────────── Nimiq Hub adapter (real) ─────────────────────
 * Popup flow (desktop + mobile Chrome). Signing happens inside the Hub, so
 * the phone browser needs NO WebCrypto Ed25519 — this is the mobile path.
 * Server verifies the signature AND binds pubkey→address (strict, Phase 2). */
export const hubAdapter: WalletAdapter = {
  id: "hub",
  label: "Nimiq Hub",
  isAvailable: () => typeof window !== "undefined",
  async connect() {
    try {
      const res = await getHub().chooseAddress({ appName: "NimbTy" });
      if (!res?.address) throw new Error("no address in Hub result");
      return { walletAddress: res.address };
    } catch (e: unknown) {
      if (e instanceof WalletError) throw e;
      const msg = e instanceof Error ? e.message : "";
      if (msg.toLowerCase().includes("cancel") || (e as { code?: number })?.code === 3)
        throw new WalletError("WALLET_REJECTED", "No problem — you closed the wallet.");
      throw new WalletError("WALLET_UNAVAILABLE", "Could not reach Nimiq Hub. Check your connection and try again.");
    }
  },
  async sign(message, walletAddress) {
    try {
      const r = await getHub().signMessage({ appName: "NimbTy", signer: walletAddress, message });
      if (!r) throw new WalletError("SIGNATURE_REJECTED", "The Hub closed without signing.");
      return {
        walletAddress: r.signer ?? walletAddress,
        message,
        signatureHex: toHex(r.signature),
        pubKeyHex: toHex(r.signerPublicKey),
      };
    } catch (e: unknown) {
      if (e instanceof WalletError) throw e;
      throw new WalletError("SIGNATURE_REJECTED", "You declined to sign the login request.");
    }
  },
};

/* ────────────────────────── Dev adapter (local development only) ────────────
 * Signs the challenge with a throwaway browser Ed25519 key (WebCrypto).
 * Real cryptographic proof-of-session-key — but NOT proof of on-chain account
 * ownership. Gated by NEXT_PUBLIC_ALLOW_DEV_WALLET and server-side
 * ALLOW_UNVERIFIED_WALLET_LOGIN. Turn both OFF for the real demo. */
const NIMIQ_B32 = "023456789ABCDEFGHJKMNPQRSTVWXYZ";

function randomDevAddress(): string {
  let s = "NQ";
  const b = new Uint8Array(34);
  crypto.getRandomValues(b);
  for (let i = 0; i < 34; i++) s += NIMIQ_B32[b[i] % NIMIQ_B32.length];
  return s;
}

export const devAdapter: WalletAdapter = {
  id: "dev",
  label: "Dev wallet (test only)",
  isAvailable: () => process.env.NEXT_PUBLIC_ALLOW_DEV_WALLET === "true",
  async connect() {
    const raw = window.prompt(
      "[DEV WALLET] Paste any Nimiq-style address to sign in as.\nPrefilled with a random valid-format one:",
      randomDevAddress(),
    );
    const addr = (raw ?? "").trim().replace(/\s+/g, "").toUpperCase();
    if (!/^NQ[0-9A-Z]{34}$/.test(addr)) throw new WalletError("INVALID_ADDRESS_INPUT", "That wasn't a valid NQ… address.");
    return { walletAddress: addr };
  },
  async sign(message) {
    if (!crypto?.subtle) throw new WalletError("ED25519_UNSUPPORTED", "This browser lacks WebCrypto Ed25519. Use a recent Chrome/Edge/Firefox.");
    try {
      const kp = (await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"])) as CryptoKeyPair;
      const sig = new Uint8Array(await crypto.subtle.sign("Ed25519", kp.privateKey, new TextEncoder().encode(message)));
      const pub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
      return { walletAddress: "", message, signatureHex: toHex(sig), pubKeyHex: toHex(pub) };
    } catch {
      throw new WalletError("ED25519_UNSUPPORTED", "Browser refused Ed25519 signing. Try Chrome.");
    }
  },
};

/* ────────────────────────── Nimiq Pay adapter (mobile) ──────────────────────
 * Deep-link round-trip signing can't complete synchronously in-page.
 * Hub popup is the mobile path for now. */
export const payAdapter: WalletAdapter = {
  id: "pay",
  label: "Nimiq Pay (via Hub)",
  isAvailable: () => false,
  async connect() { throw new WalletError("PAY_MODE_PHASE_2", "Use Nimiq Hub to connect on mobile."); },
  async sign() { throw new WalletError("PAY_MODE_PHASE_2", "Use Nimiq Hub to connect on mobile."); },
};

export function pickAdapter(): WalletAdapter {
  return devAdapter.isAvailable() ? devAdapter : hubAdapter;
}
