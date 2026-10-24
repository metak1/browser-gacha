import { z } from 'zod';
import { GEAR_SLOTS, GEAR_STATS } from '../gear';
import {
  EFFECT_TARGETS,
  ELEMENT_IDS,
  PASSIVE_TRIGGERS,
  ROLE_IDS,
  STATUS_IDS,
  TARGETINGS,
  type Effect,
  type Passive,
  type PassiveTrigger,
  COMBAT_STATS,
  SCALE_STATS,
  type CombatStat,
  type ScaleStat,
} from '../types';
import {
  MISSION_KINDS,
  SCENE_THEMES,
  type BannerDef,
  type ChapterDef,
  type CharacterDef,
  type ContentBundle,
  type ContentDocs,
  type ContentKind,
  type DungeonDef,
  type EventDef,
  type EnemyDef,
  type GameSettings,
  type GearDef,
  type GearSetDef,
  type MaterialDef,
  type MissionDef,
  type SkillDef,
  type StageDef,
} from './types';

const id = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{1,40}$/, 'ids use 1–40 letters, numbers, "-" or "_"');
const name = z.string().trim().min(1, 'required').max(60);
// Art references default to null so content saved before art existed still loads. Unknown
// sprite/icon ids are tolerated (the client falls back to emoji) so removing an asset pack
// can never make stored content unloadable.
const icon = z.number().int().min(1).max(100_000).nullable().default(null);
const sprite = z.string().trim().max(60).nullable().default(null);
const int = (min: number, max: number) => z.number().int().min(min).max(max);
const element = z.enum(ELEMENT_IDS as [string, ...string[]]) as z.ZodType<CharacterDef['element']>;
const role = z.enum(ROLE_IDS as [string, ...string[]]) as z.ZodType<CharacterDef['role']>;
const to = z.enum(EFFECT_TARGETS as [string, ...string[]]) as z.ZodType<Effect['to']>;

const rarity = z.union([z.literal(3), z.literal(4), z.literal(5)]);
const stats = z.object({ hp: int(1, 1_000_000), atk: int(0, 100_000), def: int(0, 100_000), spd: int(1, 1000) });

const scaleStat = z.enum(SCALE_STATS as [ScaleStat, ...ScaleStat[]]);
const effect: z.ZodType<Effect> = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('damage'),
    to,
    mult: z.number().min(0).max(20),
    scale: scaleStat.optional(),
    hits: int(1, 10).optional(),
    pierce: z.number().min(0).max(1).optional(),
    lifesteal: z.number().min(0).max(5).optional(),
  }),
  z.object({ kind: z.literal('heal'), to, mult: z.number().min(0).max(20), scale: scaleStat.optional() }),
  z.object({ kind: z.literal('shield'), to, mult: z.number().min(0).max(20), scale: scaleStat.optional() }),
  z.object({
    kind: z.literal('status'),
    to,
    status: z.enum(STATUS_IDS as [string, ...string[]]) as z.ZodType<(typeof STATUS_IDS)[number]>,
    turns: int(1, 10),
    chance: z.number().min(0).max(1).optional(),
  }),
  z.object({ kind: z.literal('advance'), to, amount: z.number().min(0).max(1) }),
  z.object({ kind: z.literal('energy'), to, amount: int(0, 100) }),
  z.object({ kind: z.literal('summon'), to, unit: id, count: int(1, 4) }),
  z.object({ kind: z.literal('cleanse'), to }),
  z.object({ kind: z.literal('dispel'), to }),
  z.object({ kind: z.literal('delay'), to, amount: z.number().min(0).max(1) }),
  z.object({ kind: z.literal('revive'), to, amount: z.number().min(0.01).max(1) }),
]) as z.ZodType<Effect>;

const statusId = z.enum(STATUS_IDS as [string, ...string[]]) as z.ZodType<(typeof STATUS_IDS)[number]>;
const bonus = z.number().min(0).max(5);
const passive: z.ZodType<Passive> = z.object({
  name,
  rules: z
    .array(
      z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('stat'), stat: z.enum(['hp', 'atk', 'def', 'spd']), amount: bonus }),
        z.object({ kind: z.literal('damageVsStatus'), status: statusId, amount: bonus }),
        z.object({ kind: z.literal('lowHpDamage'), threshold: z.number().min(0.01).max(1), amount: bonus }),
        z.object({ kind: z.literal('critRate'), amount: z.number().min(0).max(1) }),
        z.object({ kind: z.literal('combat'), stat: z.enum(COMBAT_STATS as [CombatStat, ...CombatStat[]]), amount: z.number().min(0).max(5) }),
        z.object({
          kind: z.literal('trigger'),
          on: z.enum(PASSIVE_TRIGGERS as [string, ...string[]]) as z.ZodType<PassiveTrigger>,
          chance: z.number().min(0).max(1).optional(),
          effects: z.array(effect).min(1, 'a trigger needs at least one effect').max(4),
        }),
      ]),
    )
    .min(1, 'a passive needs at least one rule')
    .max(4),
}) as z.ZodType<Passive>;

