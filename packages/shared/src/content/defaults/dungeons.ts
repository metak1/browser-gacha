/** Default dungeons: essence dungeons by weekday and the always-open gear dungeons. */
import type { ElementId } from '../../types';
import type { DungeonTier, DungeonDef, StageDef } from '../types';
import { lineup } from './campaign';

// Daily dungeons: one element a day (Mon-Sat), all open on Sunday.
type TierSpec = [enemies: string[], waves: string[][]];
const TIER_INFO = [
  { name: 'Tier I', level: 8, rec: 10, gold: 400, essence: [2, 3] as const, tome: 0, crystal: 0 },
  { name: 'Tier II', level: 22, rec: 25, gold: 1200, essence: [4, 6] as const, tome: 0.3, crystal: 0 },
  { name: 'Tier III', level: 40, rec: 45, gold: 3000, essence: [7, 10] as const, tome: 0.6, crystal: 0.4 },
];
/** Stamina per run for every dungeon tier, the same as a campaign stage. */
export const DUNGEON_STAMINA = 10;
function dungeon(id: string, name: string, emoji: string, element: ElementId, theme: DungeonDef['theme'], day: number, tiers: TierSpec[]): DungeonDef {
  return {
    id,
    name,
    emoji,
    theme,
    days: [day, 0],
    description: `Farm ${element} essence. Open on ${['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'][day]} and Sundays.`,
    sets: [],
    mechanic: null,
    tiers: tiers.map(([first, later], i) => {
      const t = TIER_INFO[i]!;
      const drops: StageDef['materialDrops'] = [{ material: `${element}-essence`, min: t.essence[0], max: t.essence[1], chance: 1 }];
      if (t.tome) drops.push({ material: 'skill-tome', min: 1, max: 1, chance: t.tome });
      if (t.crystal) drops.push({ material: 'star-crystal', min: 1, max: 1, chance: t.crystal });
      return {
        name: t.name,
        recommendedLevel: t.rec,
        enemies: lineup(first, t.level),
        waves: later.map((w) => lineup(w, t.level)),
        gold: t.gold,
        materialDrops: drops,
        gearRolls: null,
        stamina: DUNGEON_STAMINA,
      };
    }),
  };
}
/**
 * Gear dungeons drop only gear: each win rolls a few items, each of one of the dungeon's two
 * sets at random, with better rarity odds on higher tiers. No essence, little gold. They
 * are always open, and each has its own enemy mechanic, so each pair of sets is earned a
 * different way.
 */
