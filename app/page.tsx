"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BountyCard } from "@/components/BountyCard";
import { EmptyState } from "@/components/EmptyState";
import type { ApiBounty } from "@/lib/ui/bounty";

export default function Home() {
  const [bounties, setBounties] = useState<ApiBounty[] | null>(null);

  useEffect(() => {
    fetch("/api/bounties?limit=6")
      .then((r) => r.json())
      .then((d) => setBounties(d.bounties ?? []))
      .catch(() => setBounties([]));
  }, []);

  return (
    <div className="space-y-8 pt-4">
      <section className="overflow-hidden rounded-3xl bg-navy p-6 text-white sm:p-10">
        <p className="text-sm font-bold uppercase tracking-widest text-accent-yellow">Got something tiny to do?</p>
        <h1 className="mt-2 font-display text-4xl font-bold leading-tight sm:text-6xl">
          Put a bounty <span className="text-accent-yellow">on it.</span>
        </h1>
        <p className="mt-3 max-w-xl text-base text-slate-300">
          Small tasks. Real rewards. Get something done or get paid to do it — funded in Nimiq, locked in escrow, no chasing payments.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/post" className="min-h-touch rounded-2xl bg-accent-yellow px-6 py-3 font-display text-base font-bold text-navy active:scale-95">
            POST A BOUNTY
          </Link>
          <Link href="/explore" className="min-h-touch rounded-2xl border-2 border-white/30 px-6 py-3 font-display text-base font-bold text-white active:scale-95">
            FIND SOMETHING TO DO
          </Link>
        </div>
        <div className="mt-6 flex flex-wrap gap-x-5 gap-y-1 text-xs font-semibold text-slate-300">
          <span>🔒 Reward locked before work</span>
          <span>⚡ Auto-pay on review timeout</span>
          <span>🛡️ Disputes stay locked</span>
        </div>
      </section>

      <section aria-label="Live bounties">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-navy">🔥 Live bounties</h2>
          <Link href="/explore" className="text-sm font-bold text-primary">See all →</Link>
        </div>
        {bounties === null && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading">
            {[0, 1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-3xl bg-slate-100" />)}
          </div>
        )}
        {bounties !== null && bounties.length === 0 && (
          <EmptyState
            title="Nothing here yet."
            hint="Your first bounty is waiting. Create one and see what happens."
            actionHref="/post" actionLabel="Post the first bounty"
          />
        )}
        {bounties !== null && bounties.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {bounties.map((b, i) => <BountyCard key={b.id} bounty={b} index={i} />)}
          </div>
        )}
      </section>

      <section className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-5 sm:grid-cols-2" aria-label="How it works">
        <div className="rounded-2xl bg-accent-mint/10 p-4">
          <h3 className="font-display font-bold text-navy">Need something done? Fund it.</h3>
          <p className="mt-1 text-sm text-slate2">Post the task, lock the reward in escrow. Someone can now earn it.</p>
        </div>
        <div className="rounded-2xl bg-accent-purple/10 p-4">
          <h3 className="font-display font-bold text-navy">See something you can do? Earn it.</h3>
          <p className="mt-1 text-sm text-slate2">Claim it, submit proof, get paid. No chasing clients.</p>
        </div>
      </section>
    </div>
  );
}
