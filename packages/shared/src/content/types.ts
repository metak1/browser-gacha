// Editable game content. Everything here is stored in the database and can be
// changed through the admin API; the defaults live in ./defaults.ts.
import type { GearSlot, GearStat } from '../gear';
import type { ElementId, Passive, Rarity, Role, Skill, Stats } from '../types';

export type SceneTheme = 'meadow' | 'ember' | 'frost' | 'cosmos' | 'storm' | 'deep';
export const SCENE_THEMES: SceneTheme[] = ['meadow', 'ember', 'frost', 'cosmos', 'storm', 'deep'];

/** One enemy in an encounter. */
export interface EncounterEnemy {
  id: string;
  level: number;
}

/** A spell / skill that units reference by id. */
export interface SkillDef extends Skill {
  id: string;
}

interface UnitDefBase {
  id: string;
  name: string;
  element: ElementId;
  role: Role;
  emoji: string;
  /** Animated sprite id (see assets.generated.ts); falls back to the emoji when null or missing. */
  sprite: string | null;
  /** Stats at level 1, constellation 0. */
  base: Stats;
  /** Skill id used as the basic attack. */
  basic: string;
  /** Skill id for the cooldown skill, if any. */
  skill: string | null;
  /** Skill id for the ultimate (needs full energy), if any. */
  ultimate: string | null;
  passive: Passive | null;
}

export interface LoreEntry {
  title: string;
  text: string;
  /** Ascension rank needed to read this entry (0 = always). */
  unlockRank: number;
}

export interface CharacterDef extends UnitDefBase {
  rarity: Rarity;
  /** Limited characters only drop as a banner's featured unit. */
  limited: boolean;
  /** Epithet shown under the name, e.g. "The Ember King". */
  title: string;
  lore: LoreEntry[];
}

/** An inventory material: ascension essences, crystals, skill tomes... */
export interface MaterialDef {
  id: string;
  name: string;
  emoji: string;
  icon: number | null;
  rarity: Rarity;
  /** Essences belong to an element; heroes ascend with their own element's essence. */
  element: ElementId | null;
  description: string;
}

export interface MaterialStack {
  id: string;
  count: number;
}

export interface EnemyDef extends UnitDefBase {
  boss: boolean;
  /** Boss fight mechanics, if any. */
  mechanics?: EnemyMechanics | null;
}

/** Scripted boss behaviour. Each part is optional. */
export interface EnemyMechanics {
  /**
   * Every `every` own turns the boss spends a turn charging `skill` (a skill id),
   * then unleashes it on its next turn. Dealing `breakPct` of its max HP while it
   * charges breaks the charge: the attack is cancelled and the boss is stunned.
   */
  charge: { skill: string; every: number; breakPct: number } | null;
  /** Once below `below` of its HP, the boss enrages: ATK and SPD are multiplied. */
  enrage: { below: number; atk: number; spd: number } | null;
  /** At each HP fraction in `at` (once each), the boss calls `count` of `unit`. */
  adds: { at: number[]; unit: string; count: number } | null;
}

export interface ChapterDef {
  id: number;
  name: string;
  theme: SceneTheme;
  /** Chests unlocked by total stars earned in the chapter's stages. */
  starRewards: { stars: number; reward: Reward }[];
}

/** One star condition on a stage. */
export type StageObjective =
  | { kind: 'win' }
  | { kind: 'noDeaths' }
  /** Win using at most this many of your own actions. */
  | { kind: 'maxActions'; value: number };
export type StageObjectiveKind = StageObjective['kind'];
export const STAGE_OBJECTIVE_KINDS: StageObjectiveKind[] = ['win', 'noDeaths', 'maxActions'];

