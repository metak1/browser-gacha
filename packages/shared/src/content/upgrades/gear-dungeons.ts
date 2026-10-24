import { createDefaultContent } from '../defaults';
import { type ContentUpgrade, armoryShape, lineupSignature } from './helpers';

/** Steps v20-v24: the gear dungeons. */
export const GearDungeons: ContentUpgrade[] = [
  {
    id: 'v20-armory',
    version: 20,
    run(b) {
      let changed = false;
      // v20: the Armory, a gear-only dungeon.
      const armory = createDefaultContent().dungeons.find((dg) => dg.id === 'armory');
      const enemyIds = new Set(b.enemies.map((e) => e.id));
      const usable = armory && armory.tiers.every((t) => [...t.enemies, ...t.waves.flat()].every((e) => enemyIds.has(e.id)));
      if (armory && usable && !b.dungeons.some((dg) => dg.id === armory.id)) {
        b.dungeons.push(structuredClone(armory));
        changed = true;
      }
      return changed;
    },
  },
  {
    id: 'v21-armory-levels',
    version: 21,
    run(b) {
      let changed = false;
      // v21: the Armory's enemy levels were raised to match its recommended levels. Only an
      // Armory still on the first levels (12/27/42/52) changes.
      const def = createDefaultContent().dungeons.find((dg) => dg.id === 'armory');
      const a = b.dungeons.find((dg) => dg.id === 'armory');
      const levels = (dg: typeof a) => dg!.tiers.map((t) => [...t.enemies, ...t.waves.flat()].map((e) => e.level));
      const firstDraft = [12, 27, 42, 52];
      if (def && a && a.tiers.length === def.tiers.length && levels(a).every((ls, i) => ls.every((l) => l === firstDraft[i]))) {
        a.tiers = a.tiers.map((t, i) => ({ ...t, enemies: structuredClone(def.tiers[i]!.enemies), waves: structuredClone(def.tiers[i]!.waves) }));
        changed = true;
      }
      return changed;
    },
  },
  {
    id: 'v22-three-gear-dungeons',
    version: 22,
    run(b) {
      let changed = false;
      // v22: three gear dungeons with two sets and a mechanic each. The Armory becomes the crit-set
      // dungeon if it's still the default one; the Bastion and Windspire are added.
      const d = createDefaultContent();
      const i = b.dungeons.findIndex((dg) => dg.id === 'armory');
      const armory = d.dungeons.find((dg) => dg.id === 'armory')!;
      if (i >= 0 && armoryShape(b.dungeons[i]!) === armoryShape(V21_ARMORY)) {
        b.dungeons[i] = structuredClone(armory);
        changed = true;
      }
      const enemyIds = new Set(b.enemies.map((e) => e.id));
      const setIds = new Set(b.gearSets.map((s) => s.id));
      for (const id of ['bastion', 'windspire']) {
        const def = d.dungeons.find((dg) => dg.id === id)!;
        const usable = def.tiers.every((t) => [...t.enemies, ...t.waves.flat()].every((e) => enemyIds.has(e.id))) && def.sets.every((s) => setIds.has(s));
        if (usable && !b.dungeons.some((dg) => dg.id === id)) {
          b.dungeons.push(structuredClone(def));
          changed = true;
        }
      }
      return changed;
    },
  },
  {
    id: 'v23-finish-gear-dungeons',
    version: 23,
    run(b) {
      let changed = false;
      // v23: finish v22 for content an early build of it left behind: an Armory still on the v21
      // shape becomes the crit-set dungeon, and gear dungeons still on their draft line-ups get the
      // tuned ones.
      const d = createDefaultContent();
      for (const id of ['armory', 'bastion', 'windspire']) {
        const i = b.dungeons.findIndex((dg) => dg.id === id);
        const def = d.dungeons.find((dg) => dg.id === id);
        if (i < 0 || !def) continue;
        const cur = b.dungeons[i]!;
        if (id === 'armory' && armoryShape(cur) === armoryShape(V21_ARMORY)) {
          b.dungeons[i] = structuredClone(def);
          changed = true;
        } else if (lineupSignature(cur) === V22_DRAFT_LINEUPS[id] && cur.tiers.length === def.tiers.length) {
          cur.tiers = cur.tiers.map((t, j) => ({ ...t, enemies: structuredClone(def.tiers[j]!.enemies), waves: structuredClone(def.tiers[j]!.waves) }));
          changed = true;
        }
      }
      return changed;
    },
  },
  {
    id: 'v24-dungeon-descriptions',
    version: 24,
    run(b) {
      let changed = false;
      // v24: gear dungeon descriptions no longer tell players what to bring.
      const d = createDefaultContent();
      for (const [id, old] of Object.entries(V23_GEAR_DESCRIPTIONS)) {
        const cur = b.dungeons.find((dg) => dg.id === id);
        const def = d.dungeons.find((dg) => dg.id === id);
        if (cur && def && cur.description === old) {
          cur.description = def.description;
          changed = true;
        }
      }
      return changed;
    },
  },
];

