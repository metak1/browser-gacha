import { summonKey } from '../battle/engine';
import type { BattleSetup, UnitMechanics, UnitSpec } from '../battle/types';
import { applyGear, applyGearCombat, type GearItem } from '../gear';
import { ascensionBonus, levelSkill } from '../progression';
import { applyPassiveCombat, applyPassiveStats } from '../skills';
import { roleCombat, scaleStats } from '../stats';
import type { Rarity } from '../types';
import type {
  BannerDef,
  ChapterDef,
  CharacterDef,
  DungeonDef,
  EncounterEnemy,
  MaterialDef,
  ContentBundle,
  EnemyDef,
  EnemyMechanics,
  GameSettings,
  GearDef,
  MissionDef,
  SkillDef,
  StageDef,
} from './types';

/** A content bundle plus lookup tables. Build one with indexContent() whenever the bundle changes. */
export interface ContentIndex {
  bundle: ContentBundle;
  settings: GameSettings;
  skillsById: Record<string, SkillDef>;
  charactersById: Record<string, CharacterDef>;
  enemiesById: Record<string, EnemyDef>;
  chaptersById: Record<number, ChapterDef>;
  stagesById: Record<string, StageDef>;
  bannersById: Record<string, BannerDef>;
  missionsById: Record<string, MissionDef>;
  gearById: Record<string, GearDef>;
  materialsById: Record<string, MaterialDef>;
  dungeonsById: Record<string, DungeonDef>;
  /** Chapters by id, stages by (chapter, index): the order they unlock in. */
  chapters: ChapterDef[];
  stages: StageDef[];
  /** Non-limited character ids by rarity, for gacha pools. */
  standardPool: Record<Rarity, string[]>;
}

const byId = <T extends { id: string | number }>(list: T[]) => Object.fromEntries(list.map((x) => [x.id, x]));

export function indexContent(bundle: ContentBundle): ContentIndex {
  const standardPool: Record<Rarity, string[]> = { 3: [], 4: [], 5: [] };
  for (const c of bundle.characters) if (!c.limited) standardPool[c.rarity].push(c.id);
  return {
    bundle,
    settings: bundle.settings,
    skillsById: byId(bundle.skills),
    charactersById: byId(bundle.characters),
    enemiesById: byId(bundle.enemies),
    chaptersById: byId(bundle.chapters),
    stagesById: byId(bundle.stages),
    bannersById: byId(bundle.banners),
    missionsById: byId(bundle.missions),
    gearById: byId(bundle.gear),
    materialsById: byId(bundle.materials),
    dungeonsById: byId(bundle.dungeons),
    chapters: [...bundle.chapters].sort((a, b) => a.id - b.id),
    stages: [...bundle.stages].sort((a, b) => a.chapter - b.chapter || a.index - b.index || a.id.localeCompare(b.id)),
    standardPool,
  };
}

/** Stages unlock in order: each needs the previous one cleared. */
export function isStageUnlocked(content: ContentIndex, stageId: string, cleared: Iterable<string>): boolean {
  const index = content.stages.findIndex((s) => s.id === stageId);
  if (index < 0) return false;
  if (index === 0) return true;
  return new Set(cleared).has(content.stages[index - 1]!.id);
}

/** Progress key for a stage's hard-mode clear. */
export const hardKey = (stageId: string) => `hard:${stageId}`;

/**
 * Hard mode opens a chapter once its normal stages are all cleared; inside it,
 * hard stages unlock in order (the first one of a chapter needs the previous
 * chapter's hard stages done).
 */
export function isHardUnlocked(content: ContentIndex, stageId: string, cleared: Iterable<string>): boolean {
  if (!content.settings.hardMode.enabled) return false;
  const done = new Set(cleared);
  const stage = content.stagesById[stageId];
  if (!stage) return false;
  if (!content.stages.filter((s) => s.chapter === stage.chapter).every((s) => done.has(s.id))) return false;
  const index = content.stages.findIndex((s) => s.id === stageId);
  return index === 0 || done.has(hardKey(content.stages[index - 1]!.id));
}

/** Dungeon progress key for a tier's first clear. */
export const dungeonKey = (dungeonId: string, tier: number) => `dungeon:${dungeonId}:${tier}`;

/** Whether a dungeon is open on the UTC weekday of `now`. */
export const isDungeonOpen = (d: DungeonDef, now: number) => d.days.includes(new Date(now).getUTCDay());

/** Tier 1 is always open; each later tier needs the one before it cleared. */
export const isDungeonTierUnlocked = (dungeonId: string, tier: number, cleared: Iterable<string>) =>
  tier === 0 || new Set(cleared).has(dungeonKey(dungeonId, tier - 1));

