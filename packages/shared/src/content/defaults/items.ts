/** Default materials, gear templates, gear sets and banners. */
import type { ElementId } from '../../types';
import type { BannerDef, GearDef, GearSetDef, MaterialDef } from '../types';

const ESSENCE: { element: ElementId; name: string; emoji: string; icon: number }[] = [
  { element: 'flame', name: 'Ember Essence', emoji: '🔥', icon: 171 },
  { element: 'tide', name: 'Tide Essence', emoji: '💧', icon: 172 },
  { element: 'gale', name: 'Gale Essence', emoji: '🍃', icon: 167 },
  { element: 'stone', name: 'Stone Essence', emoji: '🪨', icon: 200 },
  { element: 'volt', name: 'Volt Essence', emoji: '⚡', icon: 166 },
  { element: 'frost', name: 'Frost Essence', emoji: '❄️', icon: 170 },
];

export const materials: MaterialDef[] = [
  ...ESSENCE.map((e) => ({
    id: `${e.element}-essence`,
    name: e.name,
    emoji: e.emoji,
    icon: e.icon,
    rarity: 3 as const,
    element: e.element,
    description: `Condensed ${e.element} energy. ${e.element[0]!.toUpperCase() + e.element.slice(1)} heroes need it to ascend. Dropped by ${e.element} enemies.`,
  })),
  {
    id: 'star-crystal',
    name: 'Star Crystal',
    emoji: '💠',
    icon: 26,
    rarity: 5,
    element: null,
    description: 'A shard of a summoning star. Needed for higher ascensions. Dropped by bosses.',
  },
  {
    id: 'reforge-stone',
    name: 'Reforge Stone',
    emoji: '🔨',
    icon: null,
    rarity: 4,
    element: null,
    description: 'Rewrites gear bonus stats at the forge. From salvaging ★4 and ★5 gear, and tower milestones.',
  },
  {
    id: 'skill-tome',
    name: 'Skill Tome',
    emoji: '📘',
    icon: 101,
    rarity: 4,
    element: null,
    description: 'Battle notes from heroes of old. Used to level up skills and ultimates.',
  },
];

// Templates set the slot, rarity and look; every drop rolls its main stat from the slot's pool.
export const gear: GearDef[] = [
  { id: 'bronze-blade', name: 'Bronze Blade', emoji: '🗡️', slot: 'weapon', rarity: 3, mainStat: null, mainBase: 0, icon: 1441, set: null },
  { id: 'runed-saber', name: 'Runed Saber', emoji: '⚔️', slot: 'weapon', rarity: 4, mainStat: null, mainBase: 0, icon: 1508, set: null },
  { id: 'starforged-edge', name: 'Starforged Edge', emoji: '🔱', slot: 'weapon', rarity: 5, mainStat: null, mainBase: 0, icon: 1590, set: null },
  { id: 'leather-vest', name: 'Leather Vest', emoji: '🦺', slot: 'armor', rarity: 3, mainStat: null, mainBase: 0, icon: 1969, set: null },
  { id: 'knight-mail', name: 'Knight Mail', emoji: '🛡️', slot: 'armor', rarity: 4, mainStat: null, mainBase: 0, icon: 1921, set: null },
  { id: 'aegis-of-dawn', name: 'Aegis of Dawn', emoji: '💠', slot: 'armor', rarity: 5, mainStat: null, mainBase: 0, icon: 1927, set: null },
  { id: 'lucky-clover', name: 'Clover Sandals', emoji: '🩴', slot: 'boots', rarity: 3, mainStat: null, mainBase: 0, icon: null, set: null },
  { id: 'moon-pendant', name: 'Moon Pendant', emoji: '🌙', slot: 'charm', rarity: 4, mainStat: null, mainBase: 0, icon: 2065, set: null },
  { id: 'warding-amulet', name: 'Warding Amulet', emoji: '🧿', slot: 'charm', rarity: 4, mainStat: null, mainBase: 0, icon: 2066, set: null },
  { id: 'swift-feather', name: 'Featherstep Boots', emoji: '👢', slot: 'boots', rarity: 5, mainStat: null, mainBase: 0, icon: null, set: null },
  { id: 'heart-locket', name: 'Heart Locket', emoji: '💖', slot: 'charm', rarity: 5, mainStat: null, mainBase: 0, icon: 2181, set: null },
  // Boots: the only slot with SPD as a main stat, but other boots exist too.
  { id: 'ranger-boots', name: 'Ranger Boots', emoji: '🥾', slot: 'boots', rarity: 4, mainStat: null, mainBase: 0, icon: null, set: null },
  { id: 'iron-greaves', name: 'Iron Greaves', emoji: '🦿', slot: 'boots', rarity: 4, mainStat: null, mainBase: 0, icon: null, set: null },
  { id: 'pilgrim-treads', name: 'Pilgrim Treads', emoji: '👞', slot: 'boots', rarity: 4, mainStat: null, mainBase: 0, icon: null, set: null },
  { id: 'warlord-sabatons', name: 'Warlord Sabatons', emoji: '🥿', slot: 'boots', rarity: 5, mainStat: null, mainBase: 0, icon: null, set: null },
];