export interface StageDef {
  id: string;
  chapter: number;
  /** Position within the chapter; stages unlock in (chapter, index) order. */
  index: number;
  name: string;
  enemies: { id: string; level: number }[];
  recommendedLevel: number;
  /** Paid once, on the first victory. */
  firstClearGems: number;
  /** Paid on every victory. */
  gold: number;
  /** Gear that can drop on victory, each rolled independently. */
  drops: { gear: string; chance: number }[];
  /** Materials that can drop on victory: count rolled between min and max. */
  materialDrops: { material: string; min: number; max: number; chance: number }[];
  /** Up to three star conditions. */
  objectives: StageObjective[];
  /** Extra waves that arrive, in order, once the previous wave is defeated. */
  waves: EncounterEnemy[][];
  /** Multiplies the enemies' HP, ATK and DEF, to tune difficulty without odd enemy levels. */
  statMult: number;
}

/** One difficulty of a dungeon. */
export interface DungeonTier {
  name: string;
  recommendedLevel: number;
  enemies: EncounterEnemy[];
  waves: EncounterEnemy[][];
  gold: number;
  materialDrops: StageDef['materialDrops'];
}

/** A farmable dungeon, open on certain days with a daily run limit. */
export interface DungeonDef {
  id: string;
  name: string;
  emoji: string;
  description: string;
  theme: SceneTheme;
  /** UTC weekdays it's open (0 = Sunday ... 6 = Saturday). */
  days: number[];
  tiers: DungeonTier[];
}

/** A timed event: its own stages, currency and exchange shop. */
export interface EventDef {
  id: string;
  name: string;
  emoji: string;
  description: string;
  theme: SceneTheme;
  /** Inclusive UTC dates, YYYY-MM-DD. */
  start: string;
  end: string;
  currency: { name: string; emoji: string; icon: number | null };
  stages: EventStage[];
  shop: EventShopItem[];
}

export interface EventStage {
  name: string;
  recommendedLevel: number;
  enemies: EncounterEnemy[];
  waves: EncounterEnemy[][];
  /** Event currency per win, rolled between min and max. */
  currencyMin: number;
  currencyMax: number;
  gold: number;
  firstClearGems: number;
}

export interface EventShopItem {
  id: string;
  /** Currencies and materials; may be empty when it sells a hero. */
  reward: Reward;
  /** A hero copy (e.g. the event's limited hero), or null. */
  character: string | null;
  cost: number;
  /** Purchases allowed per player for the whole event. */
  limit: number;
}

export interface PlayerLevelSettings {
  maxLevel: number;
  /** XP from level L to L+1 = xpBase + xpPerLevel * (L - 1). */
  xpBase: number;
  xpPerLevel: number;
  /** Paid on every level up. */
  rewardGems: number;
  rewardStamina: number;
  /** XP per stamina spent (campaign, hard, sweeps, events) and per other win. */
  xpPerStamina: number;
  xpDungeon: number;
  xpArena: number;
  xpGuild: number;
  /** Titles unlocked by reaching a level. */
  titles: { level: number; title: string }[];
}

export interface GuildBossDef {
  enemy: string;
  level: number;
  /** Boss HP per guild member; the weekly pool is this x members (at least 3). */
  hpPerMember: number;
}

export interface GuildSettings {
  createCost: number;
  maxMembers: number;
  attemptsPerDay: number;
  /** Turns (all units) before a boss attack ends. */
  turnLimit: number;
  /** Gold for every attack, win or lose. */
  attemptGold: number;
  /** One boss per week, in rotation. */
  bosses: GuildBossDef[];
  /** Chests unlocked as the guild's weekly damage reaches a share of the pool. */
  tiers: { percent: number; reward: Reward }[];
}

/** Gear reforging (see gear.ts). */
export interface ReforgeSettings {
  /** Material spent on reforges and perfects. */
  material: string;
  /** Gold per reforge, scaled by the item's rarity. */
  gold: number;
  /** Stones per reforge. */
  stones: number;
  /** Stones from salvaging gear of each rarity. */
  salvageStones: { r3: number; r4: number; r5: number };
}

/** The endless tower (see tower.ts). */
export interface TowerSettings {
  /** Enemy level on floor 1; one level more per floor up to the level cap. */
  startLevel: number;
  /** Enemy stat multiplier: base + perFloor × floor, and ×(1 + pastCap × floors past the level cap). */
  baseMult: number;
  multPerFloor: number;
  multPastCap: number;
  bossEvery: number;
  /** Extra stat multiplier on boss floors. */
  bossMult: number;
  /** Non-boss floors from here on get a second wave. */
  wavesFrom: number;
  floorGems: number;
  floorGold: number;
  floorGoldPerFloor: number;
  milestoneEvery: number;
  milestoneReward: Reward;
}

