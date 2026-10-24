import { createDefaultContent, REFERENCE_TEAM } from '../defaults';
import { type ContentUpgrade } from './helpers';

/** Steps v11-v19: difficulty tuning and the gear rework (reforging, scaling spells, boots, random main stats, sets). */
export const TuningAndGear: ContentUpgrade[] = [
  {
    id: 'v11-difficulty-curve',
    version: 11,
    run(b) {
      let changed = false;
      // v11: a smoother difficulty curve. Recommended levels now start at 1, enemies sit one
      // level below, and a per-stage stat multiplier does the tuning (budgets follow in v12).
      // Only stages still on their old defaults are touched.
      const d = createDefaultContent();
      for (const def of d.stages) {
        const s = b.stages.find((x) => x.id === def.id);
        const old = OLD_STAGE_LEVELS[def.id];
        if (!s || old === undefined) continue;
        const levels = [...s.enemies, ...s.waves.flat()].map((e) => e.level);
        if (s.recommendedLevel !== old + 2 || levels.some((l) => l !== old) || s.statMult !== 1) continue;
        const newLevel = def.enemies[0]!.level;
        s.enemies = s.enemies.map((e) => ({ ...e, level: newLevel }));
        s.waves = s.waves.map((w) => w.map((e) => ({ ...e, level: newLevel })));
        s.recommendedLevel = def.recommendedLevel;
        s.statMult = def.statMult;
        if (s.gold === 60 + old * 25) s.gold = def.gold;
        changed = true;
      }
      return changed;
    },
  },
  {
    id: 'v12-action-budgets',
    version: 12,
    run(b) {
      let changed = false;
      // v12: third-star action budgets retuned for the v11 curve. Budgets still on an old
      // default (the per-stage table, or the formula the first star release used) are replaced.
      const d = createDefaultContent();
      const bosses = new Set(b.enemies.filter((e) => e.boss).map((e) => e.id));
      for (const def of d.stages) {
        const s = b.stages.find((x) => x.id === def.id);
        const budget = def.objectives.find((o) => o.kind === 'maxActions');
        if (!s || budget?.kind !== 'maxActions') continue;
        const firstFormula = s.enemies.length * 4 + (s.enemies.some((e) => bosses.has(e.id)) ? 6 : 0);
        const isOldDefault = (v: number) => v !== budget.value && (v === OLD_ACTION_BUDGETS[def.id] || v === firstFormula);
        if (!s.objectives.some((o) => o.kind === 'maxActions' && isOldDefault(o.value))) continue;
        s.objectives = s.objectives.map((o) => (o.kind === 'maxActions' && isOldDefault(o.value) ? { ...o, value: budget.value } : o));
        changed = true;
      }
      return changed;
    },
  },
  {
    id: 'v13-gear-reforging',
    version: 13,
    run(b) {
      let changed = false;
      // v13: gear reforging and its material.
      const stone = createDefaultContent().materials.find((m) => m.id === 'reforge-stone');
      if (stone && !b.materials.some((m) => m.id === stone.id)) {
        b.materials.push(stone);
        changed = true;
      }
      return changed;
    },
  },
  {
    id: 'v14-stat-scaling-spells',
    version: 14,
    run(b) {
      let changed = false;
      // v14: spells that scale with DEF, max HP or SPD. Only spells still on their old defaults change.
      const d = createDefaultContent();
      const shape = (s: { name: string; targeting: string; cooldown: number; effects: unknown }) =>
        JSON.stringify({ name: s.name, targeting: s.targeting, cooldown: s.cooldown, effects: s.effects });
      for (const [id, old] of Object.entries(OLD_V13_SPELLS)) {
        const i = b.skills.findIndex((s) => s.id === id);
        const def = d.skills.find((s) => s.id === id);
        if (i < 0 || !def || shape(b.skills[i]!) !== shape(old)) continue;
        b.skills[i] = { ...b.skills[i]!, name: def.name, targeting: def.targeting, cooldown: def.cooldown, effects: structuredClone(def.effects) };
        changed = true;
      }
      return changed;
    },
  },
  {
    id: 'v15-boots-slot',
    version: 15,
    run(b) {
      let changed = false;
      // v15: the boots slot. SPD main stats move to boots; new boots join the drop tables.
      const d = createDefaultContent();
      const defGear = new Map(d.gear.map((g) => [g.id, g]));
      for (const g of b.gear) {
        if (g.mainStat !== 'spd' || g.slot === 'boots') continue;
        g.slot = 'boots';
        const def = defGear.get(g.id);
        // The two old SPD charms get their boots names, unless an admin renamed them.
        if (def && OLD_SPD_CHARM_NAMES[g.id] === g.name) Object.assign(g, { name: def.name, emoji: def.emoji, icon: def.icon });
        changed = true;
      }
      for (const def of d.gear) {
        if (def.slot === 'boots' && !b.gear.some((g) => g.id === def.id)) {
          b.gear.push(structuredClone(def));
          changed = true;
        }
      }
      for (const def of d.stages) {
        const s = b.stages.find((x) => x.id === def.id);
        if (s && JSON.stringify(s.drops) === JSON.stringify(OLD_V14_DROPS[def.id]) && JSON.stringify(s.drops) !== JSON.stringify(def.drops)) {
          s.drops = structuredClone(def.drops);
          changed = true;
        }
      }
      return changed;
    },
  },
  {
    id: 'v16-random-main-stats',
    version: 16,
    run(b) {
      let changed = false;
      // v16: random main stats. Default templates still on their old fixed main stat now roll one per drop.
      for (const g of b.gear) {
        const old = OLD_V15_MAINS[g.id];
        if (old && g.mainStat === old.mainStat && g.mainBase === old.mainBase) {
          g.mainStat = null;
          g.mainBase = 0;
          changed = true;
        }
      }
      return changed;
    },
  },
  {
    id: 'v17-no-starter-heroes',
    version: 17,
    run(b) {
      let changed = false;
      // v17: new players start with no heroes and summon their first team, unless the starters were customised.
      if (b.settings.starterCharacters.join() === REFERENCE_TEAM.join()) {
        b.settings.starterCharacters = [];
        changed = true;
      }
      return changed;
    },
  },
  {
    id: 'v18-gear-sets',
    version: 18,
    run(b) {
      let changed = false;
      // v18: gear sets.
      const have = new Set(b.gearSets.map((s) => s.id));
      for (const s of createDefaultContent().gearSets) {
        if (!have.has(s.id)) {
          b.gearSets.push(s);
          changed = true;
        }
      }
      return changed;
    },
  },
  {
    id: 'v19-gear-set-icons',
    version: 19,
    run(b) {
      let changed = false;
      // v19: icons for the default gear sets, unless an admin already picked one.
      for (const def of createDefaultContent().gearSets) {
        const s = b.gearSets.find((x) => x.id === def.id);
        if (s && s.icon === null) {
          s.icon = def.icon;
          changed = true;
        }
      }
      return changed;
    },
  },
];