export const skillSchema: z.ZodType<SkillDef> = z.object({
  id,
  name,
  targeting: z.enum(TARGETINGS as [string, ...string[]]) as z.ZodType<SkillDef['targeting']>,
  cooldown: int(0, 10),
  effects: z.array(effect).min(1, 'a spell needs at least one effect').max(8),
  icon,
});

const unitBase = {
  id,
  name,
  element,
  role,
  emoji: z.string().trim().min(1, 'required').max(16),
  sprite,
  base: stats,
  basic: id,
  skill: id.nullable(),
  // Defaults keep content saved before ultimates existed loadable.
  ultimate: id.nullable().default(null),
  passive: passive.nullable().default(null),
};

const lore = z.object({ title: name, text: z.string().trim().max(4000), unlockRank: int(0, 20) });

export const characterSchema: z.ZodType<CharacterDef> = z.object({
  ...unitBase,
  rarity,
  limited: z.boolean(),
  title: z.string().trim().max(80).default(''),
  lore: z.array(lore).max(12).default([]),
});

const fraction = z.number().min(0.01).max(0.99);
const mechanics = z.object({
  charge: z.object({ skill: id, every: int(2, 20), breakPct: z.number().min(0.01).max(1) }).nullable(),
  enrage: z.object({ below: fraction, atk: z.number().min(1).max(5), spd: z.number().min(1).max(5) }).nullable(),
  adds: z.object({ at: z.array(fraction).min(1).max(5), unit: id, count: int(1, 4) }).nullable(),
});

export const enemySchema: z.ZodType<EnemyDef> = z.object({ ...unitBase, boss: z.boolean(), mechanics: mechanics.nullable().default(null) });

const materialStack = z.object({ id, count: int(1, 100_000) });
const reward = z.object({
  gems: int(0, 1_000_000),
  gold: int(0, 1_000_000),
  stardust: int(0, 1_000_000),
  materials: z.array(materialStack).max(8).default([]),
});

export const chapterSchema: z.ZodType<ChapterDef> = z.object({
  id: int(1, 999),
  name,
  theme: z.enum(SCENE_THEMES as [string, ...string[]]) as z.ZodType<ChapterDef['theme']>,
  starRewards: z
    .array(z.object({ stars: int(1, 999), reward }))
    .max(6)
    .default([]),
});

const encounterEnemies = z.array(z.object({ id, level: int(1, 999) }));
const waves = z
  .array(encounterEnemies.min(1, 'a wave needs at least one enemy').max(5, 'at most 5 enemies per wave'))
  .max(4, 'at most 4 extra waves')
  .default([]);
const materialDrops = z
  .array(z.object({ material: id, min: int(1, 999), max: int(1, 999), chance: z.number().min(0).max(1) }))
  .max(8)
  .default([]);

export const stageSchema: z.ZodType<StageDef> = z.object({
  id,
  chapter: int(1, 999),
  index: int(0, 999),
  name,
  enemies: z
    .array(z.object({ id, level: int(1, 999) }))
    .min(1, 'a stage needs at least one enemy')
    .max(5, 'at most 5 enemies'),
  recommendedLevel: int(1, 999),
  statMult: z.number().min(0.1).max(10).default(1),
  firstClearGems: int(0, 1_000_000),
  gold: int(0, 1_000_000),
  drops: z
    .array(z.object({ gear: id, chance: z.number().min(0).max(1) }))
    .max(8)
    .default([]),
  materialDrops,
  objectives: z
    .array(
      z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('win') }),
        z.object({ kind: z.literal('noDeaths') }),
        z.object({ kind: z.literal('maxActions'), value: int(1, 999) }),
      ]),
    )
    .max(3, 'at most 3 objectives')
    .default([{ kind: 'win' }]),
  waves,
});

