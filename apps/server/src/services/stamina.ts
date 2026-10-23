import { staminaAt, type StaminaState } from '@gacha/shared';
import { badRequest } from '../errors';
import type { ServiceContext } from './context';

/** Stamina caps out here even with refills, so it can't be hoarded forever. */
const HARD_CAP = 9999;

function settle(ctx: ServiceContext, userId: string) {
  const { value, at } = ctx.users.stamina(userId);
  return staminaAt(ctx.content.current.settings.stamina, value, at, ctx.now());
}

export function readStamina(ctx: ServiceContext, userId: string): StaminaState {
  const { current, max, nextAt } = settle(ctx, userId);
  return { current, max, nextAt };
}

/** Takes stamina or throws. Call inside the transaction that uses it. */
export function spendStamina(ctx: ServiceContext, userId: string, amount: number) {
  if (amount <= 0) return;
  const s = settle(ctx, userId);
  if (s.current < amount) {
    throw badRequest('no_stamina', `Not enough stamina (${s.current}/${amount}). It refills over time, or refill it with gems.`);
  }
  // Regeneration starts counting from now if we were at or above max.
  ctx.users.setStamina(userId, s.current - amount, s.current >= s.max ? ctx.now() : s.settledAt);
}

export function addStamina(ctx: ServiceContext, userId: string, amount: number) {
  if (amount <= 0) return;
  const s = settle(ctx, userId);
  ctx.users.setStamina(userId, Math.min(HARD_CAP, s.current + amount), s.current >= s.max ? ctx.now() : s.settledAt);
}

/** Buys a refill with gems. */
export function refillStamina(ctx: ServiceContext, userId: string) {
  const { refillGems, refillAmount } = ctx.content.current.settings.stamina;
  ctx.db.transaction(() => {
    const user = ctx.users.findById(userId);
    if (!user || user.wallet.gems < refillGems) throw badRequest('not_enough_gems', `A refill costs ${refillGems} gems`);
    ctx.users.adjustWallet(userId, { gems: -refillGems });
    addStamina(ctx, userId, refillAmount);
  });
}
