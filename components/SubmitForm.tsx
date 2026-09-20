"use client";
import { useState } from "react";
import { api } from "@/lib/ui/bounty";

interface Item { type: "TEXT" | "LINK" | "IMAGE" | "FILE"; text: string; url: string }

function ItemEditor({ item, onChange, onRemove }: { item: Item; onChange: (i: Item) => void; onRemove: () => void }) {
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: formData });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message ?? "Upload failed");
      onChange({ ...item, type: "FILE", url: data.url });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      // Reset input so same file can be re-selected
      e.target.value = "";
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex gap-1" role="group" aria-label="Proof type">
        {(["TEXT", "LINK", "IMAGE", "FILE"] as const).map((t) => (
          <button key={t} type="button" onClick={() => onChange({ ...item, type: t })} aria-pressed={item.type === t}
            className={`rounded-xl px-2 py-1.5 text-xs font-bold ${item.type === t ? "bg-navy text-white" : "bg-white text-slate2 border border-slate-200"}`}>
            {t}
          </button>
        ))}
        <button type="button" onClick={onRemove} aria-label="Remove proof item" className="ml-auto px-2 text-sm text-rose-600">✕</button>
      </div>
      {item.type === "TEXT" ? (
        <textarea value={item.text} onChange={(e) => onChange({ ...item, text: e.target.value })} rows={2}
          placeholder="What did you complete?" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
      ) : item.type === "FILE" ? (
        <div className="mt-2 space-y-2">
          <label className="block">
            <input type="file" onChange={handleFileSelect} disabled={uploading}
              className="sr-only" id={`file-upload-${item.url || Math.random()}`} />
            <button type="button" onClick={() => document.getElementById(`file-upload-${item.url || Math.random()}`)?.click()}
              disabled={uploading}
              className={`min-h-touch w-full rounded-xl border-2 border-dashed ${uploading ? "border-slate-300 bg-slate-100 cursor-not-allowed" : "border-primary bg-white hover:border-navy"} px-4 py-3 text-center text-sm font-medium ${uploading ? "text-slate-400" : "text-primary"}`}>
              {uploading ? "Uploading…" : "Choose file…"}
            </button>
          </label>
          {item.url && (
            <p className="text-xs font-mono text-slate-600 break-all">Uploaded: {item.url}</p>
          )}
        </div>
      ) : (
        <input value={item.url} onChange={(e) => onChange({ ...item, url: e.target.value })} inputMode="url"
          placeholder="https://… (screenshot, doc, file link)" spellCheck={false}
          className="mt-2 min-h-touch w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" />
      )}
    </div>
  );
}

const blank = (): Item => ({ type: "TEXT", text: "", url: "" });

export function SubmitForm({ publicId, header, onSubmitted }: { publicId: string; header: string; onSubmitted: () => void }) {
  const [summary, setSummary] = useState("");
  const [proof, setProof] = useState<Item[]>([blank()]);
  const [lockFinal, setLockFinal] = useState(false);
  const [finalItems, setFinalItems] = useState<Item[]>([blank()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clean = (items: Item[]) =>
    items.map((i) => (i.type === "TEXT" ? { type: i.type, text: i.text.trim() } : { type: i.type, url: i.url.trim() }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const d = await api<{ ok: boolean; code?: string; message?: string }>(`/api/bounties/${publicId}/submit`, {
        method: "POST",
        body: JSON.stringify({
          summary,
          proofItems: clean(proof),
          ...(lockFinal ? { finalDeliverable: clean(finalItems) } : {}),
        }),
      });
      if (!d.ok) throw new Error(d.message ?? "Couldn't submit.");
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4">
      <h3 className="font-display font-bold text-navy">{header}</h3>
      <div>
        <label htmlFor="summary" className="text-sm font-bold text-navy">What did you complete?</label>
        <textarea id="summary" value={summary} onChange={(e) => setSummary(e.target.value)} required minLength={10} maxLength={2000} rows={3}
          placeholder="Describe the finished work…" className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm" />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-bold text-navy">Add proof <span className="font-normal text-slate2">(preview — the creator sees this)</span></p>
        {proof.map((it, i) => (
          <ItemEditor key={i} item={it} onChange={(n) => setProof(proof.map((p, j) => (j === i ? n : p)))} onRemove={() => setProof(proof.filter((_, j) => j !== i))} />
        ))}
        <button type="button" onClick={() => proof.length < 20 && setProof([...proof, blank()])} className="text-sm font-bold text-primary">＋ Add proof</button>
      </div>
      <label className="flex items-start gap-2 rounded-2xl bg-accent-yellow/15 p-3 text-sm">
        <input type="checkbox" checked={lockFinal} onChange={(e) => setLockFinal(e.target.checked)} className="mt-1 h-5 w-5" />
        <span><span className="font-bold text-navy">🔒 Lock a final deliverable</span>
          <span className="block text-slate2">Stays encrypted from everyone until you're paid — even in disputes.</span></span>
      </label>
      {lockFinal && (
        <div className="space-y-2">
          {finalItems.map((it, i) => (
            <ItemEditor key={i} item={it} onChange={(n) => setFinalItems(finalItems.map((p, j) => (j === i ? n : p)))} onRemove={() => setFinalItems(finalItems.filter((_, j) => j !== i))} />
          ))}
          <button type="button" onClick={() => finalItems.length < 20 && setFinalItems([...finalItems, blank()])} className="text-sm font-bold text-primary">＋ Add deliverable</button>
        </div>
      )}
      {error && <p role="alert" className="rounded-2xl bg-accent-coral/15 px-4 py-2 text-sm font-semibold text-rose-700">{error}</p>}
      <button type="submit" disabled={busy} className="min-h-touch w-full rounded-2xl bg-primary px-5 py-3 font-display font-bold text-white disabled:opacity-60">
        {busy ? "Submitting…" : "SUBMIT"}
      </button>
    </form>
  );
}