export const dungeonSchema: z.ZodType<DungeonDef> = z.object({
  id,
  name,
  emoji: z.string().trim().min(1, 'required').max(16),
  description: z.string().trim().max(300).default(''),
  theme: z.enum(SCENE_THEMES as [string, ...string[]]) as z.ZodType<DungeonDef['theme']>,
  days: z.array(int(0, 6)).max(7),
  tiers: z
    .array(
      z.object({
        name,
        recommendedLevel: int(1, 999),
        enemies: encounterEnemies.min(1, 'a tier needs at least one enemy').max(5, 'at most 5 enemies'),
        waves,
        gold: int(0, 1_000_000),
        materialDrops,
        gearRolls: z
          .object({ count: int(1, 10), r3: z.number().min(0).max(100), r4: z.number().min(0).max(100), r5: z.number().min(0).max(100) })
          .refine((g) => g.r3 + g.r4 + g.r5 > 0, 'give at least one rarity a weight')
          .nullable()
          .default(null),
        stamina: int(0, 1000).default(10),
      }),
    )
    .min(1, 'a dungeon needs at least one tier')
    .max(6),
  sets: z.array(id).max(20).default([]),
  mechanic: id.nullable().default(null),
});

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD');

export const eventSchema: z.ZodType<EventDef> = z.object({
  id,
  name,
  emoji: z.string().trim().min(1, 'required').max(16),
  description: z.string().trim().max(400).default(''),
  theme: z.enum(SCENE_THEMES as [string, ...string[]]) as z.ZodType<EventDef['theme']>,
  start: dateStr,
  end: dateStr,
  currency: z.object({ name, emoji: z.string().trim().min(1).max(16), icon }),
  stages: z
    .array(
      z.object({
        name,
        recommendedLevel: int(1, 999),
        enemies: encounterEnemies.min(1, 'a stage needs at least one enemy').max(5, 'at most 5 enemies'),
        waves,
        currencyMin: int(0, 100_000),
        currencyMax: int(0, 100_000),
        gold: int(0, 1_000_000),
        firstClearGems: int(0, 1_000_000),
      }),
    )
    .min(1, 'an event needs at least one stage')
    .max(10),
  shop: z.array(z.object({ id, reward, character: id.nullable().default(null), cost: int(1, 10_000_000), limit: int(1, 9999) })).max(20),
}) as z.ZodType<EventDef>;

const reward0 = (gems = 0, gold = 0, stardust = 0, mats: Record<string, number> = {}) => ({
  gems,
  gold,
  stardust,
  materials: Object.entries(mats).map(([id, count]) => ({ id, count })),
});

export const DEFAULT_PLAYER_LEVEL = {
  maxLevel: 100,
  xpBase: 100,
  xpPerLevel: 30,
  rewardGems: 50,
  rewardStamina: 30,
  xpPerStamina: 6,
  xpTower: 50,
  xpArena: 40,
  xpGuild: 40,
  titles: [
    { level: 5, title: 'Adventurer' },
    { level: 15, title: 'Veteran' },
    { level: 30, title: 'Hero' },
    { level: 50, title: 'Legend' },
    { level: 80, title: 'Mythic' },
  ],
};
export const DEFAULT_LOGIN_CALENDAR = [
  reward0(50),
  reward0(0, 2000),
  reward0(0, 0, 0, { 'skill-tome': 1 }),
  reward0(80),
  reward0(0, 0, 10),
  reward0(0, 0, 0, { 'star-crystal': 1 }),
  reward0(200),
];
export const DEFAULT_SOCIAL = { maxFriends: 30, supportGold: 200 };
export const DEFAULT_FIRST_SUMMON = { free: true, guarantee5: true };
export const DEFAULT_REFORGE = {
  material: 'reforge-stone',
  gold: 2000,
  stones: 1,
  salvageStones: { r3: 0, r4: 1, r5: 3 },
};
export const DEFAULT_TOWER = {
  startLevel: 6,
  baseMult: 1,
  multPerFloor: 0.004,
  multPastCap: 0.02,
  bossEvery: 5,
  bossMult: 0.8,
  wavesFrom: 20,
  floorGems: 20,
  floorGold: 300,
  floorGoldPerFloor: 40,
  milestoneEvery: 10,
  milestoneReward: reward0(150, 0, 10, { 'star-crystal': 1, 'skill-tome': 1, 'reforge-stone': 3 }),
};
export const DEFAULT_ACTIVITY_CHESTS = [
  { points: 30, reward: reward0(0, 3000, 0, { 'skill-tome': 1 }) },
  { points: 60, reward: reward0(100, 0, 0, { 'star-crystal': 1 }) },
  { points: 100, reward: reward0(200, 0, 20) },
];

