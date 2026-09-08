"use client";
import { useState } from "react";
import { api } from "@/lib/ui/bounty";
import { Confetti } from "./Confetti";

interface Funding {
  payTo: string;
  amount: string;
  currency: string;
  memo: string;
  expiresAt: string;
}

/**
 * Real funding panel (spec §18): pay the escrow address from any Nimiq wallet
 * with the exact amount + memo, then confirm — the server verifies on-chain.
 */
export function FundPanel({ publicId, onLive }: { publicId: string; onLive: (bounty: unknown) => void }) {
  const [funding, setFunding] = useState<Funding | null>(null);
  const [txHash, setTxHash] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  const start = async () => {
    setBusy("reserving"); setError(null);
    try {
      const d = await api<{ ok: boolean; funding?: Funding; code?: string; message?: string }>(`/api/bounties/${publicId}/fund`, { method: "POST", body: JSON.stringify({}) });
      if (!d.ok) throw new Error(d.message ?? "Couldn't start funding.");
      setFunding(d.funding!);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start funding.");
    } finally {
      setBusy(null);
    }
  };

  const confirm = async (detect: boolean) => {
    setBusy(detect ? "detecting" : "verifying"); setError(null);
    try {
      const d = await api<{ ok: boolean; bounty?: unknown; live?: boolean; alreadyLive?: boolean; code?: string; message?: string }>(
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
