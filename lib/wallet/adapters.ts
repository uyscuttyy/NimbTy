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

/* ────────────────────────── Nimiq Pay injected provider (in-app) ──────────────
 * Inside Nimiq Pay's browser `window.nimiq` is injected by the host app: no
 * Hub popup, no redirect, the wallet the user already has open signs directly.
 * Server verification is unchanged (Ed25519 over the server message + strict
 * address↔pubkey binding), so this stays proof-of-ownership, not a claim. */
type PaySigResult = { publicKey: string; signature: string };
type PayError = { error?: { message?: string } };
let payProvider: {
  listAccounts(): Promise<string[] | PayError>;
  sign(message: string): Promise<PaySigResult | PayError>;
} | null = null;

async function getPayProvider() {
  if (payProvider) return payProvider;
  if (typeof window !== "undefined" && (window as unknown as { nimiq?: unknown }).nimiq) {
    payProvider = (window as unknown as { nimiq: typeof payProvider }).nimiq;
    return payProvider;
  }
  const { init } = await import("@nimiq/mini-app-sdk");
  payProvider = await init({ timeout: 4000 });
  return payProvider;
}

function isPayError(r: unknown): r is PayError {
  return !!r && typeof r === "object" && "error" in (r as Record<string, unknown>);
}

function hexish(s: string): string {
  const v = s.trim().replace(/^0x/i, "").replace(/\s+/g, "");
  if (/^[0-9a-fA-F]+$/.test(v) && v.length % 2 === 0) return v.toLowerCase();
  const bin = atob(v); // fallback: base64 → hex
  let out = "";
  for (let i = 0; i < bin.length; i++) out += bin.charCodeAt(i).toString(16).padStart(2, "0");
  return out;
}

export const payAdapter: WalletAdapter = {
  id: "pay",
  label: "Nimiq Pay",
  isAvailable: () => typeof window !== "undefined" && !!(window as unknown as { nimiq?: unknown }).nimiq,
  async connect() {
    let provider;
    try {
      provider = await getPayProvider();
    } catch {
      throw new WalletError("WALLET_UNAVAILABLE", "Nimiq Pay wallet not found. Open this page inside the Nimiq Pay app.");
    }
    let accounts: string[] | PayError;
    try {
      accounts = await provider!.listAccounts();
    } catch {
      throw new WalletError("WALLET_UNAVAILABLE", "Nimiq Pay did not answer. Reopen the page inside the app and try again.");
    }
    if (isPayError(accounts)) throw new WalletError("WALLET_REJECTED", accounts.error?.message || "Nimiq Pay refused the request.");
    const addr = (accounts[0] ?? "").trim().replace(/\s+/g, "").toUpperCase();
    if (!/^NQ[0-9A-Z]{34}$/.test(addr)) throw new WalletError("INVALID_ADDRESS_INPUT", "Nimiq Pay returned no usable address.");
    return { walletAddress: addr };
  },
  async sign(message, walletAddress) {
    const provider = await getPayProvider();
    let r: PaySigResult | PayError;
    try {
      r = await provider!.sign(message);
    } catch {
      throw new WalletError("SIGNATURE_REJECTED", "You declined to sign the login request.");
    }
    if (isPayError(r)) throw new WalletError("SIGNATURE_REJECTED", r.error?.message || "Signing was declined in Nimiq Pay.");
    return { walletAddress, message, signatureHex: hexish(r.signature), pubKeyHex: hexish(r.publicKey) };
  },
};

export function pickAdapter(): WalletAdapter {
  if (typeof window !== "undefined" && !!(window as unknown as { nimiq?: unknown }).nimiq) return payAdapter;
  return devAdapter.isAvailable() ? devAdapter : hubAdapter;
}