export const DEFAULT_GUILD = {
  createCost: 5000,
  maxMembers: 20,
  attemptsPerDay: 3,
  turnLimit: 40,
  attemptGold: 500,
  bosses: [
    { enemy: 'wyrm', level: 40, hpPerMember: 150_000 },
    { enemy: 'kraken', level: 40, hpPerMember: 150_000 },
    { enemy: 'lich', level: 45, hpPerMember: 180_000 },
    { enemy: 'thunderbird', level: 45, hpPerMember: 180_000 },
  ],
  tiers: [
    { percent: 25, reward: reward0(100, 5000) },
    { percent: 50, reward: reward0(150, 0, 0, { 'skill-tome': 2 }) },
    { percent: 75, reward: reward0(200, 0, 0, { 'star-crystal': 1 }) },
    { percent: 100, reward: reward0(300, 0, 30, { 'star-crystal': 2 }) },
  ],
};

export const DEFAULT_STAMINA = { max: 200, regenMinutes: 5, campaignCost: 10, hardCost: 10, refillGems: 50, refillAmount: 60 };
export const DEFAULT_UNLOCKS = { arena: '1-4', dungeons: '2-1', tower: '2-4' };

export const DEFAULT_HARD_MODE = { enabled: true, levelBonus: 10, statMult: 1.2, rewardMult: 2, gearChanceMult: 1.5, firstClearGems: 100 };

export const materialSchema: z.ZodType<MaterialDef> = z.object({
  id,
  name,
  emoji: z.string().trim().min(1, 'required').max(16),
  icon,
  rarity,
  element: (z.enum(ELEMENT_IDS as [string, ...string[]]) as z.ZodType<CharacterDef['element']>).nullable().default(null),
  description: z.string().trim().max(300).default(''),
});

export const gearSchema: z.ZodType<GearDef> = z.object({
  id,
  name,
  emoji: z.string().trim().min(1, 'required').max(16),
  slot: z.enum(GEAR_SLOTS as [string, ...string[]]) as z.ZodType<GearDef['slot']>,
  rarity,
  mainStat: (z.enum(GEAR_STATS as [string, ...string[]]) as z.ZodType<NonNullable<GearDef['mainStat']>>).nullable(),
  mainBase: z.number().min(0).max(100_000),
  icon,
  set: id.nullable().default(null),
});

export const gearSetSchema: z.ZodType<GearSetDef> = z.object({
  id,
  name,
  emoji: z.string().trim().min(1, 'required').max(16),
  icon,
  bonuses: z
    .array(
      z.object({
        pieces: z.number().int().min(1).max(4),
        stat: z.enum(GEAR_STATS as [string, ...string[]]) as z.ZodType<GearSetDef['bonuses'][number]['stat']>,
        value: z.number().min(0).max(100_000),
      }),
    )
    .max(6),
});

export const bannerSchema: z.ZodType<BannerDef> = z.object({
  id,
  name,
  description: z.string().trim().max(300),
  limited: z.boolean(),
  active: z.boolean(),
  featured5: id.nullable(),
  featured4: z.array(id).max(6),
});

const ELEMENT_ESSENCE = ['flame', 'tide', 'gale', 'stone', 'volt', 'frost'].map((e) => `${e}-essence`);

export const DEFAULT_PROGRESSION = {
  baseCap: 20,
  ascension: [
    { cap: 30, gold: 3000, essence: 4, crystals: 0, statBonus: 0.04 },
    { cap: 40, gold: 8000, essence: 8, crystals: 1, statBonus: 0.04 },
    { cap: 50, gold: 15000, essence: 12, crystals: 3, statBonus: 0.05 },
    { cap: 60, gold: 25000, essence: 20, crystals: 6, statBonus: 0.06 },
  ],
  crystal: 'star-crystal',
  tome: 'skill-tome',
  skillLevels: [
    { gold: 1000, tomes: 1 },
    { gold: 2500, tomes: 2 },
    { gold: 5000, tomes: 3 },
    { gold: 9000, tomes: 5 },
  ],
  skillLevelBonus: 0.1,
  shop: [
    ...ELEMENT_ESSENCE.map((material) => ({ material, gold: 900, stardust: 0 })),
    { material: 'star-crystal', gold: 0, stardust: 40 },
    { material: 'skill-tome', gold: 3000, stardust: 0 },
  ],
};