/** Fixed main stats of the default gear templates before v16. */
const OLD_V15_MAINS: Record<string, { mainStat: string; mainBase: number }> = {
  'bronze-blade': { mainStat: 'atk', mainBase: 18 },
  'runed-saber': { mainStat: 'atk', mainBase: 28 },
  'starforged-edge': { mainStat: 'atk', mainBase: 42 },
  'leather-vest': { mainStat: 'hp', mainBase: 120 },
  'knight-mail': { mainStat: 'hp', mainBase: 190 },
  'aegis-of-dawn': { mainStat: 'hp', mainBase: 280 },
  'lucky-clover': { mainStat: 'spd', mainBase: 3 },
  'moon-pendant': { mainStat: 'atkPct', mainBase: 0.06 },
  'warding-amulet': { mainStat: 'defPct', mainBase: 0.08 },
  'swift-feather': { mainStat: 'spd', mainBase: 6 },
  'heart-locket': { mainStat: 'hpPct', mainBase: 0.1 },
  'ranger-boots': { mainStat: 'spd', mainBase: 4 },
  'iron-greaves': { mainStat: 'defPct', mainBase: 0.08 },
  'pilgrim-treads': { mainStat: 'hpPct', mainBase: 0.07 },
  'warlord-sabatons': { mainStat: 'atkPct', mainBase: 0.09 },
};

const OLD_SPD_CHARM_NAMES: Record<string, string> = { 'lucky-clover': 'Lucky Clover', 'swift-feather': 'Swift Feather' };