export function nextStage(content: ContentIndex, stageId: string): StageDef | undefined {
  return content.stages[content.stages.findIndex((s) => s.id === stageId) + 1];
}

export function chapterOf(content: ContentIndex, stageId: string): ChapterDef | undefined {
  const stage = content.stagesById[stageId];
  return stage ? content.chaptersById[stage.chapter] : undefined;
}

export function levelUpCost(settings: GameSettings, level: number): number {
  return settings.levelCostBase + settings.levelCostPerLevel * level;
}

/** How many of `wanted` level-ups the gold covers before the cap, and what they cost in total. */
export function bulkLevelUp(settings: GameSettings, level: number, cap: number, gold: number, wanted: number): { levels: number; cost: number } {
  let levels = 0;
  let cost = 0;
  while (levels < wanted && level + levels < cap) {
    const next = levelUpCost(settings, level + levels);
    if (cost + next > gold) break;
    cost += next;
    levels++;
  }
  return { levels, cost };
}

/** Usage of each skill id by units, for "used by" displays and safe deletes. */
export function skillUsage(content: ContentIndex, skillId: string): string[] {
  const users: string[] = [];
  const uses = (u: { basic: string; skill: string | null; ultimate: string | null }) =>
    u.basic === skillId || u.skill === skillId || u.ultimate === skillId;
  for (const c of content.bundle.characters) if (uses(c)) users.push(c.name);
  for (const e of content.bundle.enemies) if (uses(e)) users.push(e.name);
  return users;
}

/** Resolves a unit into the self-contained form the battle engine runs on. */
export function resolveUnit(
  content: ContentIndex,
  kind: 'character' | 'enemy',
  id: string,
  level: number,
  constellation = 0,
  gear: Pick<GearItem, 'main' | 'subs'>[] = [],
  progress: { ascension?: number; skillLevel?: number; ultLevel?: number } = {},
): UnitSpec {
  const prog = content.settings.progression;
  const def = kind === 'character' ? content.charactersById[id] : content.enemiesById[id];
  if (!def) throw new Error(`Unknown ${kind}: ${id}`);
  const basic = content.skillsById[def.basic];
  if (!basic) throw new Error(`${def.name} has an unknown basic skill: ${def.basic}`);
  const skill = def.skill ? content.skillsById[def.skill] : null;
  if (def.skill && !skill) throw new Error(`${def.name} has an unknown skill: ${def.skill}`);
  // A missing ultimate just means "none": it isn't required for the unit to work.
  const ultimate = def.ultimate ? (content.skillsById[def.ultimate] ?? null) : null;
  const spec: UnitSpec = {
    kind,
    id,
    name: def.name,
    emoji: def.emoji,
    sprite: def.sprite,
    element: def.element,
    role: def.role,
    boss: 'boss' in def ? def.boss : false,
    level,
    stats: applyGear(applyPassiveStats(scaleStats(def.base, level, constellation, ascensionBonus(prog, progress.ascension ?? 0)), def.passive), gear),
    combat: applyGearCombat(applyPassiveCombat(roleCombat(def.role), def.passive), gear),
    passive: def.passive ? structuredClone(def.passive) : null,
    // Copies, so editing content later can never reach into a battle in progress.
    basic: structuredClone(basic),
    skill: skill ? structuredClone(levelSkill(skill, progress.skillLevel ?? 1, prog.skillLevelBonus)) : null,
    ultimate: ultimate ? structuredClone(levelSkill(ultimate, progress.ultLevel ?? 1, prog.skillLevelBonus)) : null,
  };
  if ('mechanics' in def && def.mechanics) {
    const mechanics = resolveMechanics(content, def.mechanics, spec.stats.hp);
    if (mechanics) spec.mechanics = mechanics;
  }
  return spec;
}

/** Copies a boss's mechanics into battle form. Parts that reference missing content are dropped. */
function resolveMechanics(content: ContentIndex, m: EnemyMechanics, hp: number): UnitMechanics | null {
  const out: UnitMechanics = {};
  const chargeSkill = m.charge ? content.skillsById[m.charge.skill] : undefined;
  if (m.charge && chargeSkill) {
    out.charge = { skill: structuredClone(chargeSkill), every: m.charge.every, breakHp: Math.round(hp * m.charge.breakPct) };
  }
  if (m.enrage) out.enrage = { ...m.enrage };
  if (m.adds && content.enemiesById[m.adds.unit]) out.adds = { ...m.adds, at: [...m.adds.at].sort((a, b) => b - a) };
  return Object.keys(out).length ? out : null;
}

