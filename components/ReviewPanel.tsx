"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/ui/bounty";
import { Countdown } from "./Countdown";
import { Confetti } from "./Confetti";

interface Submission {
  id: string;
  summary: string;
  proofItems: { type: string; text?: string; url?: string; label?: string }[];
  hasFinalDeliverable: boolean;
  revisionNumber: number;
  status: string;
  reviewNote: string | null;
  reviewDeadlineAt: string;
}

/** Creator review panel: VIEW SUBMISSION → APPROVE & PAY / REVISION / DISPUTE. */
export function ReviewPanel({ publicId, onChanged }: { publicId: string; onChanged: () => void }) {
  const [sub, setSub] = useState<Submission | null>(null);
  const [deliverable, setDeliverable] = useState<unknown>(null);
  const [mode, setMode] = useState<"idle" | "revision" | "dispute">("idle");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);

  const load = async () => {
    try {
      const list = await api<{ ok: boolean; bounty?: { latestSubmission?: { id: string } } }>(`/api/bounties/${publicId}`);
      const sid = list.bounty?.latestSubmission?.id;
      if (!sid) return;
      const d = await api<{ ok: boolean; submission?: Submission }>(`/api/submissions/${sid}`);
      if (d.ok && d.submission) setSub(d.submission);
    } catch { /* keep panel empty */ }
  };
  useEffect(() => { load(); }, [publicId]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (path: string, body?: object) => {
    setBusy(true); setError(null);
    try {
      const d = await api<{ ok: boolean; message?: string }>(path, { method: "POST", body: body ? JSON.stringify(body) : "{}" });
      if (!d.ok) throw new Error(d.message ?? "Action failed.");
      setMode("idle"); setReason("");
      onChanged();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => { await act(`/api/bounties/${publicId}/approve`); setPaid(true); };
  const unlock = async () => {
    if (!sub) return;
    try {
      const d = await api<{ ok: boolean; deliverable?: unknown; message?: string }>(`/api/submissions/${sub.id}/deliverable`);
      if (!d.ok) throw new Error(d.message ?? "Still locked.");
      setDeliverable(d.deliverable ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Still locked.");
    }
  };

  if (!sub) return null;
  return (
    <section aria-label="Creator review" className="space-y-3 rounded-3xl border-2 border-accent-purple/40 bg-white p-4">
      {paid && <Confetti />}
      <div className="flex items-center justify-between">
        <h3 className="font-display font-bold text-navy">WORK SUBMITTED 🎉</h3>
        <span className="text-xs font-bold text-slate2">Review time: <Countdown targetIso={sub.reviewDeadlineAt} /></span>
      </div>
      <p className="text-sm text-navy">{sub.summary}</p>
      <ul className="space-y-1">
        {sub.proofItems.map((p, i) => (
          <li key={i} className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
            {p.type === "TEXT" ? p.text : <a href={p.url} target="_blank" rel="noopener noreferrer" className="font-bold text-primary">🔗 {p.label || p.url}</a>}
          </li>
        ))}
      </ul>
      {sub.hasFinalDeliverable && (
        <div>
          {!deliverable ? (
            <button onClick={unlock} className="text-sm font-bold text-primary">🔒 View locked deliverable</button>
          ) : (
            <pre className="overflow-x-auto rounded-xl bg-slate-100 p-3 font-mono text-xs">{JSON.stringify(deliverable, null, 2)}</pre>
          )}
        </div>
      )}
      {error && <p role="alert" className="rounded-2xl bg-accent-coral/15 px-4 py-2 text-sm font-semibold text-rose-700">{error}</p>}
      {mode === "idle" && (
        <div className="grid grid-cols-3 gap-2">
          <button onClick={approve} disabled={busy} className="min-h-touch rounded-2xl bg-accent-mint px-2 py-2.5 text-sm font-extrabold text-navy disabled:opacity-60">✓ APPROVE &amp; PAY</button>
          <button onClick={() => setMode("revision")} className="min-h-touch rounded-2xl border border-slate-200 bg-white px-2 py-2.5 text-sm font-bold text-navy">↻ REVISION</button>
          <button onClick={() => setMode("dispute")} className="min-h-touch rounded-2xl border border-accent-coral bg-white px-2 py-2.5 text-sm font-bold text-rose-700">⚠ DISPUTE</button>
        </div>
      )}
      {mode !== "idle" && (
        <div className="space-y-2">
          <label htmlFor="reason" className="text-sm font-bold text-navy">
            {mode === "revision" ? "What should the worker fix?" : "Why are you disputing? Both sides see this."}
          </label>
          <textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
            placeholder={mode === "revision" ? "Please test the mobile version too." : "The task required testing on mobile and desktop, but only desktop was tested."}
            className="w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm" />
          <div className="flex gap-2">
            <button
              onClick={() => act(mode === "revision" ? `/api/bounties/${publicId}/revision` : `/api/bounties/${publicId}/dispute`, { reason })}
              disabled={busy || reason.trim().length < (mode === "revision" ? 5 : 10)}
              className="min-h-touch flex-1 rounded-2xl bg-navy px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
              {busy ? "Sending…" : mode === "revision" ? "REQUEST REVISION" : "OPEN DISPUTE"}
            </button>
            <button onClick={() => { setMode("idle"); setReason(""); }} className="min-h-touch rounded-2xl border border-slate-200 px-4 text-sm font-bold">Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}