/** Default stage drop tables before v15 (no boots). */
const OLD_V14_DROPS: Record<string, unknown> = {
  '1-1': [
    { gear: 'bronze-blade', chance: 0.35 },
    { gear: 'leather-vest', chance: 0.35 },
    { gear: 'lucky-clover', chance: 0.25 },
  ],
  '1-2': [
    { gear: 'bronze-blade', chance: 0.35 },
    { gear: 'leather-vest', chance: 0.35 },
    { gear: 'lucky-clover', chance: 0.25 },
  ],
  '1-3': [
    { gear: 'bronze-blade', chance: 0.35 },
    { gear: 'leather-vest', chance: 0.35 },
    { gear: 'lucky-clover', chance: 0.25 },
  ],
  '1-4': [
    { gear: 'runed-saber', chance: 0.3 },
    { gear: 'knight-mail', chance: 0.3 },
    { gear: 'moon-pendant', chance: 0.2 },
  ],
  '2-1': [
    { gear: 'runed-saber', chance: 0.25 },
    { gear: 'knight-mail', chance: 0.25 },
    { gear: 'lucky-clover', chance: 0.3 },
    { gear: 'moon-pendant', chance: 0.15 },
  ],
  '2-2': [
    { gear: 'runed-saber', chance: 0.25 },
    { gear: 'knight-mail', chance: 0.25 },
    { gear: 'lucky-clover', chance: 0.3 },
    { gear: 'moon-pendant', chance: 0.15 },
  ],
  '2-3': [
    { gear: 'runed-saber', chance: 0.25 },
    { gear: 'knight-mail', chance: 0.25 },
    { gear: 'lucky-clover', chance: 0.3 },
    { gear: 'moon-pendant', chance: 0.15 },
  ],
  '2-4': [
    { gear: 'starforged-edge', chance: 0.12 },
    { gear: 'aegis-of-dawn', chance: 0.12 },
    { gear: 'runed-saber', chance: 0.4 },
    { gear: 'warding-amulet', chance: 0.3 },
  ],
  '3-1': [
    { gear: 'runed-saber', chance: 0.3 },
    { gear: 'knight-mail', chance: 0.3 },
    { gear: 'warding-amulet', chance: 0.25 },
    { gear: 'swift-feather', chance: 0.06 },
  ],
  '3-2': [
    { gear: 'runed-saber', chance: 0.3 },
    { gear: 'knight-mail', chance: 0.3 },
    { gear: 'warding-amulet', chance: 0.25 },
    { gear: 'swift-feather', chance: 0.06 },
  ],
  '3-3': [
    { gear: 'runed-saber', chance: 0.3 },
    { gear: 'knight-mail', chance: 0.3 },
    { gear: 'warding-amulet', chance: 0.25 },
    { gear: 'swift-feather', chance: 0.06 },
  ],
  '3-4': [
    { gear: 'starforged-edge', chance: 0.25 },
    { gear: 'aegis-of-dawn', chance: 0.25 },
    { gear: 'swift-feather', chance: 0.2 },
    { gear: 'heart-locket', chance: 0.2 },
  ],
  '4-1': [
    { gear: 'runed-saber', chance: 0.3 },
    { gear: 'knight-mail', chance: 0.3 },
    { gear: 'warding-amulet', chance: 0.25 },
    { gear: 'moon-pendant', chance: 0.2 },
    { gear: 'swift-feather', chance: 0.08 },
    { gear: 'starforged-edge', chance: 0.06 },
  ],
  '4-2': [
    { gear: 'runed-saber', chance: 0.3 },
    { gear: 'knight-mail', chance: 0.3 },
    { gear: 'warding-amulet', chance: 0.25 },
    { gear: 'moon-pendant', chance: 0.2 },
    { gear: 'swift-feather', chance: 0.08 },
    { gear: 'starforged-edge', chance: 0.06 },
  ],
  '4-3': [
    { gear: 'runed-saber', chance: 0.3 },
    { gear: 'knight-mail', chance: 0.3 },
    { gear: 'warding-amulet', chance: 0.25 },
    { gear: 'moon-pendant', chance: 0.2 },
    { gear: 'swift-feather', chance: 0.08 },
    { gear: 'starforged-edge', chance: 0.06 },
  ],
  '4-4': [
    { gear: 'starforged-edge', chance: 0.3 },
    { gear: 'aegis-of-dawn', chance: 0.3 },
    { gear: 'swift-feather', chance: 0.25 },
    { gear: 'heart-locket', chance: 0.25 },
  ],
  '5-1': [
    { gear: 'runed-saber', chance: 0.3 },
    { gear: 'knight-mail', chance: 0.3 },
    { gear: 'warding-amulet', chance: 0.25 },
    { gear: 'moon-pendant', chance: 0.2 },
    { gear: 'swift-feather', chance: 0.08 },
    { gear: 'starforged-edge', chance: 0.06 },
  ],
  '5-2': [
    { gear: 'runed-saber', chance: 0.3 },
    { gear: 'knight-mail', chance: 0.3 },
    { gear: 'warding-amulet', chance: 0.25 },
    { gear: 'moon-pendant', chance: 0.2 },
    { gear: 'swift-feather', chance: 0.08 },
    { gear: 'starforged-edge', chance: 0.06 },
  ],
  '5-3': [
    { gear: 'runed-saber', chance: 0.3 },
    { gear: 'knight-mail', chance: 0.3 },
    { gear: 'warding-amulet', chance: 0.25 },
    { gear: 'moon-pendant', chance: 0.2 },
    { gear: 'swift-feather', chance: 0.08 },
    { gear: 'starforged-edge', chance: 0.06 },
  ],
  '5-4': [
    { gear: 'starforged-edge', chance: 0.3 },
    { gear: 'aegis-of-dawn', chance: 0.3 },
    { gear: 'swift-feather', chance: 0.25 },
    { gear: 'heart-locket', chance: 0.25 },
  ],
  '6-1': [
    { gear: 'runed-saber', chance: 0.3 },
    { gear: 'knight-mail', chance: 0.3 },
    { gear: 'warding-amulet', chance: 0.25 },
    { gear: 'moon-pendant', chance: 0.2 },
    { gear: 'swift-feather', chance: 0.08 },
    { gear: 'starforged-edge', chance: 0.06 },
  ],
  '6-2': [
    { gear: 'runed-saber', chance: 0.3 },
    { gear: 'knight-mail', chance: 0.3 },
    { gear: 'warding-amulet', chance: 0.25 },
    { gear: 'moon-pendant', chance: 0.2 },
    { gear: 'swift-feather', chance: 0.08 },
    { gear: 'starforged-edge', chance: 0.06 },
  ],
  '6-3': [
    { gear: 'runed-saber', chance: 0.3 },
    { gear: 'knight-mail', chance: 0.3 },
    { gear: 'warding-amulet', chance: 0.25 },
    { gear: 'moon-pendant', chance: 0.2 },
    { gear: 'swift-feather', chance: 0.08 },
    { gear: 'starforged-edge', chance: 0.06 },
  ],
  '6-4': [
    { gear: 'starforged-edge', chance: 0.3 },
    { gear: 'aegis-of-dawn', chance: 0.3 },
    { gear: 'swift-feather', chance: 0.25 },
    { gear: 'heart-locket', chance: 0.25 },
  ],
};

