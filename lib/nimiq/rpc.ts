/**
 * Nimiq JSON-RPC client (spec §32).
 * Talks to any Albatross JSON-RPC node. NIMIQ_RPC_URL points at the
 * operator's node; mainnet falls back to the public rpc.nimiqwatch.com.
 * No public testnet RPC exists — testnet operators run one node (see handoff.md).
 */
import { sameAddress } from "./keys";
export class RpcError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = "RpcError"; }
}

export class RpcUnavailableError extends RpcError {
  constructor(detail: string) {
    super("RPC_UNAVAILABLE", `No Nimiq RPC reachable: ${detail}. Funding stays PENDING — never assumed.`);
  }
}

interface RpcEnvelope<T> { data: T; metadata?: unknown }

function unwrap<T>(result: T | RpcEnvelope<T>): T {
  if (result && typeof result === "object" && "data" in (result as object) && !("hash" in (result as object)) && !("blockNumber" in (result as object)))
    return (result as RpcEnvelope<T>).data;
  return result as T;
}

export interface RpcTransaction {
  hash: string;
  blockHash?: string | null;
  blockNumber?: number | null;
  timestamp?: number;
  // Field names differ between node RPC (sender/recipient/data) and
  // public proxies (from/to/senderData). normalizeTransaction covers both.
  sender?: string;
  recipient?: string;
  from?: string;
  to?: string;
  value: number | string; // Luna
  fee?: number | string;
  data?: string | { data?: string } | null;
  senderData?: string | null;
  recipientData?: string | null;
  validityStartHeight?: number;
  // Nimiq Pay routes payments through HTLC contracts: on-chain `from` is the
  // contract, NOT the user's wallet. relatedAddresses still names the wallet.
  relatedAddresses?: string[];
  flags?: number; // 1 = contract creation (never a funding payment)
  fromType?: number;
  toType?: number; // 2 = contract address
}

export interface NormalizedTransaction {
  hash: string;
  sender: string;
  recipient: string;
  valueLuna: bigint;
  blockNumber: number | null;
  memoText: string;
  relatedAddresses: string[];
  isContractCreation: boolean;
}

function dataToText(data: unknown): string {
  if (!data) return "";
  const raw = typeof data === "string" ? data : (data as { data?: unknown }).data;
  if (typeof raw !== "string" || !raw) return "";
  if (/^(0x)?[0-9a-fA-F]+$/.test(raw) && raw.replace(/^0x/, "").length % 2 === 0 && raw.replace(/^0x/, "").length >= 2) {
    try {
      const t = Buffer.from(raw.replace(/^0x/, ""), "hex").toString("utf8");
      if (/^[\x20-\x7E]*$/.test(t)) return t;
    } catch { /* fall through */ }
  }
  return raw;
}

export function normalizeTransaction(tx: RpcTransaction): NormalizedTransaction {
  return {
    hash: tx.hash,
    sender: tx.sender ?? tx.from ?? "",
    recipient: tx.recipient ?? tx.to ?? "",
    valueLuna: BigInt(tx.value),
    blockNumber: tx.blockNumber ?? null,
    memoText: [dataToText(tx.data), dataToText(tx.senderData), dataToText(tx.recipientData)].join(" "),
    relatedAddresses: Array.isArray(tx.relatedAddresses) ? tx.relatedAddresses : [],
    isContractCreation: tx.flags === 1,
  };
}

/**
 * Does this on-chain tx belong to `wallet`? Direct match first (fast path),
 * then relatedAddresses fallback for HTLC-routed Nimiq Pay payments.
 * relatedAddresses is involvement, not authorization — always pair with memo+amount.
 */
export function txInvolvesWallet(tx: NormalizedTransaction, wallet: string): boolean {
  if (!wallet) return false;
  if (sameAddress(tx.sender, wallet)) return true;
  return tx.relatedAddresses.some((a) => sameAddress(a, wallet));
}

export interface RpcAccount {
  address: string;
  balance: number | string; // Luna
}

export function rpcUrlFor(network: string): string {
  const configured = (process.env.NIMIQ_RPC_URL ?? "").trim();
  if (configured) return configured;
  if (network === "mainnet") return "https://rpc.nimiqwatch.com";
  return ""; // testnet: operator must provide NIMIQ_RPC_URL (handoff.md)
}

export class NimiqRpc {
  constructor(private url: string) {
    if (!url) throw new RpcUnavailableError("set NIMIQ_RPC_URL to a testnet node");
  }

  async call<T>(method: string, params: unknown[] = []): Promise<T> {
    let res: Response;
    try {
      res = await fetch(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        cache: "no-store",
      });
    } catch (e) {
      throw new RpcUnavailableError(`fetch failed: ${(e as Error).message}`);
    }
    if (res.status === 429) throw new RpcError("RPC_RATE_LIMITED", "Public RPC rate limit hit — retry shortly.");
    if (!res.ok) throw new RpcError("RPC_HTTP", `RPC HTTP ${res.status}`);
    const body = (await res.json()) as { result?: unknown; error?: { message?: string; code?: number } };
    if (body.error) throw new RpcError("RPC_ERROR", body.error.message ?? "Unknown RPC error");
    return unwrap<T>(body.result as T);
  }

  getBlockNumber(): Promise<number> {
    return this.call<number>("getBlockNumber");
  }

  async getTransactionByHash(hash: string): Promise<RpcTransaction | null> {
    try {
      const tx = await this.call<RpcTransaction | null>("getTransactionByHash", [hash]);
      return tx ?? null;
    } catch {
      // Nodes error on unknown hashes instead of returning null.
      // Absent tx = unverified (funding stays PENDING, user retries). Never throw here.
      return null;
    }
  }

  async sendRawTransaction(rawHex: string): Promise<string> {
    return this.call<string>("sendRawTransaction", [rawHex]);
  }

  /** Recent txs involving an address (newest first on most nodes). Null-safe. */
  async getTransactionsByAddress(address: string, max = 25): Promise<RpcTransaction[]> {
    try {
      // NOTE: nodes require 3 params (address, max, startHash) — 2 params → Invalid params.
      const txs = await this.call<RpcTransaction[]>("getTransactionsByAddress", [address, max, null]);
      return Array.isArray(txs) ? txs : [];
    } catch {
      return [];
    }
  }

  async getAccountByAddress(address: string): Promise<RpcAccount | null> {
    try {
      return await this.call<RpcAccount>("getAccountByAddress", [address]);
    } catch {
      return null;
    }
  }

  async getMinFeePerByte(): Promise<number> {
    try {
      return await this.call<number>("getMinFeePerByte", []);
    } catch {
      return 1;
    }
  }
}

/** 1 NIM = 100,000 Luna (protocol constant). */
export const LUNA_PER_NIM = 100_000n;

export function nimToLuna(amount: string): bigint {
  const [whole = "0", frac = ""] = amount.trim().split(".");
  const f = (frac + "00000").slice(0, 5);
  return BigInt(whole || "0") * LUNA_PER_NIM + BigInt(f || "0");
}

export function lunaToNim(luna: bigint | number | string): string {
  const v = BigInt(luna);
  const whole = v / LUNA_PER_NIM;
  const frac = (v % LUNA_PER_NIM).toString().padStart(5, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}
