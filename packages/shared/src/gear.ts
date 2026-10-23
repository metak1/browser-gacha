/**
 * Equipment: templates live in content (GearDef); players own rolled instances
 * (GearItem). An item stores its rolled numbers, so editing a template later
 * only affects new drops.
 */
import type { GameSettings, GearDef, GearSetDef } from './content/types';
import { BASE_COMBAT } from './stats';
import type { CombatStat, CombatStats, Rarity, Stats } from './types';

export type GearSlot = 'weapon' | 'armor' | 'charm' | 'boots';
export const GEAR_SLOTS: GearSlot[] = ['weapon', 'armor', 'charm', 'boots'];
export const GEAR_SLOT_INFO: Record<GearSlot, { label: string; icon: string }> = {
  weapon: { label: 'Weapon', icon: '⚔️' },
  armor: { label: 'Armor', icon: '🛡️' },
  charm: { label: 'Charm', icon: '📿' },
  boots: { label: 'Boots', icon: '👢' },
};

/** SPD as a main stat only exists on boots. */
export const BOOTS_ONLY_MAIN: GearStat[] = ['spd'];

/** Main stats each slot can roll when its template doesn't fix one. Only boots can have SPD. */
export const MAIN_POOLS: Record<GearSlot, GearStat[]> = {
  weapon: ['atk', 'atkPct', 'critRate', 'critDmg'],
  armor: ['hp', 'hpPct', 'def', 'defPct', 'effectRes'],
  charm: ['atkPct', 'hpPct', 'defPct', 'critRate', 'critDmg', 'effectHit', 'effectRes'],
  boots: ['spd', 'atkPct', 'hpPct', 'defPct'],
};

/** Main stat at +0 on a ★4, by stat; other rarities scale by MAIN_RARITY. */
export const MAIN_BASE: Record<GearStat, number> = {
  atk: 28,
  hp: 190,
  def: 22,
  spd: 4,
  atkPct: 0.06,
  hpPct: 0.07,
  defPct: 0.08,
  critRate: 0.05,
  critDmg: 0.1,
  effectHit: 0.07,
  effectRes: 0.07,
};
export const MAIN_RARITY: Record<Rarity, number> = { 3: 0.65, 4: 1, 5: 1.5 };

/** The unrounded +0 main value for a stat at a rarity. */
export const mainBaseFor = (stat: GearStat, rarity: Rarity) => MAIN_BASE[stat] * MAIN_RARITY[rarity];

export type GearStat = 'hp' | 'atk' | 'def' | 'spd' | 'hpPct' | 'atkPct' | 'defPct' | CombatStat;
export const GEAR_STATS: GearStat[] = ['hp', 'atk', 'def', 'spd', 'hpPct', 'atkPct', 'defPct', 'critRate', 'critDmg', 'effectHit', 'effectRes'];
/** Gear stats that feed combat stats (crit, effect hit/res) rather than HP/ATK/DEF/SPD. */
export const isCombatStat = (s: GearStat): s is CombatStat => s === 'critRate' || s === 'critDmg' || s === 'effectHit' || s === 'effectRes';
export const isPercentStat = (s: GearStat) => s.endsWith('Pct') || isCombatStat(s);

export interface GearRoll {
  stat: GearStat;
  value: number;
  /** Substats only: how many rolls the value is made of (the first, plus upgrade boosts). Missing on older items. */
  rolls?: number;
}

export interface GearItem {
  id: string;
  templateId: string;
  slot: GearSlot;
  rarity: Rarity;
  level: number;
  /** Unrounded main stat at +0, so upgrades don't accumulate rounding drift. */
  mainBase: number;
  main: GearRoll;
  subs: GearRoll[];
  /** Character id wearing it, if any. */
  equippedTo: string | null;
  /** The gear set it belongs to (null on gear from before sets existed). */
  set: string | null;
}

/** Gear sets by id. */
export type GearSets = Record<string, GearSetDef>;

export const GEAR_RULES = {
  substatsAtDrop: { 3: 1, 4: 2, 5: 3 } as Record<Rarity, number>,
  maxSubs: 4,
  /** Every N levels a new substat is added (or an existing one improved). */
  subEvery: 3,
  /** Main stat grows by this fraction of its base per level. */
  mainGrowth: 0.12,
  /** Substat roll ranges [min, max] before the rarity multiplier. */
  subRanges: {
    hp: [40, 90],
    atk: [8, 18],
    def: [6, 14],
    spd: [2, 5],
    hpPct: [0.03, 0.06],
    atkPct: [0.03, 0.06],
    defPct: [0.04, 0.08],
    critRate: [0.02, 0.04],
    critDmg: [0.04, 0.08],
    effectHit: [0.03, 0.06],
    effectRes: [0.03, 0.06],
  } as Record<GearStat, [number, number]>,
  rarityMult: { 3: 0.8, 4: 1, 5: 1.25 } as Record<Rarity, number>,
};