const GEAR_TIER_REWARDS: { name: string; rec: number; gold: number; rolls: DungeonTier['gearRolls'] }[] = [
  { name: 'Tier I', rec: 15, gold: 150, rolls: { count: 2, r3: 6, r4: 4, r5: 0 } },
  { name: 'Tier II', rec: 30, gold: 300, rolls: { count: 2, r3: 2, r4: 6.5, r5: 1.5 } },
  { name: 'Tier III', rec: 45, gold: 500, rolls: { count: 3, r3: 0, r4: 6, r5: 4 } },
  { name: 'Tier IV', rec: 55, gold: 800, rolls: { count: 3, r3: 0, r4: 3, r5: 7 } },
];
/** Per tier: enemy level, first wave, later waves. */
type GearTierSpec = [level: number, enemies: string[], waves: string[][]];
function gearDungeon(
  id: string,
  name: string,
  emoji: string,
  theme: DungeonDef['theme'],
  sets: [string, string],
  mechanic: string,
  description: string,
  tiers: GearTierSpec[],
): DungeonDef {
  return {
    id,
    name,
    emoji,
    theme,
    days: [0, 1, 2, 3, 4, 5, 6],
    description,
    sets,
    mechanic,
    tiers: tiers.map(([level, first, later], i) => {
      const r = GEAR_TIER_REWARDS[i]!;
      return {
        name: r.name,
        recommendedLevel: r.rec,
        enemies: lineup(first, level),
        waves: later.map((w) => lineup(w, level)),
        gold: r.gold,
        materialDrops: [],
        gearRolls: r.rolls,
        stamina: DUNGEON_STAMINA,
      };
    }),
  };
}
const gearDungeons: DungeonDef[] = [
  gearDungeon(
    'armory',
    'The Armory',
    '⚒️',
    'camp',
    ['precision', 'ruin'],
    'ironhide',
    'Crit gear: Precision and Ruin. Its armoured guards shrug off weak hits.',
    [
      [17, ['orc', 'black-knight', 'orc'], []],
      [35, ['minotaur', 'black-knight', 'orc-rider'], [['orc', 'orc', 'orc']]],
      [47, ['orc-rider', 'black-knight', 'orc-rider'], [['minotaur', 'orc', 'minotaur']]],
      [47, ['minotaur', 'black-knight', 'minotaur'], [['orc', 'warlord', 'orc']]],
    ],
  ),
  gearDungeon(
    'bastion',
    'The Bastion',
    '🏰',
    'ruins',
    ['vitality', 'bulwark'],
    'empowered',
    'Survival gear: Vitality and Bulwark. Its undead garrison fights buffed and keeps buffing.',
    [
      [14, ['skeleton', 'wolf', 'skeleton'], []],
      [28, ['skeleton-archer', 'wraith', 'wolf'], [['wolf', 'wolf']]],
      [50, ['wraith', 'skeleton', 'wraith'], [['skeleton', 'wolf', 'skeleton-archer']]],
      [50, ['wraith', 'black-knight', 'wraith'], [['wolf', 'lich', 'wolf']]],
    ],
  ),
  gearDungeon(
    'windspire',
    'Windspire',
    '🌪️',
    'storm',
    ['fury', 'gale'],
    'swift',
    'Tempo gear: Fury and Gale. Its storm-born flyers are fast and strike first.',
    [
      [21, ['bat', 'harpy', 'bat'], []],
      [39, ['harpy', 'spark', 'harpy'], [['bat', 'bat']]],
      [53, ['harpy', 'seraph', 'harpy'], [['spark', 'storm-knight', 'spark']]],
      [53, ['seraph', 'harpy', 'seraph'], [['spark', 'thunderbird', 'spark']]],
    ],
  ),
];

export const dungeons: DungeonDef[] = [
  dungeon('ember-forge', 'Ember Forge', '🔥', 'flame', 'ember', 1, [
    [['lava-slime', 'imp', 'imp'], []],
    [['imp', 'demon', 'imp'], [['hellhound', 'demon']]],
    [['demon', 'magma-golem', 'demon'], [['imp', 'wyrm', 'imp']]],
  ]),
  dungeon('tidal-grotto', 'Tidal Grotto', '💧', 'tide', 'deep', 2, [
    [['blob', 'blob', 'blob'], []],
    [['blood-fiend', 'blob', 'blood-fiend'], [['naga', 'siren']]],
    [['naga', 'blood-fiend', 'siren'], [['blob', 'kraken', 'blob']]],
  ]),
  dungeon('sky-nest', 'Sky Nest', '🍃', 'gale', 'storm', 3, [
    [['bat', 'bat', 'bat'], []],
    [['harpy', 'bat', 'harpy'], [['harpy', 'harpy']]],
    [['seraph', 'harpy', 'harpy'], [['bat', 'seraph', 'harpy', 'bat']]],
  ]),
  dungeon('golem-quarry', 'Golem Quarry', '🪨', 'stone', 'meadow', 4, [
    [['orc', 'orc'], []],
    [['black-knight', 'orc', 'shaman'], [['scuttler', 'scuttler']]],
    [['scuttler', 'golem', 'scuttler'], [['minotaur', 'warlord', 'shaman']]],
  ]),
  dungeon('storm-engine', 'Storm Engine', '⚡', 'volt', 'storm', 5, [
    [['eyeball', 'spark', 'wisp'], []],
    [['spark', 'storm-knight', 'spark'], [['wisp', 'wisp']]],
    [['storm-knight', 'wisp', 'storm-knight'], [['spark', 'thunderbird', 'spark']]],
  ]),
  dungeon('glacier-crypt', 'Glacier Crypt', '❄️', 'frost', 'frost', 6, [
    [['skeleton', 'wolf'], []],
    [['skeleton-archer', 'wraith', 'wolf'], [['wolf', 'wolf']]],
    [['wraith', 'wolf', 'wraith'], [['wolf', 'lich', 'wolf']]],
  ]),
  ...gearDungeons,
];
