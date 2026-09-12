"use client";
import { useState } from "react";
import { api } from "@/lib/ui/bounty";
import { isPayFundingAvailable, nimToLuna, payFundingViaPay } from "@/lib/wallet/adapters";
import { WalletError } from "@/lib/wallet/types";
import { Confetti } from "./Confetti";

interface Funding {
  payTo: string;
  amount: string;
  currency: string;
  memo: string;
  expiresAt: string;
}

type LiveResp = { ok: boolean; bounty?: unknown; live?: boolean; alreadyLive?: boolean; code?: string; message?: string };
type OpenResp = { ok: boolean; funding?: Funding; code?: string; message?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Funding panel: inside Nimiq Pay it's one tap (Pay signs + sends the escrow
 * payment with the bounty memo, then we watch the chain until it's live).
 * Everywhere else it's the manual pay-with-memo + confirm flow.
 * The server verifies the real on-chain transaction either way.
 */
export function FundPanel({ publicId, onLive }: { publicId: string; onLive: (bounty: unknown) => void }) {
  const [funding, setFunding] = useState<Funding | null>(null);
  const [txHash, setTxHash] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [busyNote, setBusyNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const inPay = isPayFundingAvailable();

  const openWindow = async (): Promise<Funding> => {
    const d = await api<OpenResp>(`/api/bounties/${publicId}/fund`, { method: "POST", body: JSON.stringify({}) });
    if (!d.ok || !d.funding) throw new Error(d.message ?? "Couldn't start funding.");
    setFunding(d.funding);
    return d.funding;
  };

  const pollLive = async (): Promise<LiveResp> => {
    for (let i = 0; i < 24; i++) {
      const d = await api<LiveResp>(`/api/bounties/${publicId}/fund`, { method: "POST", body: JSON.stringify({ detect: true }) });
      if (d.ok) return d;
      if (d.code !== "FUNDING_NOT_FOUND" && d.code !== "RPC_UNAVAILABLE") throw new Error(d.message ?? "Not confirmed yet.");
      setBusyNote(`Waiting for the chain… (${i + 1})`);
      await sleep(5000);
    }
    throw new Error("Still no payment on-chain after 2 minutes. It may arrive late — retry shortly.");
  };

  const fundAndPost = async () => {
    setBusy("opening"); setBusyNote(""); setError(null);
    try {
      const f = await openWindow();
      setBusy("paying"); setBusyNote("Approve the payment in Nimiq Pay…");
      await payFundingViaPay({ to: f.payTo, luna: nimToLuna(f.amount), memo: f.memo });
      setBusy("confirming"); setBusyNote("Payment sent. Waiting for the chain…");
      const d = await pollLive();
      setLive(true);
      onLive(d.bounty);
    } catch (e) {
      setError(e instanceof WalletError || e instanceof Error ? e.message : "Funding failed.");
    } finally {
      setBusy(null); setBusyNote("");
    }
  };

  // ── manual flow (regular browsers) ──
  const start = async () => {
    setBusy("reserving"); setError(null);
    try {
      await openWindow();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start funding.");
    } finally {
      setBusy(null);
    }
  };

  const confirm = async (detect: boolean) => {
    setBusy(detect ? "detecting" : "verifying"); setError(null);
    try {
      const d = await api<LiveResp>(
        `/api/bounties/${publicId}/fund`,
        { method: "POST", body: JSON.stringify(detect ? { detect: true } : { txHash: txHash.trim() }) },
      );
      if (!d.ok) throw new Error(d.message ?? "Not confirmed yet.");
      setLive(true);
      onLive(d.bounty);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Not confirmed yet.");
    } finally {
      setBusy(null);
    }
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); } catch { /* denied */ }
  };

  if (live) {
    return (
      <div className="rounded-3xl bg-accent-mint/15 p-5 text-center">
        <Confetti />
        <p className="font-display text-xl font-bold text-navy">🎉 BOUNTY LIVE</p>
        <p className="mt-1 text-sm font-bold text-emerald-700">{funding?.amount} {funding?.currency} LOCKED — someone can now earn it.</p>
      </div>
    );
  }

  if (inPay) {
    return (
      <div>
        {error && <p role="alert" className="mb-2 rounded-2xl bg-accent-coral/15 px-4 py-2 text-sm font-semibold text-rose-700">{error}</p>}
        <button
          onClick={fundAndPost} disabled={busy !== null}
          className="min-h-touch w-full rounded-2xl bg-primary px-5 py-3 font-display text-base font-bold text-white shadow-[0_4px_0_0_#0369A1] active:translate-y-0.5 active:shadow-none disabled:opacity-60"
        >
          {busy === null ? "FUND & POST" : busyNote || "Working…"}
        </button>
        <p className="mt-2 text-center text-xs text-slate2">One approval in Nimiq Pay sends the reward to escrow. Posting goes live once the chain confirms.</p>
      </div>
    );
  }

  if (!funding) {
    return (
      <div>
        {error && <p role="alert" className="mb-2 rounded-2xl bg-accent-coral/15 px-4 py-2 text-sm font-semibold text-rose-700">{error}</p>}
        <button
          onClick={start} disabled={busy !== null}
          className="min-h-touch w-full rounded-2xl bg-primary px-5 py-3 font-display text-base font-bold text-white shadow-[0_4px_0_0_#0369A1] active:translate-y-0.5 active:shadow-none disabled:opacity-60"
        >
          {busy === "reserving" ? "Reserving…" : "FUND & POST"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4">
      <h3 className="font-display font-bold text-navy">Fund the escrow — {funding.amount} {funding.currency}</h3>
      <ol className="space-y-2 text-sm text-slate2">
        <li>
          <span className="font-bold text-navy">1. Pay exactly {funding.amount} {funding.currency} to</span>
          <button onClick={() => copy(funding.payTo)} className="mt-1 block w-full break-all rounded-xl bg-slate-100 px-3 py-2 font-mono text-xs text-navy" title="Tap to copy">
            {funding.payTo} <span className="text-primary">⧉</span>
          </button>
        </li>
        <li>
          <span className="font-bold text-navy">2. Put this exact memo on the payment</span>
          <button onClick={() => copy(funding.memo)} className="mt-1 block w-full rounded-xl bg-slate-100 px-3 py-2 font-mono text-xs text-navy" title="Tap to copy">
            {funding.memo} <span className="text-primary">⧉</span>
          </button>
        </li>
        <li><span className="font-bold text-navy">3. Confirm below</span> — we verify the real chain transaction before going live.</li>
      </ol>
      {error && <p role="alert" className="rounded-2xl bg-accent-coral/15 px-4 py-2 text-sm font-semibold text-rose-700">{error}</p>}
      <div className="flex flex-col gap-2">
        <button
          onClick={() => confirm(true)} disabled={busy !== null}
          className="min-h-touch rounded-2xl bg-accent-mint px-5 py-3 text-sm font-extrabold text-navy disabled:opacity-60"
        >
          {busy === "detecting" ? "Scanning the chain…" : "✓ I'VE PAID — FIND MY PAYMENT"}
        </button>
        <div className="flex gap-2">
          <label htmlFor="txhash" className="sr-only">Transaction hash (optional)</label>
          <input
            id="txhash" value={txHash} onChange={(e) => setTxHash(e.target.value)}
            placeholder="or paste transaction hash…" spellCheck={false}
            className="min-h-touch flex-1 rounded-2xl border border-slate-200 px-3 font-mono text-xs"
          />
          <button onClick={() => confirm(false)} disabled={busy !== null || !txHash.trim()} className="min-h-touch rounded-2xl bg-navy px-4 text-sm font-bold text-white disabled:opacity-50">
            {busy === "verifying" ? "…" : "Verify"}
          </button>
        </div>
      </div>
    </div>
  );
}
