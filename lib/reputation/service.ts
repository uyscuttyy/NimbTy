/**
 * Level math is a pure function over REAL stored counters (Reputation.completed).
 * Nothing here invents numbers — levels are derived, never stored.
 */
export const LEVELS = [
  { name: "Newbie",        min: 0 },
  { name: "Bounty Rookie", min: 5 },
  { name: "Task Hunter",   min: 15 },
  { name: "Bounty Beast",  min: 30 },
  { name: "NimbTy Pro",    min: 60 },
] as const;

export interface LevelInfo {
  index: number;
  name: string;
  completedAtLevel: number;
  nextLevelAt: number | null;
  progress: number; // 0..1, toward next level
}

export function getLevel(completed: number): LevelInfo {
  let index = 0;
  for (let i = 0; i < LEVELS.length; i++) if (completed >= LEVELS[i].min) index = i;

  const current = LEVELS[index];
  const next = LEVELS[index + 1];
  const span = next ? next.min - current.min : 1;
  const progress = next ? Math.min(1, (completed - current.min) / span) : 1;

  return {
    index,
    name: current.name,
    completedAtLevel: completed - current.min,
    nextLevelAt: next ? next.min : null,
    progress,
  };
}

export function getApprovalRate(approvals: number, submitted: number): number | null {
  if (submitted === 0) return null;
  return Math.round((approvals / submitted) * 100);
}
