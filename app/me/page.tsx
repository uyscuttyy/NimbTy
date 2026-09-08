"use client";
import { useEffect, useState } from "react";
import { BountyCard } from "@/components/BountyCard";
import { EmptyState } from "@/components/EmptyState";
import { api, shortAddr, type ApiBounty } from "@/lib/ui/bounty";

interface Profile {
  walletAddress: string;
  displayName: string | null;
  hunterName: string;
  level: { name: string; progress: number; nextLevelAt: number | null };
  approvalRate: number | null;
  streak: { current: number; longest: number };
  worker: { completed: number; submitted: number; approvals: number; earned: string; disputesAgainst: number; disputesLost: number };
  creator: { posted: number; funded: number; paid: number; spent: string; disputesOpened: number };
  memberSince: string;
}

export default function MePage() {
  const [data, setData] = useState<{ profile: Profile } | null>(null);
  const [mine, setMine] = useState<ApiBounty[] | null>(null);
  const [tab, setTab] = useState("Live");

  useEffect(() => {
    api<{ ok: boolean; profile?: Profile }>("/api/profile").then((d) => d.profile && setData({ profile: d.profile })).catch(() => undefined);
    api<{ ok: boolean; bounties?: ApiBounty[] }>("/api/bounties?scope=mine&limit=50").then((d) => setMine(d.bounties ?? [])).catch(() => setMine([]));
  }, []);

  if (!data) return <div className="pt-4" aria-label="Loading"><div className="h-64 animate-pulse rounded-3xl bg-slate-100" /></div>;
  const p = data.profile;
  const inTab = (b: ApiBounty) =>
    tab === "Live" ? ["DRAFT", "FUNDING", "FUNDED", "OPEN"].includes(b.status) :
    tab === "In progress" ? ["CLAIMED", "SUBMITTED", "REVISION_REQUESTED"].includes(b.status) :
    tab === "Disputed" ? b.status === "DISPUTED" :
    ["PAID", "WORKER_PAID", "CREATOR_REFUNDED", "EXPIRED_REFUNDED", "CANCELLED"].includes(b.status);

  return (
    <div className="space-y-4 pt-4">
      <section className="overflow-hidden rounded-3xl bg-navy p-5 text-white" aria-label="Profile">
        <p className="font-mono text-xs text-slate-300">{shortAddr(p.walletAddress)}</p>
        <h1 className="mt-1 font-display text-3xl font-bold">{p.displayName ?? "Bounty Hunter"}</h1>
        <p className="text-sm font-bold text-accent-yellow">{p.hunterName} · {p.level.name}</p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/20" role="progressbar" aria-label={`Level progress ${Math.round(p.level.progress * 100)} percent`}>
          <div className="h-full rounded-full bg-accent-yellow" style={{ width: `${Math.round(p.level.progress * 100)}%` }} />
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
          <div className="rounded-2xl bg-white/10 p-2"><p className="font-display text-xl font-bold">{p.worker.completed}</p><p className="text-[10px] uppercase text-slate-300">Done</p></div>
          <div className="rounded-2xl bg-white/10 p-2"><p className="font-display text-xl font-bold">{p.worker.earned}</p><p className="text-[10px] uppercase text-slate-300">Earned</p></div>
          <div className="rounded-2xl bg-white/10 p-2"><p className="font-display text-xl font-bold">{p.approvalRate === null ? "—" : `${p.approvalRate}%`}</p><p className="text-[10px] uppercase text-slate-300">Approval</p></div>
          <div className="rounded-2xl bg-white/10 p-2"><p className="font-display text-xl font-bold">🔥{p.streak.current}</p><p className="text-[10px] uppercase text-slate-300">Streak</p></div>
        </div>
        <p className="mt-3 text-xs text-slate-300">Posted {p.creator.posted} · Funded {p.creator.funded} · Paid out {p.creator.paid}</p>
      </section>

      <section aria-label="My bounties">
        <h2 className="font-display text-lg font-bold text-navy">My bounties</h2>
        <div className="mt-2 flex gap-1" role="tablist" aria-label="Bounty filter">
          {["Live", "In progress", "Disputed", "Completed"].map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`min-h-touch rounded-2xl px-3 text-xs font-bold ${tab === t ? "bg-navy text-white" : "border border-slate-200 bg-white text-slate2"}`}>
              {t}
            </button>
          ))}
        </div>
        <div className="mt-3">
          {mine === null && <div className="h-32 animate-pulse rounded-3xl bg-slate-100" />}
          {mine !== null && mine.filter(inTab).length === 0 && (
            <EmptyState title="Nothing here yet." hint="Your first bounty is waiting. Create one and see what happens." actionHref="/post" actionLabel="Post a bounty" />
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(mine ?? []).filter(inTab).map((b, i) => <BountyCard key={b.id} bounty={b} index={i} />)}
          </div>
        </div>
      </section>
    </div>
  );
}