/** The new-player tutorial's first 10× summon. */
export interface FirstSummonSettings {
  /** The first 10× summon on any banner costs nothing. */
  free: boolean;
  /** If those ten pulls roll no ★5, the last one is a ★5 (banner rules and the 50/50 still apply). */
  guarantee5: boolean;
}

export interface SocialSettings {
  maxFriends: number;
  /** Gold paid to a player each time a friend borrows their support hero. */
  supportGold: number;
}

export interface HardModeSettings {
  enabled: boolean;
  /** Added to every enemy's level. */
  levelBonus: number;
  /** Multiplies enemy HP, ATK and DEF. */
  statMult: number;
  /** Multiplies gold and material drop counts. */
  rewardMult: number;
  /** Multiplies gear drop chances (capped at 100%). */
  gearChanceMult: number;
  /** Gems for the first hard clear of each stage. */
  firstClearGems: number;
}

/** A gear template. Drops roll their substats from this. */
export interface GearDef {
  id: string;
  name: string;
  emoji: string;
  slot: GearSlot;
  rarity: Rarity;
  /** A fixed main stat, or null to roll one from the slot's pool (MAIN_POOLS) on every drop. */
  mainStat: GearStat | null;
  /** Main stat value at +0 when the main stat is fixed (fractions for % stats, e.g. 0.06 = 6%). Random mains use MAIN_BASE. */
  mainBase: number;
  /** Icon number in the icon sheet; falls back to the emoji. */
  icon: number | null;
}

export interface ArenaTier {
  name: string;
  icon: string;
  minRating: number;
  /** Paid at the end of each weekly season to players in this tier. */
  reward: Reward;
}

export interface BannerDef {
  id: string;
  name: string;
  description: string;
  limited: boolean;
  active: boolean;
  featured5: string | null;
  featured4: string[];
}

export interface Reward {
  gems: number;
  gold: number;
  stardust: number;
  materials: MaterialStack[];
}

/**
 * Counter kinds count events after the mission exists; derived kinds
 * (`collect`, `clearStage`) are computed from the player's current state.
 */
export type MissionKind =
  | 'winBattles'
  | 'summon'
  | 'levelUp'
  | 'claimDaily'
  | 'arenaWins'
  | 'upgradeGear'
  | 'ascend'
  | 'skillUp'
  | 'collect'
  | 'clearStage'
  | 'dungeonRuns'
  | 'hardClears'
  | 'guildAttacks';
export const MISSION_KINDS: MissionKind[] = [
  'winBattles',
  'summon',
  'levelUp',
  'claimDaily',
  'arenaWins',
  'upgradeGear',
  'ascend',
  'skillUp',
  'collect',
  'clearStage',
  'dungeonRuns',
  'hardClears',
  'guildAttacks',
];
export const DERIVED_MISSION_KINDS: MissionKind[] = ['collect', 'clearStage', 'hardClears'];

export interface MissionDef {
  id: string;
  name: string;
  description: string;
  kind: MissionKind;
  /** Stage id for `clearStage`; unused otherwise. */
  target: string | null;
  count: number;
  repeat: 'once' | 'daily';
  active: boolean;
  reward: Reward;
  /** Daily activity points paid on claiming a daily mission (see GameSettings.activityChests). */
  points: number;
}

/** A daily chest that opens once the day's activity points reach `points`. */
export interface ActivityChest {
  points: number;
  reward: Reward;
}

export interface GachaRules {
  base5: number;
  softPity5: number;
  softStep5: number;
  hardPity5: number;
  base4: number;
  softPity4: number;
  softStep4: number;
  hardPity4: number;
}

export interface AscensionStep {
  /** Level cap after this ascension. */
  cap: number;
  gold: number;
  /** Essence of the hero's own element. */
  essence: number;
  /** Units of the progression crystal material. */
  crystals: number;
  /** Permanent HP/ATK/DEF bonus added by this step (0.05 = +5%). */
  statBonus: number;
}

