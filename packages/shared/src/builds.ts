import type { ContentIndex } from './content';
import type { CharacterDef } from './content/types';
import type { GearItem, GearStat } from './gear';
import type { Role, ScaleStat } from './types';

/** A suggested gear setup: the main stat to look for in each slot, and bonus stats. Main stats roll randomly from each slot's pool. */
export interface StatBuild {
  /** Weapon main stats, best first. */
  weapon: GearStat[];
  /** Armor main stats, best first. */
  armor: GearStat[];
  /** Charm main stats, best first. */
  charm: GearStat[];
  /** Boots main stats, best first (only boots can have SPD). */
  boots: GearStat[];
  /** Bonus stats to look for (and keep when reforging), best first. */
  subs: GearStat[];
  /** Why, in one line. */
  why: string;
}

/** Builds by role, for heroes whose spells scale with ATK (the default). */
export const ROLE_BUILDS: Record<Role, StatBuild> = {
  striker: {
    weapon: ['critDmg', 'critRate', 'atkPct'],
    armor: ['hpPct', 'hp'],
    charm: ['critRate', 'critDmg', 'atkPct'],
    boots: ['atkPct', 'spd'],
    subs: ['critRate', 'critDmg', 'atkPct', 'spd'],
    why: 'Damage scales with ATK, and crits multiply it.',
  },
  guardian: {
    weapon: ['atkPct', 'atk'],
    armor: ['hpPct', 'defPct', 'effectRes'],
    charm: ['hpPct', 'defPct'],
    boots: ['hpPct', 'defPct'],
    subs: ['hpPct', 'defPct', 'effectRes', 'hp'],
    why: 'A tank has to survive the hits it draws, and shrug off stuns.',
  },
  healer: {
    weapon: ['atkPct', 'atk'],
    armor: ['hpPct', 'effectRes'],
    charm: ['atkPct', 'hpPct'],
    boots: ['spd', 'hpPct'],
    subs: ['atkPct', 'spd', 'hpPct', 'effectRes'],
    why: 'Heals scale with ATK, and speed gets them out before allies fall.',
  },
  support: {
    weapon: ['atkPct', 'atk'],
    armor: ['hpPct', 'effectRes'],
    charm: ['effectHit', 'hpPct'],
    boots: ['spd'],
    subs: ['spd', 'effectHit', 'hpPct', 'effectRes'],
    why: 'Act first, and make the debuffs land.',
  },
};

/** For heroes whose spells mostly scale with something other than ATK. */
const SCALING_BUILDS: Record<Exclude<ScaleStat, 'atk'>, (role: Role) => StatBuild> = {
  def: () => ({
    weapon: ['atkPct', 'critRate'],
    armor: ['defPct', 'def'],
    charm: ['defPct', 'hpPct'],
    boots: ['defPct', 'hpPct'],
    subs: ['defPct', 'def', 'hpPct', 'effectRes'],
    why: 'Its spells scale with DEF: every point of DEF is also shield and damage.',
  }),
  hp: () => ({
    weapon: ['atkPct', 'atk'],
    armor: ['hpPct', 'hp'],
    charm: ['hpPct', 'effectRes'],
    boots: ['hpPct', 'spd'],
    subs: ['hpPct', 'hp', 'spd', 'effectRes'],
    why: 'Its spells scale with max HP: more HP means bigger heals.',
  }),
  spd: (role) => ({
    weapon: role === 'striker' ? ['critDmg', 'critRate', 'atkPct'] : ['atkPct', 'atk'],
    armor: ['hpPct', 'hp'],
    charm: role === 'striker' ? ['critRate', 'critDmg', 'atkPct'] : ['atkPct', 'effectHit'],
    boots: ['spd'],
    subs: role === 'striker' ? ['spd', 'critRate', 'critDmg', 'atkPct'] : ['spd', 'atkPct', 'effectHit', 'hpPct'],
    why: 'Its spells are boosted by SPD: speed means more turns and harder hits.',
  }),
};

/** The stat a hero's skill and ultimate mostly scale with (the basic attack doesn't count). */
export function mainScaling(content: ContentIndex, c: Pick<CharacterDef, 'skill' | 'ultimate'>): ScaleStat {
  const counts: Partial<Record<ScaleStat, number>> = {};
  for (const id of [c.skill, c.ultimate]) {
    for (const e of (id && content.skillsById[id]?.effects) || []) {
      if (e.kind === 'damage' || e.kind === 'heal' || e.kind === 'shield') counts[e.scale ?? 'atk'] = (counts[e.scale ?? 'atk'] ?? 0) + 1;
    }
  }
  let best: ScaleStat = 'atk';
  for (const [s, n] of Object.entries(counts) as [ScaleStat, number][]) if (n > (counts[best] ?? 0)) best = s;
  return best;
}

export const recommendedBuild = (role: Role, scaling: ScaleStat = 'atk'): StatBuild => (scaling === 'atk' ? ROLE_BUILDS[role] : SCALING_BUILDS[scaling](role));

/** A hero's build from their role and what their spells scale with. */
export const heroBuild = (content: ContentIndex, c: CharacterDef): StatBuild => recommendedBuild(c.role, mainScaling(content, c));

/** How many of the bonus stats on this gear are on the build's list. */
export function buildMatch(build: StatBuild, gear: Pick<GearItem, 'subs'>[]): { matched: number; total: number } {
  const subs = gear.flatMap((g) => g.subs);
  return { matched: subs.filter((s) => build.subs.includes(s.stat)).length, total: subs.length };
}
