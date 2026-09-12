"use client";
import Link from "next/link";
import { useState } from "react";
import { useSession } from "@/components/SessionProvider";
import { FundPanel } from "@/components/FundPanel";
import { api } from "@/lib/ui/bounty";

export default function PostPage() {
  const { status } = useSession();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reward, setReward] = useState("5");
  const [deadlineH, setDeadlineH] = useState("24");
  const [reviewHours, setReviewHours] = useState("12");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ publicId: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const d = await api<{ ok: boolean; bounty?: { publicId: string }; code?: string; message?: string }>("/api/bounties", {
        method: "POST",
        body: JSON.stringify({
          title, description, rewardAmount: reward, currency: "NIM",
          deadlineAt: new Date(Date.now() + Number(deadlineH) * 3600 * 1000).toISOString(),
          reviewHours: Number(reviewHours),
        }),
      });
      if (!d.ok) throw new Error(d.message ?? "Couldn't create the bounty.");
      setCreated({ publicId: d.bounty!.publicId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the bounty.");
    } finally {
      setBusy(false);
    }
  };

  if (status === "disconnected") {
    return (
      <div className="pt-10 text-center">
        <p className="font-display text-xl font-bold text-navy">Connect your wallet to post a bounty.</p>
        <p className="mt-1 text-sm text-slate2">Your wallet is your identity, no passwords, ever.</p>
      </div>
    );
  }

  if (created) {
    return (
      <div className="mx-auto max-w-xl space-y-4 pt-4">
        <h1 className="font-display text-2xl font-bold text-navy">Fund it to go live 🔒</h1>
        <p className="text-sm text-slate2">The reward locks in escrow <em>before</em> anyone starts. No chasing payments, no disappearing clients.</p>
        <FundPanel publicId={created.publicId} onLive={() => undefined} />
        <Link href={`/n/${created.publicId}`} className="block text-center text-sm font-bold text-primary">View bounty →</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl pt-4">
      <h1 className="font-display text-2xl font-bold text-navy">What needs doing?</h1>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <div>
          <label htmlFor="title" className="text-sm font-bold text-navy">What needs doing?</label>
          <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={4} maxLength={120}
            placeholder="e.g. Test my landing page on mobile"
            className="mt-1 min-h-touch w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm" />
        </div>
        <div>
          <label htmlFor="desc" className="text-sm font-bold text-navy">Details <span className="font-normal text-slate2">(so a stranger can do it)</span></label>
          <textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} required minLength={10} maxLength={2000} rows={4}
            placeholder="What exactly? How will you check it? Links, files, acceptance criteria…"
            className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="min-w-0">
            <label htmlFor="reward" className="block truncate text-center text-xs font-bold text-navy">Reward (NIM)</label>
            <input id="reward" value={reward} onChange={(e) => setReward(e.target.value)} required inputMode="decimal"
              className="mt-1 h-12 w-full rounded-2xl border border-slate-200 bg-white px-1 text-center text-sm" />
          </div>
          <div className="min-w-0">
            <label htmlFor="deadline" className="block truncate text-center text-xs font-bold text-navy">Deadline</label>
            <select id="deadline" value={deadlineH} onChange={(e) => setDeadlineH(e.target.value)} className="mt-1 h-12 w-full truncate rounded-2xl border border-slate-200 bg-white px-1 text-center text-sm">
              <option value="4">4 hours</option>
              <option value="12">12 hours</option>
              <option value="24">24 hours</option>
              <option value="72">3 days</option>
              <option value="168">7 days</option>
            </select>
          </div>
          <div className="min-w-0">
            <label htmlFor="review" className="block truncate text-center text-xs font-bold text-navy">Review time</label>
            <select id="review" value={reviewHours} onChange={(e) => setReviewHours(e.target.value)} className="mt-1 h-12 w-full truncate rounded-2xl border border-slate-200 bg-white px-1 text-center text-sm">
              <option value="3">3 hours</option>
              <option value="6">6 hours</option>
              <option value="12">12 hours</option>
              <option value="24">24 hours</option>
              <option value="36">36 hours</option>
            </select>
          </div>
        </div>
        {error && <p role="alert" className="rounded-2xl bg-accent-coral/15 px-4 py-2 text-sm font-semibold text-rose-700">{error}</p>}
        <button type="submit" disabled={busy || status === "loading"}
          className="min-h-touch w-full rounded-2xl bg-primary px-5 py-3 font-display text-base font-bold text-white shadow-[0_4px_0_0_#0369A1] active:translate-y-0.5 active:shadow-none disabled:opacity-60">
          {busy ? "Creating…" : "CONTINUE → FUND"}
        </button>
        <p className="text-center text-xs text-slate2">USDT payments coming soon. Silence after submission auto-pays the worker</p>
      </form>
    </div>
  );
}
