import type { ArenaTier } from './content/types';
import type { UnitSpec } from './battle/types';

/** Elo rating change for player A after a match (score 1 = win, 0 = loss). */
export function eloDelta(ratingA: number, ratingB: number, scoreA: 0 | 1, k: number): number {
  const expected = 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
  return Math.round(k * (scoreA - expected));
}

/** The highest tier whose minimum the rating meets. Tiers may be in any order. */
export function tierFor(rating: number, tiers: ArenaTier[]): ArenaTier {
  const sorted = [...tiers].sort((a, b) => a.minRating - b.minRating);
  let tier = sorted[0]!;
  for (const t of sorted) if (rating >= t.minRating) tier = t;
  return tier;
}

export function nextTier(rating: number, tiers: ArenaTier[]): ArenaTier | null {
  return [...tiers].sort((a, b) => a.minRating - b.minRating).find((t) => t.minRating > rating) ?? null;
}

/** ISO-8601 week id, e.g. "2026-W43". Arena seasons last one week. */
export function weekKey(ms: number): string {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3));
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((thursday.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** A rough team strength number to show next to opponents. */
export function teamPower(units: Pick<UnitSpec, 'stats'>[]): number {
  return Math.round(units.reduce((sum, u) => sum + u.stats.hp / 8 + u.stats.atk * 1.5 + u.stats.def + u.stats.spd, 0));
}
