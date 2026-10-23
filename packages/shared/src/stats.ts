import type { CombatStats, Rarity, Role, Stats } from './types';

export const MAX_CONSTELLATION = 6;

const ROLE_BASE: Record<Role, Stats> = {
  striker: { hp: 900, atk: 125, def: 50, spd: 102 },
  guardian: { hp: 1350, atk: 80, def: 95, spd: 94 },
  healer: { hp: 1000, atk: 95, def: 60, spd: 106 },
  support: { hp: 950, atk: 100, def: 60, spd: 112 },
};

const RARITY_MULT: Record<Rarity, number> = { 3: 0.85, 4: 1, 5: 1.2 };

export function characterBase(role: Role, rarity: Rarity): Stats {
  const b = ROLE_BASE[role];
  const m = RARITY_MULT[rarity];
  return {
    hp: Math.round(b.hp * m),
    atk: Math.round(b.atk * m),
    def: Math.round(b.def * m),
    spd: b.spd + (rarity - 4) * 2,
  };
}

/**
 * HP/ATK/DEF grow 10% of base per level, 6% per constellation, and by the
 * ascension bonus (e.g. 0.08 = +8%); SPD is fixed.
 */
export function scaleStats(base: Stats, level: number, constellation = 0, bonus = 0): Stats {
  const growth = (1 + 0.1 * (level - 1)) * (1 + 0.06 * constellation) * (1 + bonus);
  return {
    hp: Math.round(base.hp * growth),
    atk: Math.round(base.atk * growth),
    def: Math.round(base.def * growth),
    spd: base.spd,
  };
}

/** Everyone's combat stats before role, gear and passives. Matches the engine's old fixed 10% / ×1.5 crits. */
export const BASE_COMBAT: CombatStats = { critRate: 0.1, critDmg: 0.5, effectHit: 0, effectRes: 0 };

/** Small role flavour on top of the base: fighters crit more, tanks and healers resist, supports land debuffs. */
const ROLE_COMBAT: Record<Role, Partial<CombatStats>> = {
  striker: { critRate: 0.05, critDmg: 0.1 },
  guardian: { effectRes: 0.15 },
  healer: { effectRes: 0.1 },
  support: { effectHit: 0.15 },
};

export function roleCombat(role: Role): CombatStats {
  const r = ROLE_COMBAT[role];
  return {
    critRate: BASE_COMBAT.critRate + (r.critRate ?? 0),
    critDmg: BASE_COMBAT.critDmg + (r.critDmg ?? 0),
    effectHit: BASE_COMBAT.effectHit + (r.effectHit ?? 0),
    effectRes: BASE_COMBAT.effectRes + (r.effectRes ?? 0),
  };
}

export function constellationOf(copies: number): number {
  return Math.max(0, Math.min(copies - 1, MAX_CONSTELLATION));
}