export const DEFAULT_ARENA_TIERS = [
  { name: 'Bronze', icon: '🥉', minRating: 0, reward: { gems: 100, gold: 1000, stardust: 0, materials: [] } },
  { name: 'Silver', icon: '🥈', minRating: 1100, reward: { gems: 250, gold: 2000, stardust: 0, materials: [] } },
  { name: 'Gold', icon: '🥇', minRating: 1250, reward: { gems: 400, gold: 3000, stardust: 10, materials: [{ id: 'skill-tome', count: 1 }] } },
  { name: 'Platinum', icon: '💠', minRating: 1400, reward: { gems: 600, gold: 4000, stardust: 25, materials: [{ id: 'star-crystal', count: 1 }] } },
  { name: 'Diamond', icon: '💎', minRating: 1600, reward: { gems: 900, gold: 6000, stardust: 50, materials: [{ id: 'star-crystal', count: 2 }] } },
];

export const missionSchema: z.ZodType<MissionDef> = z.object({
  id,
  name,
  description: z.string().trim().max(200),
  kind: z.enum(MISSION_KINDS as [string, ...string[]]) as z.ZodType<MissionDef['kind']>,
  target: id.nullable(),
  count: int(1, 100_000),
  repeat: z.enum(['once', 'daily']),
  active: z.boolean(),
  reward,
  points: int(0, 1000).default(0),
});

