/** Default passives, stage objectives and chapter star chests. */
import { advance, dmg, energy, heal, shield, status } from '../skills';
import type { Effect, Passive, PassiveRule, PassiveTrigger } from '../types';
import type { ChapterDef, StageObjective } from './types';

const p = (name: string, ...rules: PassiveRule[]): Passive => ({ name, rules });
const stat = (s: 'hp' | 'atk' | 'def' | 'spd', amount: number): PassiveRule => ({ kind: 'stat', stat: s, amount });
const vs = (s: Parameters<typeof status>[0], amount: number): PassiveRule => ({ kind: 'damageVsStatus', status: s, amount });
const crit = (amount: number): PassiveRule => ({ kind: 'critRate', amount });
const lowHp = (threshold: number, amount: number): PassiveRule => ({ kind: 'lowHpDamage', threshold, amount });
const on = (trigger: PassiveTrigger, effects: Effect[], chance?: number): PassiveRule =>
  chance === undefined ? { kind: 'trigger', on: trigger, effects } : { kind: 'trigger', on: trigger, chance, effects };

export const DEFAULT_PASSIVES: Record<string, Passive> = {
  // ★5
  ignis: p('Inferno Heart', vs('burn', 0.25), on('kill', [energy(20, 'self')])),
  marina: p('Healing Tides', on('turnStart', [heal(0.35, 'lowestAlly')])),
  zephyr: p('Tailwind', stat('spd', 0.1), on('kill', [advance(0.3, 'self')])),
  gaia: p('Bedrock', stat('def', 0.15), on('battleStart', [shield(1, 'allAllies')])),
  yuki: p('Frostbite', vs('stun', 0.3), on('hit', [status('stun', 1)], 0.2)),
  raijin: p('Overcharge', crit(0.15), on('battleStart', [energy(30, 'self')])),
  // ★4
  aldric: p('Last Stand', lowHp(0.4, 0.5)),
  cinder: p('Kindling', vs('burn', 0.2)),
  coral: p('Ink Cloud', on('hit', [status('defDown', 2)], 0.3)),
  kai: p('Wave Rider', on('battleStart', [energy(25, 'self')])),
  sylph: p('Fairy Ring', on('turnStart', [heal(0.2, 'lowestAlly')])),
  bramble: p('Thorns', on('hit', [dmg(0.3)])),
  lumen: p('Wise Gaze', on('battleStart', [status('atkUp', 2, 'allAllies')])),
  buzz: p('Exploit', vs('defDown', 0.3)),
  rime: p('Shatter', vs('stun', 0.35)),
  // ★3
  torch: p('Bright Flame', crit(0.1)),
  kindle: p('Hoarder', on('battleStart', [energy(20, 'self')])),
  puddle: p('Rain Dance', on('turnStart', [heal(0.15, 'lowestAlly')])),
  drip: p('Hard Shell', stat('def', 0.12)),
  breeze: p('Light Wings', stat('spd', 0.08)),
  gusty: p('Flutter', crit(0.1)),
  pebble: p('Sturdy', stat('hp', 0.12)),
  mossy: p('Regrowth', on('turnStart', [heal(0.15, 'self')])),
  static: p('Static Charge', on('hit', [dmg(0.4)], 0.25)),
  flurry: p('Cold Snap', vs('stun', 0.25)),
  elara: p('Arcane Focus', vs('stun', 0.2), on('battleStart', [energy(30, 'self')])),
  varek: p('Aegis Oath', stat('def', 0.15), on('hit', [shield(0.6, 'self')], 0.3)),
  roland: p('Steadfast', stat('hp', 0.15)),
  celeste: p('Blessing', on('turnStart', [heal(0.2, 'lowestAlly')])),
  kael: p('Duelist', crit(0.15)),
  fenn: p('Keen Eye', crit(0.1)),
  hollow: p('Hollow Flame', on('hit', [status('burn', 2)], 0.35)),
  // Enemies
  orc: p('Berserk', lowHp(0.5, 0.3)),
  kraken: p('Thick Hide', stat('def', 0.15)),
  wyrm: p('Ashen Fury', vs('burn', 0.3)),
  lich: p('Soul Siphon', on('turnStart', [energy(15, 'self')])),
  thunderbird: p('Eye of the Storm', crit(0.15)),
  'storm-knight': p('Grounded', stat('def', 0.15)),
  warlord: p('Warcry', lowHp(0.4, 0.5)),
  'demon-lord': p('Infernal Majesty', vs('burn', 0.3), on('battleStart', [status('atkUp', 2, 'allAllies')])),
};

export const defaultPassive = (id: string): Passive | null =>
  DEFAULT_PASSIVES[id] ? structuredClone(DEFAULT_PASSIVES[id]) : null;

// Action budgets for the third star, from `npm run balance -- --calibrate`: about what the
// starter team needs in its quicker fights five levels above the recommended level.
const ACTION_BUDGETS: Record<string, number> = {
  '1-1': 20, '1-2': 20, '1-3': 20, '1-4': 35,
  '2-1': 30, '2-2': 50, '2-3': 40, '2-4': 40,
  '3-1': 50, '3-2': 70, '3-3': 65, '3-4': 65,
  '4-1': 40, '4-2': 95, '4-3': 80, '4-4': 105,
  '5-1': 70, '5-2': 165, '5-3': 135, '5-4': 115,
  '6-1': 60, '6-2': 105, '6-3': 85, '6-4': 105,
};

/** Win; nobody falls; win within an action budget. */
export function defaultObjectives(stageId: string, enemyCount: number, boss: boolean): StageObjective[] {
  const value = ACTION_BUDGETS[stageId] ?? enemyCount * 10 + (boss ? 15 : 0);
  return [{ kind: 'win' }, { kind: 'noDeaths' }, { kind: 'maxActions', value }];
}

/** Chests at 4, 8 and 12 stars (a chapter has four 3-star stages). */
export function defaultStarRewards(chapter: number): ChapterDef['starRewards'] {
  return [
    { stars: 4, reward: { gems: 100, gold: 2000 * chapter, stardust: 0, materials: [] } },
    { stars: 8, reward: { gems: 200, gold: 0, stardust: 10, materials: [{ id: 'skill-tome', count: chapter }] } },
    { stars: 12, reward: { gems: 300, gold: 0, stardust: 20, materials: [{ id: 'star-crystal', count: chapter }] } },
  ];
}
