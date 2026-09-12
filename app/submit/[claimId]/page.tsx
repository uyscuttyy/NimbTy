"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { SubmitForm } from "@/components/SubmitForm";
import { api } from "@/lib/ui/bounty";

export default function SubmitPage({ params }: { params: Promise<{ claimId: string }> }) {
  const { claimId } = use(params);
  const [target, setTarget] = useState<{ publicId: string; title: string } | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api<{ ok: boolean; work?: { claimId: string; bounty: { publicId: string; title: string; status: string } }[] }>("/api/work")
      .then((d) => {
        const w = (d.work ?? []).find((x) => x.claimId === claimId);
        if (w) setTarget({ publicId: w.bounty.publicId, title: w.bounty.title });
      })
      .catch(() => undefined);
  }, [claimId]);

  if (done) {
    return (
      <div className="pt-10 text-center">
        <p className="font-display text-xl font-bold text-navy">SUBMITTED ✓</p>
        <p className="mt-1 text-sm text-slate2">Waiting for creator review, silence means you get paid.</p>
        {target && <Link href={`/n/${target.publicId}`} className="mt-3 inline-block font-bold text-primary">Back to bounty →</Link>}
      </div>
    );
  }
  if (!target) return <div className="pt-4"><div className="h-64 animate-pulse rounded-3xl bg-slate-100" /></div>;
  return (
    <div className="mx-auto max-w-xl space-y-3 pt-4">
      <h1 className="font-display text-xl font-bold text-navy">Submit: {target.title}</h1>
      <SubmitForm publicId={target.publicId} header="Submit your work" onSubmitted={() => setDone(true)} />
    </div>
  );
}