/** Gear dungeon descriptions as v22 shipped them. */
const V23_GEAR_DESCRIPTIONS: Record<string, string> = {
  armory: 'Crit gear (Precision, Ruin). Its armoured guards shrug off weak hits: bring piercing, DEF Down, or damage that scales with HP or DEF.',
  bastion: 'Survival gear (Vitality, Bulwark). Its undead garrison fights buffed and keeps buffing: bring tanks, healers and Dispel.',
  windspire: 'Tempo gear (Fury, Gale). Its storm-born flyers are fast and strike first: bring speed, taunting tanks and delay.',
};

/** The line-ups the first build of v22 shipped (before tuning). */
const V22_DRAFT_LINEUPS: Record<string, string> = {
  bastion:
    '17:skeleton/wolf/skeleton|;34:skeleton-archer/wraith/wolf|wolf/wolf;50:wraith/black-knight/wraith|skeleton/wraith/skeleton-archer;60:wraith/magma-golem/wraith|wolf/lich/wolf',
  windspire: '17:bat/harpy/bat|;34:harpy/spark/harpy|bat/bat;50:harpy/seraph/harpy|spark/storm-knight/spark;60:seraph/harpy/seraph|spark/thunderbird/spark',
};

/** The default Armory as of v21 (one dungeon, every set). */
const V21_ARMORY = {
  id: 'armory',
  name: 'The Armory',
  emoji: '⚒️',
  theme: 'ember',
  days: [0, 1, 2, 3, 4, 5, 6],
  description: 'Gear only. Pick the set you want, win, and every drop belongs to it: random slot, main stat and bonus stats.',
  sets: [],
  tiers: [
    {
      name: 'Tier I',
      recommendedLevel: 15,
      enemies: [
        { id: 'orc', level: 17 },
        { id: 'black-knight', level: 17 },
        { id: 'orc', level: 17 },
      ],
      waves: [],
      gold: 150,
      materialDrops: [],
      gearRolls: { count: 2, r3: 6, r4: 4, r5: 0 },
    },
    {
      name: 'Tier II',
      recommendedLevel: 30,
      enemies: [
        { id: 'minotaur', level: 34 },
        { id: 'black-knight', level: 34 },
        { id: 'orc-rider', level: 34 },
      ],
      waves: [
        [
          { id: 'orc', level: 34 },
          { id: 'orc', level: 34 },
          { id: 'orc', level: 34 },
        ],
      ],
      gold: 300,
      materialDrops: [],
      gearRolls: { count: 2, r3: 2, r4: 6.5, r5: 1.5 },
    },
    {
      name: 'Tier III',
      recommendedLevel: 45,
      enemies: [
        { id: 'storm-knight', level: 50 },
        { id: 'magma-golem', level: 50 },
        { id: 'storm-knight', level: 50 },
      ],
      waves: [
        [
          { id: 'minotaur', level: 50 },
          { id: 'black-knight', level: 50 },
          { id: 'minotaur', level: 50 },
        ],
      ],
      gold: 500,
      materialDrops: [],
      gearRolls: { count: 3, r3: 0, r4: 6, r5: 4 },
    },
    {
      name: 'Tier IV',
      recommendedLevel: 55,
      enemies: [
        { id: 'black-knight', level: 60 },
        { id: 'magma-golem', level: 60 },
        { id: 'black-knight', level: 60 },
      ],
      waves: [
        [
          { id: 'orc', level: 60 },
          { id: 'warlord', level: 60 },
          { id: 'orc', level: 60 },
        ],
      ],
      gold: 800,
      materialDrops: [],
      gearRolls: { count: 3, r3: 0, r4: 3, r5: 7 },
    },
  ],
};