export interface SkillLevelStep {
  gold: number;
  tomes: number;
}

export interface ShopEntry {
  material: string;
  gold: number;
  stardust: number;
}

export interface ProgressionSettings {
  /** Level cap before any ascension. */
  baseCap: number;
  ascension: AscensionStep[];
  /** Material id used as "crystals" in ascension. */
  crystal: string;
  /** Material id used as skill tomes. */
  tome: string;
  /** Cost to reach skill level 2, 3, ... (so max skill level = steps + 1). */
  skillLevels: SkillLevelStep[];
  /** Extra damage/heal/shield multiplier per skill level above 1 (0.1 = +10%). */
  skillLevelBonus: number;
  shop: ShopEntry[];
}

export interface StaminaSettings {
  max: number;
  /** Minutes to regenerate one point. */
  regenMinutes: number;
  /** Cost of a normal campaign battle or sweep run. */
  campaignCost: number;
  /** Cost of a hard-mode battle or sweep run. */
  hardCost: number;
  /** Gems for one refill, and how much it adds. */
  refillGems: number;
  refillAmount: number;
}

export interface GameSettings {
  pullCost: number;
  startingGems: number;
  startingGold: number;
  dailyGems: number;
  dailyGold: number;
  maxTeamSize: number;
  maxLevel: number;
  /** Gold to go from level L to L+1 = levelCostBase + levelCostPerLevel * L. */
  levelCostBase: number;
  levelCostPerLevel: number;
  starterCharacters: string[];
  /** Stardust per duplicate by rarity; doubled once the constellation is maxed. */
  stardustPerDupe: { r3: number; r4: number; r5: number };
  stardustExchangeCost: number;
  gacha: GachaRules;
  gearMaxLevel: number;
  gearUpgradeBase: number;
  gearUpgradePerLevel: number;
  /** Gold from salvaging a +0 ★3 item; scales with rarity and level. */
  gearSalvageBase: number;
  gearInventoryCap: number;
  arenaTicketsPerDay: number;
  arenaStartRating: number;
  /** Elo K-factor for attackers; defenders move by half. */
  arenaK: number;
  arenaWinGold: number;
  arenaWinGems: number;
  arenaTiers: ArenaTier[];
  progression: ProgressionSettings;
  hardMode: HardModeSettings;
  /** Winning runs allowed per dungeon per UTC day. */
  dungeonRunsPerDay: number;
  stamina: StaminaSettings;
  /** Stage that must be cleared to open each feature (null = always open). */
  unlocks: { arena: string | null; dungeons: string | null; tower: string | null };
  /** Most runs one sweep can do. */
  maxSweep: number;
  playerLevel: PlayerLevelSettings;
  /** Rewards for consecutive daily claims, cycling (day 1 = first entry). */
  loginCalendar: Reward[];
  social: SocialSettings;
  guild: GuildSettings;
  firstSummon: FirstSummonSettings;
  /** Daily chests unlocked by activity points from claimed daily missions. */
  activityChests: ActivityChest[];
  tower: TowerSettings;
  reforge: ReforgeSettings;
}

export interface ContentBundle {
  version: number;
  settings: GameSettings;
  skills: SkillDef[];
  characters: CharacterDef[];
  enemies: EnemyDef[];
  chapters: ChapterDef[];
  stages: StageDef[];
  banners: BannerDef[];
  missions: MissionDef[];
  gear: GearDef[];
  materials: MaterialDef[];
  dungeons: DungeonDef[];
  events: EventDef[];
}

export const CONTENT_KINDS = ['skills', 'characters', 'enemies', 'chapters', 'stages', 'banners', 'missions', 'gear', 'materials', 'dungeons', 'events'] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

export interface ContentDocs {
  skills: SkillDef;
  characters: CharacterDef;
  enemies: EnemyDef;
  chapters: ChapterDef;
  stages: StageDef;
  banners: BannerDef;
  missions: MissionDef;
  gear: GearDef;
  materials: MaterialDef;
  dungeons: DungeonDef;
  events: EventDef;
}
