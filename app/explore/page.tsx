"use client";
import { useCallback, useEffect, useState } from "react";
import { BountyCard } from "@/components/BountyCard";
import { EmptyState } from "@/components/EmptyState";
import type { ApiBounty } from "@/lib/ui/bounty";

type Sort = "newest" | "ending" | "reward";

export default function Explore() {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [bounties, setBounties] = useState<ApiBounty[] | null>(null);

  const load = useCallback(async () => {
    setBounties(null);
    try {
      const r = await fetch(`/api/bounties?q=${encodeURIComponent(q)}&sort=${sort}&limit=30`);
      const d = await r.json();
      setBounties(d.bounties ?? []);
    } catch {
      setBounties([]);
    }
  }, [q, sort]);

  useEffect(() => {
    const t = setTimeout(load, q ? 350 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  return (
    <div className="space-y-4 pt-4">
      <h1 className="font-display text-2xl font-bold text-navy">Find something to do</h1>
      <form role="search" onSubmit={(e) => { e.preventDefault(); load(); }} className="flex gap-2">
        <label htmlFor="q" className="sr-only">Search bounties</label>
        <input
          id="q" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search bounties…"
          className="min-h-touch flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-sm text-navy placeholder:text-slate-400"
        />
        <div className="flex gap-1" role="group" aria-label="Sort">
          {(["newest", "ending", "reward"] as Sort[]).map((s) => (
            <button
              key={s} type="button" onClick={() => setSort(s)}
              aria-pressed={sort === s}
              className={`min-h-touch rounded-2xl px-3 text-xs font-bold ${sort === s ? "bg-navy text-white" : "bg-white text-slate2 border border-slate-200"}`}
            >
              {s === "newest" ? "Newest" : s === "ending" ? "Ending soon" : "Top reward"}
            </button>
          ))}
        </div>
      </form>

      {bounties === null && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-32 animate-pulse rounded-3xl bg-slate-100" />)}
        </div>
      )}
      {bounties !== null && bounties.length === 0 && (
        <EmptyState title="Nothing here yet." hint="Go find something worth doing — or post the first bounty yourself." actionHref="/post" actionLabel="Post a bounty" />
      )}
      {bounties !== null && bounties.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {bounties.map((b, i) => <BountyCard key={b.id} bounty={b} index={i} />)}
        </div>
      )}
    </div>
  );
}