const rate = z.number().min(0).max(1);
export const settingsSchema: z.ZodType<GameSettings> = z.object({
  pullCost: int(1, 1_000_000),
  startingGems: int(0, 10_000_000),
  startingGold: int(0, 10_000_000),
  dailyGems: int(0, 1_000_000),
  dailyGold: int(0, 1_000_000),
  maxTeamSize: int(1, 6),
  maxLevel: int(1, 999),
  levelCostBase: int(0, 1_000_000),
  levelCostPerLevel: int(0, 1_000_000),
  starterCharacters: z.array(id).max(6),
  stardustPerDupe: z.object({ r3: int(0, 10_000), r4: int(0, 10_000), r5: int(0, 10_000) }),
  stardustExchangeCost: int(1, 1_000_000),
  gacha: z.object({
    base5: rate,
    softPity5: int(1, 1000),
    softStep5: rate,
    hardPity5: int(1, 1000),
    base4: rate,
    softPity4: int(1, 1000),
    softStep4: rate,
    hardPity4: int(1, 1000),
  }),
  // Gear & arena settings default for content saved before they existed.
  gearMaxLevel: int(0, 100).default(12),
  gearUpgradeBase: int(0, 1_000_000).default(60),
  gearUpgradePerLevel: int(0, 1_000_000).default(40),
  gearSalvageBase: int(0, 1_000_000).default(40),
  gearInventoryCap: int(10, 2000).default(200),
  arenaTicketsPerDay: int(0, 100).default(5),
  arenaStartRating: int(0, 10_000).default(1000),
  arenaK: int(1, 200).default(32),
  arenaWinGold: int(0, 1_000_000).default(300),
  arenaWinGems: int(0, 1_000_000).default(20),
  arenaTiers: z
    .array(z.object({ name, icon: z.string().trim().min(1).max(16), minRating: int(0, 100_000), reward }))
    .min(1)
    .max(12)
    .default(DEFAULT_ARENA_TIERS),
  progression: z
    .object({
      baseCap: int(1, 999),
      ascension: z
        .array(z.object({ cap: int(1, 999), gold: int(0, 10_000_000), essence: int(0, 9999), crystals: int(0, 9999), statBonus: z.number().min(0).max(5) }))
        .max(12),
      crystal: id,
      tome: id,
      skillLevels: z.array(z.object({ gold: int(0, 10_000_000), tomes: int(0, 9999) })).max(9),
      skillLevelBonus: z.number().min(0).max(5),
      shop: z.array(z.object({ material: id, gold: int(0, 10_000_000), stardust: int(0, 1_000_000) })).max(30),
    })
    .default(DEFAULT_PROGRESSION),
  hardMode: z
    .object({
      enabled: z.boolean(),
      levelBonus: int(0, 200),
      statMult: z.number().min(0.1).max(20),
      rewardMult: z.number().min(0).max(20),
      gearChanceMult: z.number().min(0).max(20),
      firstClearGems: int(0, 1_000_000),
    })
    .default(DEFAULT_HARD_MODE),
  stamina: z
    .object({
      max: int(1, 10_000),
      regenMinutes: z.number().min(0.1).max(1440),
      campaignCost: int(0, 1000),
      hardCost: int(0, 1000),
      refillGems: int(0, 1_000_000),
      refillAmount: int(1, 10_000),
    })
    .default(DEFAULT_STAMINA),
  unlocks: z.object({ arena: id.nullable(), dungeons: id.nullable(), tower: id.nullable().default('2-4') }).default(DEFAULT_UNLOCKS),
  maxSweep: int(1, 100).default(10),
  playerLevel: z
    // Stored settings from before the rename call it xpDungeon.
    .preprocess(
      (v) => (v && typeof v === 'object' && 'xpDungeon' in v && !('xpTower' in v) ? { ...v, xpTower: (v as { xpDungeon: unknown }).xpDungeon } : v),
      z.object({
        maxLevel: int(1, 999),
        xpBase: int(1, 1_000_000),
        xpPerLevel: int(0, 1_000_000),
        rewardGems: int(0, 1_000_000),
        rewardStamina: int(0, 10_000),
        xpPerStamina: int(0, 10_000),
        xpTower: int(0, 100_000),
        xpArena: int(0, 100_000),
        xpGuild: int(0, 100_000),
        titles: z.array(z.object({ level: int(1, 999), title: name })).max(20),
      }),
    )
    .default(DEFAULT_PLAYER_LEVEL),
  loginCalendar: z.array(reward).min(1).max(31).default(DEFAULT_LOGIN_CALENDAR),
  social: z.object({ maxFriends: int(0, 500), supportGold: int(0, 1_000_000) }).default(DEFAULT_SOCIAL),
  guild: z
    .object({
      createCost: int(0, 10_000_000),
      maxMembers: int(2, 200),
      attemptsPerDay: int(0, 50),
      turnLimit: int(5, 300),
      attemptGold: int(0, 1_000_000),
      bosses: z
        .array(z.object({ enemy: id, level: int(1, 999), hpPerMember: int(1, 100_000_000) }))
        .min(1)
        .max(12),
      tiers: z.array(z.object({ percent: int(1, 100), reward })).max(10),
    })
    .default(DEFAULT_GUILD),
  firstSummon: z.object({ free: z.boolean(), guarantee5: z.boolean() }).default(DEFAULT_FIRST_SUMMON),
  activityChests: z
    .array(z.object({ points: int(1, 10_000), reward }))
    .max(6)
    .default(DEFAULT_ACTIVITY_CHESTS),
  tower: z
    .object({
      startLevel: int(1, 999),
      baseMult: z.number().min(0.1).max(10),
      multPerFloor: z.number().min(0).max(1),
      multPastCap: z.number().min(0).max(1),
      bossEvery: int(1, 100),
      bossMult: z.number().min(0.1).max(10).default(0.8),
      wavesFrom: int(1, 10_000),
      floorGems: int(0, 100_000),
      floorGold: int(0, 1_000_000),
      floorGoldPerFloor: int(0, 100_000),
      milestoneEvery: int(1, 1000),
      milestoneReward: reward,
    })
    .default(DEFAULT_TOWER),
  reforge: z
    .object({
      material: id,
      gold: int(0, 10_000_000),
      stones: int(0, 1000),
      salvageStones: z.object({ r3: int(0, 1000), r4: int(0, 1000), r5: int(0, 1000) }),
    })
    .default(DEFAULT_REFORGE),
});

export const CONTENT_SCHEMAS: { [K in ContentKind]: z.ZodType<ContentDocs[K]> } = {
  skills: skillSchema,
  characters: characterSchema,
  enemies: enemySchema,
  chapters: chapterSchema,
  stages: stageSchema,
  banners: bannerSchema,
  missions: missionSchema,
  gear: gearSchema,
  gearSets: gearSetSchema,
  materials: materialSchema,
  dungeons: dungeonSchema,
  events: eventSchema,
};

export const bundleSchema: z.ZodType<ContentBundle> = z.object({
  version: z.number().int().min(0),
  settings: settingsSchema,
  skills: z.array(skillSchema),
  characters: z.array(characterSchema),
  enemies: z.array(enemySchema),
  chapters: z.array(chapterSchema),
  stages: z.array(stageSchema),
  banners: z.array(bannerSchema),
  missions: z.array(missionSchema),
  gear: z.array(gearSchema).default([]),
  gearSets: z.array(gearSetSchema).default([]),
  materials: z.array(materialSchema).default([]),
  dungeons: z.array(dungeonSchema).default([]),
  events: z.array(eventSchema).default([]),
});
