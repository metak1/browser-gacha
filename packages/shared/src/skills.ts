import { STATUS_INFO } from './statuses';
import type { CombatStats, Effect, EffectTarget, Passive, PassiveRule, PassiveStat, ScaleStat, Skill, Stats, StatusId, Targeting } from './types';

// Small builders so content files read like a spec sheet.
const scaled = (scale?: ScaleStat) => (scale && scale !== 'atk' ? { scale } : {});
export const dmg = (mult: number, to: EffectTarget = 'target', scale?: ScaleStat): Effect => ({ kind: 'damage', to, mult, ...scaled(scale) });
export const heal = (mult: number, to: EffectTarget = 'target', scale?: ScaleStat): Effect => ({ kind: 'heal', to, mult, ...scaled(scale) });
export const shield = (mult: number, to: EffectTarget = 'target', scale?: ScaleStat): Effect => ({ kind: 'shield', to, mult, ...scaled(scale) });
export const energy = (amount: number, to: EffectTarget = 'target'): Effect => ({ kind: 'energy', to, amount });
export const summonFx = (unit: string, count = 1): Effect => ({ kind: 'summon', to: 'self', unit, count });
export const advance = (amount: number, to: EffectTarget = 'target'): Effect => ({ kind: 'advance', to, amount });
export const status = (id: StatusId, turns: number, to: EffectTarget = 'target', chance?: number): Effect =>
  chance === undefined ? { kind: 'status', to, status: id, turns } : { kind: 'status', to, status: id, turns, chance };

export function skill(name: string, targeting: Targeting, cooldown: number, ...effects: Effect[]): Skill {
  return { name, targeting, cooldown, effects };
}

export function basicAttack(name: string, mult = 1): Skill {
  return skill(name, 'enemy', 0, dmg(mult));
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * Display names for summonable units, so descriptions read "Summon 2 Spark Imps"
 * rather than the id. The client fills this from content; ids are prettified otherwise.
 */
let unitNames: Record<string, string> = {};
export function setUnitNames(names: Record<string, string>) {
  unitNames = names;
}
const unitName = (id: string) => unitNames[id] ?? id.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function targetText(to: EffectTarget, targeting: Targeting, targetLabel?: string): string {
  switch (to) {
    case 'target':
      return targetLabel ?? (targeting === 'ally' ? 'an ally' : 'the target');
    case 'lowestAlly':
      return 'the most injured ally';
    case 'self':
      return 'self';
    case 'allEnemies':
      return 'all enemies';
    case 'allAllies':
      return 'all allies';
  }
}

/** "120% DEF", "8% max HP", "150% ATK (boosted by SPD)". */
export function scaleText(mult: number, scale: ScaleStat = 'atk'): string {
  if (scale === 'hp') return `${pct(mult)} of max HP`;
  if (scale === 'spd') return `${pct(mult)} ATK × SPD/100`;
  return `${pct(mult)} ${scale.toUpperCase()}`;
}

export function describeEffect(effect: Effect, targeting: Targeting, targetLabel?: string): string {
  const who = targetText(effect.to, targeting, targetLabel);
  switch (effect.kind) {
    case 'damage':
      return `Deal ${scaleText(effect.mult, effect.scale)} damage to ${who}`;
    case 'heal':
      return `Heal ${who} for ${scaleText(effect.mult, effect.scale)}`;
    case 'shield':
      return `Shield ${who} for ${scaleText(effect.mult, effect.scale)}`;
    case 'advance':
      return `Advance ${who} by ${pct(effect.amount)}`;
    case 'energy':
      return `Grant ${who} ${effect.amount} energy`;
    case 'summon': {
      const name = unitName(effect.unit);
      return effect.count === 1 ? `Summon a ${name}` : `Summon ${effect.count} ${name}s`;
    }
    case 'status': {
      const label = STATUS_INFO[effect.status].label;
      const turns = `${effect.turns} turn${effect.turns === 1 ? '' : 's'}`;
      const prefix = effect.chance === undefined ? 'Apply' : `${pct(effect.chance)} chance to apply`;
      return `${prefix} ${label} to ${who} for ${turns}`;
    }
  }
}

export function describeSkill(s: Skill): string {
  return s.effects.map((e) => describeEffect(e, s.targeting)).join('. ') + '.';
}

const TRIGGER_TEXT = {
  battleStart: 'At battle start',
  turnStart: 'At the start of each of its turns',
  hit: 'When hit by an enemy',
  kill: 'After defeating an enemy',
} as const;

export function describePassiveRule(r: PassiveRule): string {
  switch (r.kind) {
    case 'stat':
      return `+${pct(r.amount)} ${r.stat.toUpperCase()}`;
    case 'damageVsStatus':
      return `+${pct(r.amount)} damage to enemies with ${STATUS_INFO[r.status].label}`;
    case 'lowHpDamage':
      return `+${pct(r.amount)} damage while below ${pct(r.threshold)} HP`;
    case 'critRate':
      return `+${pct(r.amount)} critical hit chance`;
    case 'combat':
      return `+${pct(r.amount)} ${COMBAT_LABEL[r.stat]}`;
    case 'trigger': {
      const when = TRIGGER_TEXT[r.on] + (r.chance !== undefined ? ` (${pct(r.chance)} chance)` : '');
      const what = r.effects.map((e) => describeEffect(e, 'none', r.on === 'hit' ? 'the attacker' : undefined)).join(', then ');
      return `${when}: ${what.charAt(0).toLowerCase()}${what.slice(1)}`;
    }
  }
}

export function describePassive(p: Passive): string {
  return p.rules.map(describePassiveRule).join('. ') + '.';
}

export const COMBAT_LABEL: Record<keyof CombatStats, string> = {
  critRate: 'Crit Rate',
  critDmg: 'Crit DMG',
  effectHit: 'Effect Hit',
  effectRes: 'Effect RES',
};

/** Adds a passive's combat-stat rules (and the older crit-chance rule) to a set of combat stats. */
export function applyPassiveCombat(stats: CombatStats, passive: Passive | null | undefined): CombatStats {
  const out = { ...stats };
  for (const r of passive?.rules ?? []) {
    if (r.kind === 'combat') out[r.stat] += r.amount;
    if (r.kind === 'critRate') out.critRate += r.amount;
  }
  return out;
}

/** Applies a passive's permanent +% stat rules. */
export function applyPassiveStats(stats: Stats, passive: Passive | null | undefined): Stats {
  if (!passive) return stats;
  const bonus: Record<PassiveStat, number> = { hp: 0, atk: 0, def: 0, spd: 0 };
  for (const r of passive.rules) if (r.kind === 'stat') bonus[r.stat] += r.amount;
  return {
    hp: Math.round(stats.hp * (1 + bonus.hp)),
    atk: Math.round(stats.atk * (1 + bonus.atk)),
    def: Math.round(stats.def * (1 + bonus.def)),
    spd: Math.round(stats.spd * (1 + bonus.spd)),
  };
}
