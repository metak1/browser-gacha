import type { ContentIndex } from './content';

/** Account flags set by the guided tutorial. */
export const GUIDE_FLAGS = {
  welcome: 'guide-welcome',
  levelUp: 'guide-levelup',
  done: 'guide-done',
  /** Set by the server when the free first 10× summon is used. */
  firstSummon: 'first-summon',
} as const;

/**
 * Where a player is in the guided tutorial:
 * welcome → first 10× summon → first battle → level up a hero → wrap-up.
 */
export type GuideStep = 'welcome' | 'summon' | 'battle' | 'levelUp' | 'finish';

interface GuideState {
  flags: string[];
  clearedStages: string[];
  roster: { id: string }[];
  banners: Record<string, { pity5: number; pity4: number }>;
}

/** Whether the free first 10× summon is still available to this player. */
export function firstSummonFree(content: ContentIndex, flags: string[]): boolean {
  return content.settings.firstSummon.free && !flags.includes(GUIDE_FLAGS.firstSummon);
}

/** The player's current tutorial step, or null when it's finished, skipped or not for them. */
export function guideStep(content: ContentIndex, p: GuideState): GuideStep | null {
  const has = (f: string) => p.flags.includes(f);
  if (has(GUIDE_FLAGS.done)) return null;
  if (!has(GUIDE_FLAGS.welcome)) {
    // Accounts that were already playing before the tutorial existed don't get it.
    const pulled = Object.values(p.banners).some((b) => b.pity5 > 0 || b.pity4 > 0);
    if (p.clearedStages.length > 1 || pulled || p.roster.length > content.settings.starterCharacters.length) return null;
    return 'welcome';
  }
  if (!has(GUIDE_FLAGS.firstSummon)) return 'summon';
  const first = content.stages[0];
  if (first && !p.clearedStages.includes(first.id)) return 'battle';
  if (!has(GUIDE_FLAGS.levelUp)) return 'levelUp';
  return 'finish';
}