/** Default definitions (before v14) of the spells that moved to DEF/HP/SPD scaling. */
const OLD_V13_SPELLS: Record<string, { name: string; targeting: string; cooldown: number; effects: unknown }> = {
  'gaia-skill': {
    name: 'Earthen Bulwark',
    targeting: 'none',
    cooldown: 4,
    effects: [
      { kind: 'shield', to: 'allAllies', mult: 2.2 },
      { kind: 'status', to: 'self', status: 'taunt', turns: 2 },
    ],
  },
  'gaia-ult': {
    name: 'World Pillar',
    targeting: 'none',
    cooldown: 0,
    effects: [
      { kind: 'shield', to: 'allAllies', mult: 3 },
      { kind: 'status', to: 'allAllies', status: 'defUp', turns: 3 },
      { kind: 'status', to: 'self', status: 'taunt', turns: 2 },
    ],
  },
  'pebble-ult': {
    name: 'Mountain Stance',
    targeting: 'none',
    cooldown: 0,
    effects: [
      { kind: 'shield', to: 'self', mult: 2 },
      { kind: 'status', to: 'self', status: 'defUp', turns: 3 },
      { kind: 'status', to: 'self', status: 'taunt', turns: 2 },
    ],
  },
  'drip-skill': {
    name: 'Shell Up',
    targeting: 'none',
    cooldown: 3,
    effects: [
      { kind: 'shield', to: 'self', mult: 1.8 },
      { kind: 'status', to: 'self', status: 'taunt', turns: 2 },
    ],
  },
  'drip-ult': {
    name: 'Iron Shell',
    targeting: 'none',
    cooldown: 0,
    effects: [
      { kind: 'shield', to: 'self', mult: 2.5 },
      { kind: 'status', to: 'self', status: 'taunt', turns: 2 },
    ],
  },
  'bramble-skill': {
    name: 'Prickly Guard',
    targeting: 'none',
    cooldown: 3,
    effects: [
      { kind: 'status', to: 'self', status: 'taunt', turns: 2 },
      { kind: 'status', to: 'self', status: 'defUp', turns: 2 },
      { kind: 'shield', to: 'self', mult: 1.5 },
    ],
  },
  'bramble-ult': {
    name: 'Thorn Fortress',
    targeting: 'none',
    cooldown: 0,
    effects: [
      { kind: 'shield', to: 'self', mult: 2.5 },
      { kind: 'status', to: 'self', status: 'taunt', turns: 3 },
      { kind: 'status', to: 'self', status: 'defUp', turns: 3 },
    ],
  },
  'roland-skill': {
    name: 'Shield Wall',
    targeting: 'none',
    cooldown: 4,
    effects: [
      { kind: 'status', to: 'self', status: 'taunt', turns: 2 },
      { kind: 'status', to: 'self', status: 'defUp', turns: 2 },
    ],
  },
  'varek-skill': {
    name: 'Bulwark of Faith',
    targeting: 'none',
    cooldown: 4,
    effects: [
      { kind: 'shield', to: 'allAllies', mult: 1.2 },
      { kind: 'status', to: 'self', status: 'taunt', turns: 2 },
    ],
  },
  'mossy-skill': { name: 'Moss Wrap', targeting: 'none', cooldown: 3, effects: [{ kind: 'heal', to: 'allAllies', mult: 1 }] },
  'celeste-skill': { name: 'Prayer', targeting: 'none', cooldown: 3, effects: [{ kind: 'heal', to: 'allAllies', mult: 1.4 }] },
  'zephyr-skill': {
    name: 'Skyfall Strike',
    targeting: 'enemy',
    cooldown: 3,
    effects: [
      { kind: 'damage', to: 'target', mult: 2.8 },
      { kind: 'status', to: 'self', status: 'spdUp', turns: 2 },
    ],
  },
  'gusty-skill': { name: 'Flutter Flurry', targeting: 'none', cooldown: 3, effects: [{ kind: 'damage', to: 'allEnemies', mult: 0.9 }] },
};

