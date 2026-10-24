import {
  chapterOf,
  staminaCost,
  towerFloor,
  type ContentIndex,
  type DungeonDef,
  type EncounterEnemy,
  type EventDef,
  type SceneTheme,
  type StageDef,
  type StartBattleResponse,
} from '@gacha/shared';
import { api } from '../api';
import { dungeonsPath } from './Dungeons';

/** Where a battle comes from: a campaign stage (maybe on hard), an arena opponent, a dungeon tier, and so on. */
export type BattleSource =
  | { kind: 'campaign'; stage: StageDef; hard: boolean; friendId?: string }
  | { kind: 'arena'; opponentId: string; opponentName: string }
  | { kind: 'dungeon'; dungeon: DungeonDef; tier: number }
  | { kind: 'event'; event: EventDef; stage: number; friendId?: string }
  | { kind: 'guild'; boss: string }
  | { kind: 'tower'; floor: number };

// Everything that depends on a battle's mode, one exhaustive switch each, so adding a mode is
// a type error until every question is answered.

/** The landscape the fight takes place in. */
export function battleTheme(source: BattleSource, content: ContentIndex): SceneTheme {
  switch (source.kind) {
    case 'campaign':
      return chapterOf(content, source.stage.id)?.theme ?? 'meadow';
    case 'arena':
      return 'kingdom';
    case 'guild':
      return 'cosmos';
    case 'dungeon':
      return source.dungeon.theme;
    case 'event':
      return source.event.theme;
    case 'tower':
      return towerFloor(content, source.floor).theme;
  }
}

/** The page the battle was started from, to go back (or minimize) to. */
export function battleExit(source: BattleSource): string {
  switch (source.kind) {
    case 'campaign':
      return '/campaign';
    case 'arena':
      return '/arena';
    case 'guild':
      return '/social?tab=guild';
    case 'dungeon':
      return dungeonsPath(source.dungeon);
    case 'event':
      return '/events';
    case 'tower':
      return '/tower';
  }
}

/** Asks the server to start the battle. */
export function startBattle(source: BattleSource): Promise<StartBattleResponse> {
  switch (source.kind) {
    case 'campaign':
      return api.startBattle(source.stage.id, source.hard, source.friendId);
    case 'arena':
      return api.arena.start(source.opponentId);
    case 'guild':
      return api.guild.attack();
    case 'dungeon':
      return api.startDungeon(source.dungeon.id, source.tier);
    case 'event':
      return api.startEvent(source.event.id, source.stage, source.friendId);
    case 'tower':
      return api.startTower(source.floor);
  }
}

/** Every enemy the fight can bring, waves included (to pick the boss music). Empty when unknown up front. */
export function battleLineup(source: BattleSource, content: ContentIndex): EncounterEnemy[] {
  const all = (e: { enemies: EncounterEnemy[]; waves: EncounterEnemy[][] }) => [...e.enemies, ...e.waves.flat()];
  switch (source.kind) {
    case 'campaign':
      return all(source.stage);
    case 'dungeon':
      return all(source.dungeon.tiers[source.tier]!);
    case 'event':
      return all(source.event.stages[source.stage]!);
    case 'tower':
      return towerFloor(content, source.floor).encounter.enemies;
    case 'arena':
    case 'guild':
      return [];
  }
}

/**
 * Stamina to fight it again, for repeat and continue modes; null when it can't be queued (the
 * arena needs a new opponent, guild attacks are limited). The tower is free.
 */
export function repeatCost(source: BattleSource, content: ContentIndex): number | null {
  switch (source.kind) {
    case 'campaign':
      return staminaCost(content.settings.stamina, source.hard);
    case 'event':
      return staminaCost(content.settings.stamina, false);
    case 'dungeon':
      return source.dungeon.tiers[source.tier]?.stamina ?? 0;
    case 'tower':
      return 0;
    case 'arena':
    case 'guild':
      return null;
  }
}

/** One line naming the fight, for the result card. `best` is the tower's best floor after a win. */
export function battleTitle(source: BattleSource, best?: number): string {
  switch (source.kind) {
    case 'campaign':
      return `${source.stage.id} · ${source.stage.name}${source.hard ? ' (Hard)' : ''}`;
    case 'dungeon':
      return `${source.dungeon.name} · ${source.dungeon.tiers[source.tier]!.name}`;
    case 'event':
      return `${source.event.name} · ${source.event.stages[source.stage]!.name}`;
    case 'guild':
      return 'Guild boss attack';
    case 'tower':
      return `Endless Tower · Floor ${source.floor}${best ? ` · best ${best}` : ''}`;
    case 'arena':
      return `Arena vs ${source.opponentName}`;
  }
}