/** A team member as stored for a player: what's needed to resolve them for battle. */
export interface TeamMember {
  id: string;
  level: number;
  constellation: number;
  gear?: Pick<GearItem, 'main' | 'subs'>[];
  ascension?: number;
  skillLevel?: number;
  ultLevel?: number;
  /** A borrowed support hero: the lending friend's name. */
  friend?: string;
}

export const resolveTeam = (content: ContentIndex, team: TeamMember[]): UnitSpec[] =>
  team.map((t) => ({ ...resolveUnit(content, 'character', t.id, t.level, t.constellation, t.gear, t), ...(t.friend ? { friend: t.friend } : {}) }));

/** Enemy-side tweaks: hard mode adds levels and multiplies stats. */
export interface EncounterMods {
  levelBonus?: number;
  statMult?: number;
}

/** An enemy line-up: the first wave plus any that follow. */
export interface Encounter {
  enemies: EncounterEnemy[];
  waves?: EncounterEnemy[][];
}

function resolveEnemy(content: ContentIndex, id: string, level: number, mods: EncounterMods): UnitSpec {
  const spec = resolveUnit(content, 'enemy', id, level + (mods.levelBonus ?? 0));
  const m = mods.statMult ?? 1;
  if (m !== 1) {
    spec.stats = { ...spec.stats, hp: Math.round(spec.stats.hp * m), atk: Math.round(spec.stats.atk * m), def: Math.round(spec.stats.def * m) };
    // The break threshold follows the boss's HP.
    const charge = spec.mechanics?.charge;
    const pct = charge && content.enemiesById[id]?.mechanics?.charge?.breakPct;
    if (charge && pct) charge.breakHp = Math.round(spec.stats.hp * pct);
  }
  return spec;
}

/** Summoned units are minions: weaker than the same enemy placed in a stage. */
export const SUMMON_STAT_MULT = 0.6;

/** Every unit that summon effects on these units can call (and those can call, and so on). */
function summonPool(content: ContentIndex, units: UnitSpec[], mods: EncounterMods): Record<string, UnitSpec> {
  const pool: Record<string, UnitSpec> = {};
  const queue = [...units];
  while (queue.length) {
    const u = queue.shift()!;
    const callable = [u.basic, u.skill, u.ultimate, u.mechanics?.charge?.skill]
      .flatMap((s) => s?.effects ?? [])
      .flatMap((e) => (e.kind === 'summon' ? [e.unit] : []));
    if (u.mechanics?.adds) callable.push(u.mechanics.adds.unit);
    for (const unit of callable) {
      if (!content.enemiesById[unit]) continue;
      const key = summonKey(unit, u.level);
      if (pool[key]) continue;
      // The level already includes any bonus, so don't add it twice.
      const spec = resolveEnemy(content, unit, u.level, { statMult: (mods.statMult ?? 1) * SUMMON_STAT_MULT });
      pool[key] = spec;
      queue.push(spec);
    }
  }
  return pool;
}

/** Snapshots everything a battle needs, so later content edits can't change it. */
export function buildEncounterSetup(content: ContentIndex, seed: number, team: TeamMember[], encounter: Encounter, mods: EncounterMods = {}): BattleSetup {
  const enemies = encounter.enemies.map((e) => resolveEnemy(content, e.id, e.level, mods));
  const waves = (encounter.waves ?? []).filter((w) => w.length).map((w) => w.map((e) => resolveEnemy(content, e.id, e.level, mods)));
  const setup: BattleSetup = { seed, allies: resolveTeam(content, team), enemies };
  if (waves.length) setup.waves = waves;
  const summons = summonPool(content, [...enemies, ...waves.flat()], mods);
  if (Object.keys(summons).length) setup.summons = summons;
  return setup;
}

/** A campaign stage, optionally on hard mode. */
export function buildBattleSetup(content: ContentIndex, seed: number, team: TeamMember[], stage: StageDef, hard = false): BattleSetup {
  const h = content.settings.hardMode;
  const mult = stage.statMult ?? 1;
  return buildEncounterSetup(content, seed, team, stage, hard ? { levelBonus: h.levelBonus, statMult: h.statMult * mult } : { statMult: mult });
}

/** PvP: the defender's heroes fight on the enemy side, controlled by the AI. */
export function buildArenaSetup(content: ContentIndex, seed: number, attacker: TeamMember[], defender: TeamMember[]): BattleSetup {
  return { seed, allies: resolveTeam(content, attacker), enemies: resolveTeam(content, defender) };
}
