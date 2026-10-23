export type ElementId = 'flame' | 'tide' | 'gale' | 'stone' | 'volt' | 'frost';
export type Rarity = 3 | 4 | 5;
export type Role = 'striker' | 'guardian' | 'healer' | 'support';
export type StatusId = 'burn' | 'stun' | 'atkUp' | 'defUp' | 'defDown' | 'spdUp' | 'taunt';

export const ELEMENT_IDS: ElementId[] = ['flame', 'tide', 'gale', 'stone', 'volt', 'frost'];
export const ROLE_IDS: Role[] = ['striker', 'guardian', 'healer', 'support'];
export const STATUS_IDS: StatusId[] = ['burn', 'stun', 'atkUp', 'defUp', 'defDown', 'spdUp', 'taunt'];

export interface Stats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
}

/** Combat stats, as fractions (0.1 = 10%). They don't grow with level; gear, passives and role raise them. */
export interface CombatStats {
  /** Chance for a hit to crit. */
  critRate: number;
  /** Extra damage on a crit (0.5 = crits deal 150%). */
  critDmg: number;
  /** Raises the chance that this unit's debuffs land. */
  effectHit: number;
  /** Lowers the chance that enemy debuffs land on this unit. */
  effectRes: number;
}
export type CombatStat = keyof CombatStats;
export const COMBAT_STATS: CombatStat[] = ['critRate', 'critDmg', 'effectHit', 'effectRes'];

/**
 * What a damage, heal or shield effect is a multiple of. `spd` means ATK boosted by speed
 * (ATK × SPD / 100), since SPD itself doesn't grow with level; `hp` is the caster's max HP.
 */
export type ScaleStat = 'atk' | 'def' | 'hp' | 'spd';
export const SCALE_STATS: ScaleStat[] = ['atk', 'def', 'hp', 'spd'];

/**
 * Who an effect lands on. `target` is the unit picked when the skill was used
 * (for a passive's "when hit" trigger, it's the attacker). `lowestAlly` is the
 * living ally with the lowest HP %.
 */
export type EffectTarget = 'target' | 'self' | 'allEnemies' | 'allAllies' | 'lowestAlly';
export const EFFECT_TARGETS: EffectTarget[] = ['target', 'self', 'allEnemies', 'allAllies', 'lowestAlly'];

export type Effect =
  | { kind: 'damage'; to: EffectTarget; mult: number; scale?: ScaleStat }
  | { kind: 'heal'; to: EffectTarget; mult: number; scale?: ScaleStat }
  | { kind: 'shield'; to: EffectTarget; mult: number; scale?: ScaleStat }
  | { kind: 'status'; to: EffectTarget; status: StatusId; turns: number; chance?: number }
  | { kind: 'advance'; to: EffectTarget; amount: number }
  /** Grants energy (0–100 scale) toward ultimates. */
  | { kind: 'energy'; to: EffectTarget; amount: number }
  /** Calls enemy units (by enemy id) onto the caster's side, at the caster's level. `to` is ignored. */
  | { kind: 'summon'; to: EffectTarget; unit: string; count: number };
export type EffectKind = Effect['kind'];
export const EFFECT_KINDS: EffectKind[] = ['damage', 'heal', 'shield', 'status', 'advance', 'energy', 'summon'];

/** What has to be picked when using a skill. */
export type Targeting = 'enemy' | 'ally' | 'none';
export const TARGETINGS: Targeting[] = ['enemy', 'ally', 'none'];

export type PassiveStat = 'hp' | 'atk' | 'def' | 'spd';
export type PassiveTrigger = 'battleStart' | 'turnStart' | 'hit' | 'kill';
export const PASSIVE_TRIGGERS: PassiveTrigger[] = ['battleStart', 'turnStart', 'hit', 'kill'];

/** One rule of a passive ability. */
export type PassiveRule =
  /** Permanent +% to a stat (0.15 = +15%). */
  | { kind: 'stat'; stat: PassiveStat; amount: number }
  /** +% damage against targets that have a status. */
  | { kind: 'damageVsStatus'; status: StatusId; amount: number }
  /** +% damage while this unit's HP is below a fraction of max. */
  | { kind: 'lowHpDamage'; threshold: number; amount: number }
  /** Extra critical-hit chance (0.1 = +10 points). Kept for older content; `combat` covers it. */
  | { kind: 'critRate'; amount: number }
  /** Flat bonus to a combat stat (0.1 = +10 points). */
  | { kind: 'combat'; stat: CombatStat; amount: number }
  /** Effects that fire on an event, optionally with a chance. */
  | { kind: 'trigger'; on: PassiveTrigger; chance?: number; effects: Effect[] };
export type PassiveRuleKind = PassiveRule['kind'];
export const PASSIVE_RULE_KINDS: PassiveRuleKind[] = ['stat', 'combat', 'damageVsStatus', 'lowHpDamage', 'critRate', 'trigger'];

/** An always-on ability. */
export interface Passive {
  name: string;
  rules: PassiveRule[];
}

/** A skill as the battle engine sees it. */
export interface Skill {
  name: string;
  targeting: Targeting;
  /** Own turns before the skill can be used again. 0 = every turn. */
  cooldown: number;
  effects: Effect[];
  /** Icon number in the icon sheet (see assets.generated.ts), if any. */
  icon?: number | null;
}