/** Gear sets: every drop rolls one at random (unless its template fixes a set). */
export const gearSets: GearSetDef[] = [
  {
    id: 'precision',
    name: 'Precision',
    emoji: '🎯',
    icon: 731,
    bonuses: [
      { pieces: 2, stat: 'critRate', value: 0.06 },
      { pieces: 4, stat: 'critRate', value: 0.12 },
    ],
  },
  {
    id: 'ruin',
    name: 'Ruin',
    emoji: '💥',
    icon: 767,
    bonuses: [
      { pieces: 2, stat: 'critDmg', value: 0.12 },
      { pieces: 4, stat: 'critDmg', value: 0.25 },
    ],
  },
  {
    id: 'fury',
    name: 'Fury',
    emoji: '🔥',
    icon: 657,
    bonuses: [
      { pieces: 2, stat: 'atkPct', value: 0.08 },
      { pieces: 4, stat: 'atkPct', value: 0.15 },
    ],
  },
  {
    id: 'vitality',
    name: 'Vitality',
    emoji: '💚',
    icon: 661,
    bonuses: [
      { pieces: 2, stat: 'hpPct', value: 0.1 },
      { pieces: 4, stat: 'hpPct', value: 0.2 },
    ],
  },
  {
    id: 'bulwark',
    name: 'Bulwark',
    emoji: '🛡️',
    icon: 665,
    bonuses: [
      { pieces: 2, stat: 'defPct', value: 0.1 },
      { pieces: 4, stat: 'defPct', value: 0.2 },
    ],
  },
  {
    id: 'gale',
    name: 'Gale',
    emoji: '🌪️',
    icon: 891,
    bonuses: [
      { pieces: 2, stat: 'spd', value: 5 },
      { pieces: 4, stat: 'spd', value: 10 },
    ],
  },
];

export const banners: BannerDef[] = [
  {
    id: 'thunder',
    name: "Thunder's Call",
    description: 'The Storm Tiger descends. Raijin has a boosted drop rate, and losing a 50/50 guarantees him next time.',
    limited: true,
    active: true,
    featured5: 'raijin',
    featured4: ['lumen', 'coral', 'rime'],
  },
  {
    id: 'templar',
    name: 'Order of the Templar',
    description: 'Varek, the Knight Templar, answers the call. Varek has a boosted drop rate, and losing a 50/50 guarantees him next time.',
    limited: true,
    active: true,
    featured5: 'varek',
    featured4: ['roland', 'celeste', 'kael'],
  },
  {
    id: 'standard',
    name: "Wanderer's Wish",
    description: 'The permanent banner. Every standard character can appear.',
    limited: false,
    active: true,
    featured5: null,
    featured4: [],
  },
];
