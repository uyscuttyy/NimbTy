/** Shared frontend bounty types + presentation helpers. All values come from API state. */

export interface ApiBounty {
  id: string;
  publicId: string;
  title: string;
  description: string;
  rewardAmount: string;
  currency: string;
  deadlineAt: string;
  reviewHours: number;
  status: string;
  escrowLocked: boolean;
  fundingTxHash: string | null;
  fundedAt: string | null;
  settledAt: string | null;
  createdAt: string;
  creatorWallet: string;
  creatorName: string | null;
}

export const STATUS_META: Record<string, { label: string; classes: string }> = {
  DRAFT: { label: "Draft", classes: "bg-slate-100 text-slate-600" },
  FUNDING: { label: "Funding…", classes: "bg-accent-yellow/20 text-yellow-700" },
  FUNDED: { label: "Funded", classes: "bg-accent-mint/20 text-emerald-700" },
  OPEN: { label: "Open", classes: "bg-accent-mint/20 text-emerald-700" },
  CLAIMED: { label: "In progress", classes: "bg-primary-soft text-primary-dark" },
  SUBMITTED: { label: "In review", classes: "bg-accent-purple/15 text-violet-700" },
  REVISION_REQUESTED: { label: "Revision", classes: "bg-accent-coral/15 text-rose-700" },
  DISPUTED: { label: "Disputed", classes: "bg-accent-coral/15 text-rose-700" },
  PAID: { label: "Paid", classes: "bg-navy text-white" },
  WORKER_PAID: { label: "Paid", classes: "bg-navy text-white" },
  CREATOR_REFUNDED: { label: "Refunded", classes: "bg-slate-100 text-slate-600" },
  EXPIRED_REFUNDED: { label: "Expired", classes: "bg-slate-100 text-slate-600" },
  CANCELLED: { label: "Cancelled", classes: "bg-slate-100 text-slate-500" },
};

export function statusMeta(status: string) {
  return STATUS_META[status] ?? { label: status, classes: "bg-slate-100 text-slate-600" };
}

export function shortAddr(addr: string): string {
  const a = addr.replace(/\s+/g, "");
  return a.length > 13 ? `${a.slice(0, 8)}…${a.slice(-4)}` : a;
}

export function msLeft(targetIso: string): number {
  return new Date(targetIso).getTime() - Date.now();
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(h)}:${p(m)}:${p(sec)}`;
}

export function formatShortLeft(ms: number): string {
  if (ms <= 0) return "expired";
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m left`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m left`;
  return `${Math.floor(h / 24)}d ${h % 24}h left`;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  return (await r.json()) as T;
}
