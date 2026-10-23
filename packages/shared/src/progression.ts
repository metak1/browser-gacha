/**
 * Hero progression rules: ascension (level caps + stat bonuses) and skill levels.
 * All numbers come from content settings, so admins can retune them.
 */
import type { ContentIndex } from './content';
import type { AscensionStep, MaterialDef, ProgressionSettings, SkillLevelStep } from './content/types';
import type { ElementId, Skill } from './types';

export function maxAscension(p: ProgressionSettings): number {
  return p.ascension.length;
}

/** Level cap for a hero at an ascension rank (0 = not ascended). */
export function levelCap(p: ProgressionSettings, rank: number, maxLevel: number): number {
  const cap = rank <= 0 ? p.baseCap : (p.ascension[Math.min(rank, p.ascension.length) - 1]?.cap ?? p.baseCap);
  return Math.min(cap, maxLevel);
}

/** The step that takes a hero from `rank` to `rank + 1`, or null at max. */
export function nextAscension(p: ProgressionSettings, rank: number): AscensionStep | null {
  return p.ascension[rank] ?? null;
}

/** Total permanent stat bonus from ascension ranks (0.13 = +13%). */
export function ascensionBonus(p: ProgressionSettings, rank: number): number {
  return p.ascension.slice(0, Math.max(0, rank)).reduce((sum, s) => sum + s.statBonus, 0);
}

/** The lowest rank whose cap allows this level (used for migrated heroes and bots). */
export function minRankForLevel(p: ProgressionSettings, level: number): number {
  if (level <= p.baseCap) return 0;
  const i = p.ascension.findIndex((s) => s.cap >= level);
  return i < 0 ? p.ascension.length : i + 1;
}

export function essenceFor(content: ContentIndex, element: ElementId): MaterialDef | undefined {
  return content.bundle.materials.find((m) => m.element === element);
}

export function maxSkillLevel(p: ProgressionSettings): number {
  return p.skillLevels.length + 1;
}

/** Cost to raise a skill from `level` to `level + 1`, or null at max. */
export function skillLevelCost(p: ProgressionSettings, level: number): SkillLevelStep | null {
  return p.skillLevels[level - 1] ?? null;
}

/** A skill as it plays at a given level: damage/heal/shield multipliers scale up. */
export function levelSkill<T extends Skill>(skill: T, level: number, bonusPerLevel: number): T {
  if (level <= 1) return skill;
  const factor = 1 + bonusPerLevel * (level - 1);
  return {
    ...skill,
    effects: skill.effects.map((e) =>
      e.kind === 'damage' || e.kind === 'heal' || e.kind === 'shield' ? { ...e, mult: Math.round(e.mult * factor * 100) / 100 } : e,
    ),
  };
}
