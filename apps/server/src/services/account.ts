import { guestName, playerLevel, unlockedTitles, type XpGainDTO } from '@gacha/shared';
import type { ServiceContext } from './context';
import { addStamina } from './stamina';

/** A player's public name: their username, or a stable guest name. */
export function displayName(ctx: ServiceContext, userId: string): string {
  return ctx.users.findById(userId)?.username ?? guestName(userId);
}

export function levelOf(ctx: ServiceContext, userId: string): number {
  return playerLevel(ctx.content.current.settings.playerLevel, ctx.users.account(userId).xp).level;
}

/** Names of one-time missions the player has claimed (they double as titles). */
function claimedOnceMissionNames(ctx: ServiceContext, userId: string): string[] {
  const byId = ctx.content.current.missionsById;
  return ctx.missions
    .forUser(userId)
    .filter((r) => r.claimed && r.period === '' && byId[r.missionId]?.repeat === 'once')
    .map((r) => byId[r.missionId]!.name);
}

export function titlesFor(ctx: ServiceContext, userId: string): string[] {
  return unlockedTitles(ctx.content.current.settings, levelOf(ctx, userId), claimedOnceMissionNames(ctx, userId));
}

/** The title a player wears, if it's still one they've unlocked. */
export function activeTitle(ctx: ServiceContext, userId: string): string | null {
  const t = ctx.users.account(userId).title;
  return t && titlesFor(ctx, userId).includes(t) ? t : null;
}

/**
 * Adds account XP and pays any level ups (gems and stamina). Call inside the
 * transaction that earned it. Returns null for no XP.
 */
export function grantXp(ctx: ServiceContext, userId: string, amount: number): XpGainDTO | null {
  if (amount <= 0) return null;
  const p = ctx.content.current.settings.playerLevel;
  const xp = ctx.users.account(userId).xp;
  const before = playerLevel(p, xp).level;
  ctx.users.setXp(userId, xp + amount);
  const after = playerLevel(p, xp + amount).level;
  const levelsGained = after - before;
  const reward = { gems: levelsGained * p.rewardGems, stamina: levelsGained * p.rewardStamina };
  if (levelsGained > 0) {
    ctx.users.adjustWallet(userId, { gems: reward.gems });
    addStamina(ctx, userId, reward.stamina);
  }
  return { gained: amount, level: after, levelsGained, reward };
}
