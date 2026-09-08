import { WalletAdapter, WalletError, toHex } from "./types";

/* ────────────────────────── Nimiq Hub adapter (desktop, real) ─────────────
 * Uses the official @nimiq/hub-api PRECISELY WHEN it is installed.
 * Phase 2 pins the verified current published version. Until then the import
 * is runtime-guarded: without the package, this adapter reports
 * WALLET_UNAVAILABLE cleanly instead of breaking compilation. */
let hubApi: any = null;
let hubAddress: string | null = null;

async function loadHubModule(): Promise<any> {
  // Variable specifier + webpackIgnore → webpack emits a native dynamic import
  // and does NOT try to resolve the bare specifier at build time. If the
  // package isn't installed, the browser rejects it and we surface WalletError.
  const spec = "@nimiq/hub-api";
  return await import(/* webpackIgnore: true */ spec);
}

async function getHub(): Promise<any> {
  if (hubApi) return hubApi;
  const mod = await loadHubModule(); // throws if not installed
  const endpoint =
    process.env.NEXT_PUBLIC_HUB_BASE_URL ||
    (process.env.NEXT_PUBLIC_NIMIQ_NETWORK === "mainnet"
      ? "https://hub.nimiq.com"
      : "https://hub.nimiq-testnet.com");
  const HubApi = mod.default ?? mod;
  hubApi = new HubApi(endpoint);
  return hubApi;
}

export const hubAdapter: WalletAdapter = {
  id: "hub",
  label: "Nimiq Hub",
  isAvailable: () => true,
  async connect() {
    let hub: any;
    try {
      hub = await getHub();
    } catch {
      throw new WalletError("WALLET_UNAVAILABLE",
        "Nimiq Hub adapter isn't installed yet (pinned in Phase 2). Use the dev wallet for local development.");
    }
    try {
      const res = await hub.signIn();
      hubAddress = res.address ?? res?.account?.addresses?.[0];
      if (!hubAddress) throw new Error("no address in sign-in result");
      return { walletAddress: hubAddress };
    } catch (e: any) {
      if (e instanceof WalletError) throw e;
      if (e?.message?.toLowerCase?.().includes("cancel") || e?.code === 3)
        throw new WalletError("WALLET_REJECTED", "No problem — you closed the wallet.");
      throw new WalletError("WALLET_UNAVAILABLE", "Could not reach Nimiq Hub. Is your popup blocker on?");
    }
  },
  async sign(message, walletAddress) {
    const hub = await getHub().catch(() => null);
    if (!hub) throw new WalletError("WALLET_UNAVAILABLE", "Nimiq Hub adapter isn't installed yet.");
    const signer = walletAddress || hubAddress;
    try {
      const r = await hub.signMessage({ signer, message });
      const sig = typeof r.signature === "string" ? r.signature : toHex(new Uint8Array(r.signature));
      const pub = typeof r.signerPubKey === "string" ? r.signerPubKey : toHex(new Uint8Array(r.signerPubKey));
      if (!pub) throw new Error("signerPubKey missing from Hub result");
      return { walletAddress: r.signer ?? signer, message, signatureHex: sig, pubKeyHex: pub };
    } catch (e) {
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
 * Interface exists now; the real Pay flow ships in Phase 2 with payments. */
export const payAdapter: WalletAdapter = {
  id: "pay",
  label: "Nimiq Pay (coming with payments)",
  isAvailable: () => false,
  async connect() { throw new WalletError("PAY_MODE_PHASE_2", "Nimiq Pay sign-in ships with Phase 2 (payments). Use the Hub or dev wallet for now."); },
  async sign() { throw new WalletError("PAY_MODE_PHASE_2", "Nimiq Pay sign-in ships in Phase 2."); },
};

export function pickAdapter(): WalletAdapter {
  return devAdapter.isAvailable() ? devAdapter : hubAdapter;
}
