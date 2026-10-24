/** Default chapters and stages: line-ups, levels, drops. */
import { defaultObjectives, defaultStarRewards } from '../passives';
import type { ElementId } from '../../types';
import type { ChapterDef, EncounterEnemy, StageDef } from '../types';
import { enemies } from './units';

export const chapters: ChapterDef[] = [
  { id: 1, name: 'Whispering Meadow', theme: 'meadow', starRewards: defaultStarRewards(1) },
  { id: 2, name: 'Ember Peaks', theme: 'ember', starRewards: defaultStarRewards(2) },
  { id: 3, name: 'Frozen Citadel', theme: 'frost', starRewards: defaultStarRewards(3) },
  { id: 4, name: 'Storm Spire', theme: 'storm', starRewards: defaultStarRewards(4) },
  { id: 5, name: 'Sunken Temple', theme: 'deep', starRewards: defaultStarRewards(5) },
  { id: 6, name: 'Starfall Abyss', theme: 'cosmos', starRewards: defaultStarRewards(6) },
];

/** [id, name, recommended team level, first wave, boss?, later waves]. Enemies are one level below. */
type StageSpec = [id: string, name: string, level: number, enemies: string[], boss?: boolean, waves?: string[][]];
const STAGE_SPECS: StageSpec[] = [
  ['1-1', 'Meadow Path', 1, ['blob', 'blob']],
  ['1-2', 'Bat Hollow', 2, ['bat', 'orc', 'bat']],
  ['1-3', 'Imp Crossing', 4, ['imp', 'orc-rider', 'blob']],
  ['1-4', 'Lake of Tentacles', 6, ['blob', 'kraken', 'blob'], true],
  ['2-1', 'Scorched Trail', 8, ['imp', 'hellhound', 'imp']],
  ['2-2', 'Golem Pass', 10, ['eyeball', 'golem', 'demon']],
  ['2-3', 'Shaman Camp', 12, ['wolf', 'shaman', 'wolf']],
  ['2-4', 'Caldera Throne', 15, ['imp', 'wyrm', 'imp'], true],
  ['3-1', 'Icebound Gate', 17, ['skeleton', 'blood-fiend', 'skeleton-archer']],
  ['3-2', 'Hall of Echoes', 19, ['bat', 'golem', 'shaman', 'bat']],
  ['3-3', 'Frozen Armory', 21, ['demon', 'black-knight', 'blood-fiend', 'minotaur']],
  ['3-4', 'Throne of Winter', 24, ['wolf', 'lich', 'wolf'], true],
  ['4-1', 'Windswept Stair', 27, ['harpy', 'spark', 'harpy']],
  ['4-2', 'Conductor Bridge', 29, ['storm-knight', 'spark', 'harpy'], false, [['spark', 'spark', 'harpy']]],
  ['4-3', 'Eye of the Gale', 31, ['harpy', 'wisp', 'harpy', 'bat'], false, [['storm-knight', 'spark', 'spark']]],
  ['4-4', 'Thunder Throne', 34, ['spark', 'thunderbird', 'spark'], true],
  ['5-1', 'Drowned Steps', 36, ['scuttler', 'siren', 'scuttler']],
  ['5-2', 'Coral Nave', 38, ['naga', 'blood-fiend'], false, [['scuttler', 'scuttler', 'blob']]],
  ['5-3', 'Abyssal Altar', 40, ['naga', 'siren', 'scuttler'], false, [['blood-fiend', 'scuttler', 'siren']]],
  ['5-4', "Warlord's Grotto", 43, ['orc', 'orc', 'scuttler'], true, [['orc', 'warlord', 'siren']]],
  ['6-1', 'Falling Stars', 45, ['wraith', 'seraph', 'wraith']],
  ['6-2', 'Molten Rift', 47, ['magma-golem', 'demon', 'wraith'], false, [['ghostfire', 'imp', 'seraph']]],
  ['6-3', 'Hall of the Fallen', 49, ['seraph', 'wraith', 'magma-golem', 'wraith'], false, [['demon', 'seraph', 'demon']]],
  ['6-4', 'Throne of Ruin', 52, ['wraith', 'magma-golem', 'wraith'], true, [['imp', 'demon-lord', 'imp']]],
];

const LATE_DROPS = {
  normal: [
    { gear: 'runed-saber', chance: 0.3 },
    { gear: 'knight-mail', chance: 0.3 },
    { gear: 'warding-amulet', chance: 0.25 },
    { gear: 'moon-pendant', chance: 0.2 },
    { gear: 'ranger-boots', chance: 0.2 },
    { gear: 'pilgrim-treads', chance: 0.15 },
    { gear: 'swift-feather', chance: 0.08 },
    { gear: 'starforged-edge', chance: 0.06 },
  ],
  boss: [
    { gear: 'starforged-edge', chance: 0.3 },
    { gear: 'aegis-of-dawn', chance: 0.3 },
    { gear: 'swift-feather', chance: 0.25 },
    { gear: 'heart-locket', chance: 0.25 },
    { gear: 'warlord-sabatons', chance: 0.25 },
  ],
};