const roundStat = (stat: GearStat, v: number) => (isPercentStat(stat) ? Math.round(v * 1000) / 1000 : Math.round(v));

/** One roll of a substat's value. */
function rollValue(stat: GearStat, rarity: Rarity, rng: () => number): number {
  const [min, max] = GEAR_RULES.subRanges[stat];
  return (min + rng() * (max - min)) * GEAR_RULES.rarityMult[rarity];
}

function rollSub(rarity: Rarity, exclude: GearStat[], rng: () => number): GearRoll {
  const pool = GEAR_STATS.filter((s) => !exclude.includes(s));
  const stat = pool[Math.floor(rng() * pool.length)]!;
  return { stat, value: roundStat(stat, rollValue(stat, rarity, rng)), rolls: 1 };
}

export function mainStatValue(main: { mainStat: GearStat; mainBase: number }, level: number): number {
  return roundStat(main.mainStat, main.mainBase * (1 + GEAR_RULES.mainGrowth * level));
}

/**
 * Rolls a fresh item from a template: a main stat (the template's, or a random one from
 * the slot's pool when it has none), random bonus stats, and a set (the template's, or a random one).
 */
export function rollGear(template: GearDef, rng: () => number, sets: GearSetDef[]): Omit<GearItem, 'id' | 'equippedTo'> {
  const pool = MAIN_POOLS[template.slot];
  const mainStat = template.mainStat ?? pool[Math.floor(rng() * pool.length)]!;
  const mainBase = template.mainStat ? template.mainBase : mainBaseFor(mainStat, template.rarity);
  const subs: GearRoll[] = [];
  for (let i = 0; i < GEAR_RULES.substatsAtDrop[template.rarity]; i++) {
    subs.push(rollSub(template.rarity, [mainStat, ...subs.map((s) => s.stat)], rng));
  }
  const set = template.set ?? (sets.length ? sets[Math.floor(rng() * sets.length)]!.id : null);
  return {
    templateId: template.id,
    set,
    slot: template.slot,
    rarity: template.rarity,
    level: 0,
    mainBase,
    main: { stat: mainStat, value: mainStatValue({ mainStat, mainBase }, 0) },
    subs,
  };
}

/** Returns a copy of the item raised one level. */
export function upgradeGear<T extends Omit<GearItem, 'id' | 'equippedTo'>>(item: T, rng: () => number): T {
  const next = structuredClone(item);
  next.level = item.level + 1;
  next.main = { stat: item.main.stat, value: mainStatValue({ mainStat: item.main.stat, mainBase: item.mainBase }, next.level) };
  if (next.level % GEAR_RULES.subEvery === 0) {
    if (next.subs.length < GEAR_RULES.maxSubs) {
      next.subs.push(rollSub(next.rarity, [next.main.stat, ...next.subs.map((s) => s.stat)], rng));
    } else {
      const i = Math.floor(rng() * next.subs.length);
      const sub = next.subs[i]!;
      const boost = rollSub(next.rarity, GEAR_STATS.filter((s) => s !== sub.stat), rng);
      next.subs[i] = { stat: sub.stat, value: roundStat(sub.stat, sub.value + boost.value), rolls: subRolls(sub, next.rarity) + 1 };
    }
  }
  return next;
}

/**
 * One number for a stat block, to compare heroes or gear choices. Crits multiply ATK's
 * worth by their expected damage; effect hit and RES count a little on their own.
 */
export function statPower(s: Stats, c: CombatStats = BASE_COMBAT): number {
  const crit = 1 + Math.min(1, c.critRate) * c.critDmg;
  return Math.round(s.hp / 4 + s.atk * 2 * crit + s.def * 1.5 + s.spd + (c.effectHit + c.effectRes) * 150);
}

type Worn = Pick<GearItem, 'main' | 'subs' | 'set'>;

