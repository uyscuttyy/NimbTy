import Link from "next/link";

export function EmptyState({ title, hint, actionHref, actionLabel }: { title: string; hint: string; actionHref?: string; actionLabel?: string }) {
  return (
    <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white px-6 py-12 text-center">
      <div className="text-4xl" aria-hidden>🎯</div>
      <h3 className="mt-3 font-display text-lg font-semibold text-navy">{title}</h3>
      <p className="mx-auto mt-1 max-w-xs text-sm text-slate2">{hint}</p>
      {actionHref && (
        <Link href={actionHref} className="mt-4 inline-block min-h-touch rounded-2xl bg-primary px-5 py-2.5 text-sm font-extrabold text-white">
          {actionLabel ?? "Create one"}
        </Link>
      )}
    </div>
  );
}
