import type { MaterialStack, Reward } from '@gacha/shared';
import type { ServiceContext } from './context';

/**
 * Pays a reward (currencies + materials). Materials no longer in content are
 * skipped rather than stored. Call inside the transaction that earns it.
 */
export function grantReward(ctx: ServiceContext, userId: string, reward: Partial<Reward>) {
  ctx.users.adjustWallet(userId, { gems: reward.gems ?? 0, gold: reward.gold ?? 0, stardust: reward.stardust ?? 0 });
  grantMaterials(ctx, userId, reward.materials ?? []);
}

export function grantMaterials(ctx: ServiceContext, userId: string, stacks: MaterialStack[]) {
  const known = ctx.content.current.materialsById;
  for (const m of stacks) if (known[m.id]) ctx.materials.add(userId, m.id, m.count);
}
