"use client";
import HubApi from "@nimiq/hub-api";
import { blake2b } from "@noble/hashes/blake2.js";
import { hexToBytes } from "@noble/hashes/utils.js";
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
const NIMIQ_B32 = "0123456789ABCDEFGHJKLMNPQRSTUVXYZ";

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

/* Browser-safe NQ address derivation (mirrors lib/nimiq/keys, which is Node-only):
 * address = Blake2b-256(pubkey)[:20], base32 + IBAN check digits. */
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

export function addressFromPubKeyHex(pubKeyHex: string): string {
  const digest = blake2b(hexToBytes(pubKeyHex), { dkLen: 32 }).slice(0, 20);
  const body = b32encode(digest);
  for (let c = 0; c < 100; c++) {
    const check = String(c).padStart(2, "0");
    if (ibanValid(`NQ${check}${body}`)) return `NQ${check}${body}`;
  }
  throw new WalletError("INVALID_ADDRESS_INPUT", "Could not derive an address from that key.");
}

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
    const pubKeyHex = hexish(r.publicKey);
    // Pay may sign with a different account than listAccounts()[0] (multi-account
    // wallets). The key that signed IS the identity: derive its address like Hub's
    // r.signer, so the server's strict binding always passes for the true signer.
    let signer = walletAddress;
    try {
      signer = addressFromPubKeyHex(pubKeyHex);
    } catch {
      signer = walletAddress;
    }
    return { walletAddress: signer, message, signatureHex: hexish(r.signature), pubKeyHex };
  },
};

export function pickAdapter(): WalletAdapter {
  if (typeof window !== "undefined" && !!(window as unknown as { nimiq?: unknown }).nimiq) return payAdapter;
  return devAdapter.isAvailable() ? devAdapter : hubAdapter;
}

/* ─────────────────── One-tap in-app funding (Nimiq Pay only) ─────────────────
 * Sends the escrow payment with the bounty memo straight from the wallet the
 * user already has open. Resolves once Pay accepts + broadcasts; the server
 * still verifies the real on-chain transaction before going live. */
export function isPayFundingAvailable(): boolean {
  return typeof window !== "undefined" && !!(window as unknown as { nimiq?: unknown }).nimiq;
}

export function nimToLuna(amountNim: string): number {
  const luna = Math.round(Number.parseFloat(amountNim) * 1e5);
  if (!Number.isFinite(luna) || luna <= 0) throw new WalletError("INVALID_ADDRESS_INPUT", "Invalid reward amount.");
  return luna;
}

export async function payFundingViaPay(input: { to: string; luna: number; memo: string }): Promise<void> {
  const w = window as unknown as {
    nimiq?: {
      sendBasicTransactionWithData(tx: { recipient: string; value: number; data: string }): Promise<string | { error?: { message?: string } }>;
    };
  };
  if (!w.nimiq?.sendBasicTransactionWithData)
    throw new WalletError("WALLET_UNAVAILABLE", "Nimiq Pay wallet not found. Open this page inside the Nimiq Pay app.");
  let r: string | { error?: { message?: string } };
  try {
    r = await w.nimiq.sendBasicTransactionWithData({ recipient: input.to, value: input.luna, data: input.memo });
  } catch {
    throw new WalletError("WALLET_REJECTED", "Payment was declined in Nimiq Pay.");
  }
  if (r && typeof r === "object" && "error" in r)
    throw new WalletError("WALLET_REJECTED", r.error?.message || "Payment was declined in Nimiq Pay.");
}