// Gear drop tables by chapter; bosses roll their own richer table.
const DROPS: Record<number, { normal: StageDef['drops']; boss: StageDef['drops'] }> = {
  1: {
    normal: [
      { gear: 'bronze-blade', chance: 0.35 },
      { gear: 'leather-vest', chance: 0.35 },
      { gear: 'lucky-clover', chance: 0.25 },
    ],
    boss: [
      { gear: 'runed-saber', chance: 0.3 },
      { gear: 'knight-mail', chance: 0.3 },
      { gear: 'moon-pendant', chance: 0.2 },
    ],
  },
  2: {
    normal: [
      { gear: 'runed-saber', chance: 0.25 },
      { gear: 'knight-mail', chance: 0.25 },
      { gear: 'lucky-clover', chance: 0.3 },
      { gear: 'moon-pendant', chance: 0.15 },
      { gear: 'ranger-boots', chance: 0.12 },
    ],
    boss: [
      { gear: 'starforged-edge', chance: 0.12 },
      { gear: 'aegis-of-dawn', chance: 0.12 },
      { gear: 'runed-saber', chance: 0.4 },
      { gear: 'warding-amulet', chance: 0.3 },
      { gear: 'pilgrim-treads', chance: 0.25 },
    ],
  },
  3: {
    normal: [
      { gear: 'runed-saber', chance: 0.3 },
      { gear: 'knight-mail', chance: 0.3 },
      { gear: 'warding-amulet', chance: 0.25 },
      { gear: 'iron-greaves', chance: 0.2 },
      { gear: 'ranger-boots', chance: 0.15 },
      { gear: 'swift-feather', chance: 0.06 },
    ],
    boss: [
      { gear: 'starforged-edge', chance: 0.25 },
      { gear: 'aegis-of-dawn', chance: 0.25 },
      { gear: 'swift-feather', chance: 0.2 },
      { gear: 'heart-locket', chance: 0.2 },
      { gear: 'warlord-sabatons', chance: 0.15 },
    ],
  },
  4: LATE_DROPS,
  5: LATE_DROPS,
  6: LATE_DROPS,
};

const ENEMY_ELEMENT: Record<string, ElementId> = Object.fromEntries(enemies.map((e) => [e.id, e.element]));

function materialDrops(foes: string[], chapter: number, boss: boolean): StageDef['materialDrops'] {
  const elements = [...new Set(foes.map((f) => ENEMY_ELEMENT[f]!))];
  const drops: StageDef['materialDrops'] = elements.map((e) => ({ material: `${e}-essence`, min: 1, max: chapter + (boss ? 2 : 0), chance: boss ? 1 : 0.7 }));
  if (boss) drops.push({ material: 'star-crystal', min: 1, max: chapter, chance: 0.6 }, { material: 'skill-tome', min: 1, max: 1, chance: 0.5 });
  else if (chapter >= 2) drops.push({ material: 'skill-tome', min: 1, max: 1, chance: 0.12 });
  return drops;
}

export const lineup = (ids: string[], level: number): EncounterEnemy[] => ids.map((e) => ({ id: e, level }));

/**
 * Enemy HP/ATK/DEF multipliers per stage, from the calibration in
 * `npm run balance -- --calibrate`: the starter team (no gear) at the recommended
 * level wins about 85% of auto-battles on normal stages and 65% on bosses.
 * Chapter 1 is left at 1 or lower, so the opening stays gentle.
 */
export const STAGE_TUNING: Record<string, number> = {
  '1-1': 1,
  '1-2': 1,
  '1-3': 1,
  '1-4': 1,
  '2-1': 1.25,
  '2-2': 1.25,
  '2-3': 1.2,
  '2-4': 0.85,
  '3-1': 1.2,
  '3-2': 1.15,
  '3-3': 1.05,
  '3-4': 0.85,
  '4-1': 1.4,
  '4-2': 1.3,
  '4-3': 1.05,
  '4-4': 1.15,
  '5-1': 1.5,
  '5-2': 1.6,
  '5-3': 1.25,
  '5-4': 1.15,
  '6-1': 1.35,
  '6-2': 1.25,
  '6-3': 0.95,
  '6-4': 1,
};

export const stages: StageDef[] = STAGE_SPECS.map(([id, name, level, first, boss, later = []]) => {
  const [chapter, index] = id.split('-').map(Number) as [number, number];
  const foes = [...first, ...later.flat()];
  const enemyLevel = Math.max(1, level - 1);
  return {
    id,
    chapter,
    index,
    name,
    enemies: lineup(first, enemyLevel),
    waves: later.map((w) => lineup(w, enemyLevel)),
    recommendedLevel: level,
    statMult: STAGE_TUNING[id] ?? 1,
    firstClearGems: (boss ? 600 : 200) + (chapter > 3 ? 100 * (chapter - 3) : 0),
    gold: 60 + level * 25,
    drops: structuredClone(DROPS[chapter]![boss ? 'boss' : 'normal']),
    materialDrops: materialDrops(foes, chapter, Boolean(boss)),
    objectives: defaultObjectives(id, foes.length, Boolean(boss)),
  };
});
