import type { BattleState } from '../battle/types';
import type { StageDef, StageObjective } from './types';

export function describeObjective(o: StageObjective): string {
  switch (o.kind) {
    case 'win':
      return 'Win the battle';
    case 'noDeaths':
      return 'No hero is defeated';
    case 'maxActions':
      return `Win in ${o.value} actions or fewer`;
  }
}

/**
 * Which objectives a finished battle met. Every objective needs a victory.
 * `allyActions` is the number of actions the player took.
 */
export function evaluateObjectives(objectives: StageObjective[], state: BattleState, allyActions: number): boolean[] {
  const won = state.outcome === 'victory';
  return objectives.map((o) => {
    if (!won) return false;
    switch (o.kind) {
      case 'win':
        return true;
      case 'noDeaths':
        return state.units.every((u) => u.side !== 'ally' || u.hp > 0);
      case 'maxActions':
        return allyActions <= o.value;
    }
  });
}

/** Stars a stage awards: one per objective met, at least one for any victory. */
export function starsEarned(met: boolean[], won: boolean): number {
  if (!won) return 0;
  return Math.max(1, met.filter(Boolean).length);
}

/** Stars earned / available across a chapter's stages, from the player's best per stage. */
export function chapterStars(stages: StageDef[], chapterId: number, best: Record<string, number>): { earned: number; max: number } {
  let earned = 0;
  let max = 0;
  for (const s of stages) {
    if (s.chapter !== chapterId) continue;
    const cap = Math.max(1, s.objectives.length);
    max += cap;
    earned += Math.min(best[s.id] ?? 0, cap);
  }
  return { earned, max };
}