/** How many pieces of each set a loadout wears, with the set's bonuses and whether each is earned. */
export function wornSets(gear: Pick<GearItem, 'set'>[], sets: GearSets): { set: GearSetDef; pieces: number; bonuses: (GearSetDef['bonuses'][number] & { active: boolean })[] }[] {
  const counts = new Map<string, number>();
  for (const item of gear) if (item.set && sets[item.set]) counts.set(item.set, (counts.get(item.set) ?? 0) + 1);
  return [...counts].map(([id, pieces]) => {
    const set = sets[id]!;
    return { set, pieces, bonuses: set.bonuses.map((b) => ({ ...b, active: pieces >= b.pieces })) };
  });
}

/** The set bonuses a loadout has earned, as extra stat rolls. */
export function setBonusRolls(gear: Pick<GearItem, 'set'>[], sets: GearSets): GearRoll[] {
  return wornSets(gear, sets).flatMap((w) => w.bonuses.filter((b) => b.active).map((b) => ({ stat: b.stat, value: b.value })));
}

/** Every stat a loadout adds: each item's main and bonus stats, then its set bonuses. */
const loadoutRolls = (gear: Worn[], sets: GearSets): GearRoll[] => [...gear.flatMap((item) => [item.main, ...item.subs]), ...setBonusRolls(gear, sets)];

/** Combat stats with gear on top (gear crit, crit DMG, effect hit and RES add flat points). */
export function applyGearCombat(stats: CombatStats, gear: Worn[], sets: GearSets): CombatStats {
  const out = { ...stats };
  for (const roll of loadoutRolls(gear, sets)) if (isCombatStat(roll.stat)) out[roll.stat] += roll.value;
  return out;
}

/**
 * The best gear a hero can wear from the bag. Slot by slot, it picks the piece that gives the
 * whole loadout the most power, set bonuses included; a second pass lets sets come together.
 * Only free gear (or the hero's own) is used, so auto-equip never takes gear off another hero.
 */
export function bestLoadout(
  base: Stats,
  gear: GearItem[],
  charId: string,
  sets: GearSets,
  combat: CombatStats = BASE_COMBAT,
): { slot: GearSlot; current: GearItem | null; best: GearItem | null }[] {
  const power = (items: GearItem[]) => statPower(applyGear(base, items, sets), applyGearCombat(combat, items, sets));
  const current = new Map(GEAR_SLOTS.map((slot) => [slot, gear.find((g) => g.slot === slot && g.equippedTo === charId) ?? null]));
  const pick = new Map(current);
  const loadout = (slot: GearSlot, item: GearItem | null) =>
    GEAR_SLOTS.flatMap((s) => {
      const g = s === slot ? item : pick.get(s);
      return g ? [g] : [];
    });
  for (let pass = 0; pass < 2; pass++) {
    for (const slot of GEAR_SLOTS) {
      let bestPower = power(loadout(slot, pick.get(slot) ?? null));
      for (const g of gear) {
        if (g.slot !== slot || (g.equippedTo !== null && g.equippedTo !== charId)) continue;
        const p = power(loadout(slot, g));
        if (p > bestPower) {
          pick.set(slot, g);
          bestPower = p;
        }
      }
    }
  }
  return GEAR_SLOTS.map((slot) => ({ slot, current: current.get(slot) ?? null, best: pick.get(slot) ?? null }));
}

/** Final stats with gear: percentages scale the unit's own stats, flats are added on top. */
export function applyGear(stats: Stats, gear: Worn[], sets: GearSets): Stats {
  const flat: Stats = { hp: 0, atk: 0, def: 0, spd: 0 };
  const pct = { hp: 0, atk: 0, def: 0 };
  for (const roll of loadoutRolls(gear, sets)) {
    if (isCombatStat(roll.stat)) continue;
    if (roll.stat === 'hpPct') pct.hp += roll.value;
    else if (roll.stat === 'atkPct') pct.atk += roll.value;
    else if (roll.stat === 'defPct') pct.def += roll.value;
    else flat[roll.stat] += roll.value;
  }
  return {
    hp: Math.round(stats.hp * (1 + pct.hp) + flat.hp),
    atk: Math.round(stats.atk * (1 + pct.atk) + flat.atk),
    def: Math.round(stats.def * (1 + pct.def) + flat.def),
    spd: Math.round(stats.spd + flat.spd),
  };
}

export function gearUpgradeCost(settings: GameSettings, item: Pick<GearItem, 'level' | 'rarity'>): number {
  return Math.round((settings.gearUpgradeBase + settings.gearUpgradePerLevel * item.level) * GEAR_RULES.rarityMult[item.rarity]);
}