/** Enemy levels of the default stages before v11 (their recommended level was this + 2). */
const OLD_STAGE_LEVELS: Record<string, number> = {
  '1-1': 1,
  '1-2': 2,
  '1-3': 3,
  '1-4': 4,
  '2-1': 7,
  '2-2': 9,
  '2-3': 11,
  '2-4': 13,
  '3-1': 16,
  '3-2': 18,
  '3-3': 20,
  '3-4': 23,
  '4-1': 27,
  '4-2': 29,
  '4-3': 31,
  '4-4': 34,
  '5-1': 36,
  '5-2': 38,
  '5-3': 40,
  '5-4': 43,
  '6-1': 45,
  '6-2': 47,
  '6-3': 49,
  '6-4': 52,
};

/** Third-star action budgets before v11. */
const OLD_ACTION_BUDGETS: Record<string, number> = {
  '1-1': 15,
  '1-2': 18,
  '1-3': 20,
  '1-4': 35,
  '2-1': 22,
  '2-2': 35,
  '2-3': 32,
  '2-4': 45,
  '3-1': 40,
  '3-2': 55,
  '3-3': 60,
  '3-4': 75,
  '4-1': 25,
  '4-2': 65,
  '4-3': 75,
  '4-4': 100,
  '5-1': 35,
  '5-2': 75,
  '5-3': 90,
  '5-4': 95,
  '6-1': 35,
  '6-2': 75,
  '6-3': 85,
  '6-4': 100,
};
