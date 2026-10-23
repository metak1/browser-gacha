import { weekKey } from './arena';
import type { EventDef, GameSettings, GuildBossDef, PlayerLevelSettings } from './content/types';

// ---------- player level ----------

export const xpToNext = (p: PlayerLevelSettings, level: number) => p.xpBase + p.xpPerLevel * (level - 1);

/** Account level from total XP, and progress through the current level. */
export function playerLevel(p: PlayerLevelSettings, xp: number): { level: number; into: number; need: number } {
  let level = 1;
  let left = Math.max(0, xp);
  while (level < p.maxLevel && left >= xpToNext(p, level)) {
    left -= xpToNext(p, level);
    level++;
  }
  return { level, into: level >= p.maxLevel ? 0 : left, need: level >= p.maxLevel ? 0 : xpToNext(p, level) };
}

/**
 * Titles a player can wear: level milestones plus the names of one-time
 * missions they have claimed (e.g. "Storm Breaker").
 */
export function unlockedTitles(settings: GameSettings, level: number, claimedOnceMissions: string[]): string[] {
  const fromLevel = settings.playerLevel.titles.filter((t) => level >= t.level).map((t) => t.title);
  return [...new Set([...fromLevel, ...claimedOnceMissions])];
}

// ---------- friends ----------

/** A short, shareable code for a player (from their id). */
export const friendCode = (userId: string) => userId.replace(/-/g, '').slice(0, 10).toUpperCase();

/** Display name for a player without a username. */
export const guestName = (userId: string) => `Guest-${friendCode(userId).slice(0, 4)}`;

// ---------- events ----------

export const utcDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const isEventActive = (e: EventDef, now: number) => {
  const today = utcDate(now);
  return today >= e.start && today <= e.end;
};

/** Days left including today (0 when over). */
export function eventDaysLeft(e: EventDef, now: number): number {
  const end = Date.parse(`${e.end}T23:59:59Z`);
  return Math.max(0, Math.ceil((end - now) / 86_400_000));
}

/** Progress key for an event stage clear. */
export const eventKey = (eventId: string, stage: number) => `event:${eventId}:${stage}`;

// ---------- guilds ----------

/** This week's guild boss (bosses rotate weekly) and its HP pool for a guild of this size. */
export function guildBoss(settings: GameSettings, now: number, members: number): { boss: GuildBossDef; week: string; pool: number } {
  const week = weekKey(now);
  const bosses = settings.guild.bosses;
  // Week index since the Unix epoch's first Monday, so the rotation is stable.
  const index = Math.floor((now / 86_400_000 + 3) / 7);
  const boss = bosses[((index % bosses.length) + bosses.length) % bosses.length]!;
  return { boss, week, pool: boss.hpPerMember * Math.max(3, members) };
}