export function gearSalvageValue(settings: GameSettings, item: Pick<GearItem, 'level' | 'rarity'>): number {
  return Math.round(settings.gearSalvageBase * (item.rarity - 2) * (1 + item.level / 3));
}

const STAT_LABEL: Record<GearStat, string> = {
  hp: 'HP',
  atk: 'ATK',
  def: 'DEF',
  spd: 'SPD',
  hpPct: 'HP',
  atkPct: 'ATK',
  critRate: 'Crit Rate',
  critDmg: 'Crit DMG',
  effectHit: 'Effect Hit',
  effectRes: 'Effect RES',
  defPct: 'DEF',
};

export function formatGearRoll(roll: GearRoll): string {
  return isPercentStat(roll.stat)
    ? `+${(roll.value * 100).toFixed(1)}% ${STAT_LABEL[roll.stat]}`
    : `+${roll.value} ${STAT_LABEL[roll.stat]}`;
}

export const gearStatLabel = (stat: GearStat) => (isCombatStat(stat) ? STAT_LABEL[stat] : isPercentStat(stat) ? `${STAT_LABEL[stat]} %` : STAT_LABEL[stat]);

/** A rough "how good is this" number for sorting. */
export function gearScore(item: Pick<GearItem, 'main' | 'subs'>): number {
  const weight: Record<GearStat, number> = {
    hp: 0.15, atk: 1, def: 1, spd: 4, hpPct: 300, atkPct: 400, defPct: 300,
    critRate: 600, critDmg: 300, effectHit: 250, effectRes: 250,
  };
  return Math.round([item.main, ...item.subs].reduce((s, r) => s + r.value * weight[r.stat], 0));
}

// ---------- reforging ----------

/** How many rolls a substat holds: stored on newer items, estimated from the value on older ones. */
export function subRolls(sub: GearRoll, rarity: Rarity): number {
  if (sub.rolls) return sub.rolls;
  const [min, max] = GEAR_RULES.subRanges[sub.stat];
  return Math.max(1, Math.round(sub.value / (((min + max) / 2) * GEAR_RULES.rarityMult[rarity])));
}

/** The best value a substat with this many rolls can have. */
export const perfectSubValue = (stat: GearStat, rarity: Rarity, rolls: number) =>
  roundStat(stat, GEAR_RULES.subRanges[stat][1] * GEAR_RULES.rarityMult[rarity] * rolls);

/** How good a substat's value is for its roll count, from 0 to 1 (1 = perfect). */
export function subQuality(sub: GearRoll, rarity: Rarity): number {
  return Math.min(1, sub.value / perfectSubValue(sub.stat, rarity, subRolls(sub, rarity)));
}

/** Stats a substat could become: never the main stat or another substat. */
export function reforgeOptions(item: Pick<GearItem, 'main' | 'subs'>, index: number): GearStat[] {
  const taken = [item.main.stat, ...item.subs.filter((_, i) => i !== index).map((s) => s.stat)];
  return GEAR_STATS.filter((s) => !taken.includes(s));
}

/**
 * Rerolls one substat into a different random stat with fresh values, keeping its
 * roll count (so upgrade boosts aren't lost). Always random: there is no way to pick the result.
 */
export function reforgeSub<T extends Pick<GearItem, 'main' | 'subs' | 'rarity'>>(item: T, index: number, rng: () => number): T {
  const sub = item.subs[index];
  if (!sub) throw new Error('No such substat');
  const options = reforgeOptions(item, index).filter((s) => s !== sub.stat);
  const stat = options[Math.floor(rng() * options.length)]!;
  const rolls = subRolls(sub, item.rarity);
  let value = 0;
  for (let i = 0; i < rolls; i++) value += rollValue(stat, item.rarity, rng);
  const next = structuredClone(item);
  next.subs[index] = { stat, value: roundStat(stat, value), rolls };
  return next;
}

/** Gold for one reforge of this item. */
export const reforgeGold = (settings: GameSettings, item: Pick<GearItem, 'rarity'>) => Math.round(settings.reforge.gold * GEAR_RULES.rarityMult[item.rarity]);

/** Reforge stones from salvaging an item of this rarity. */
export const salvageStones = (settings: GameSettings, rarity: Rarity) => settings.reforge.salvageStones[`r${rarity}` as 'r3' | 'r4' | 'r5'] ?? 0;
