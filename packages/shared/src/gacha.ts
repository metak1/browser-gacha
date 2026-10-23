import type { ContentIndex } from './content';
import type { BannerDef, GachaRules } from './content/types';
import type { Rarity } from './types';

export interface BannerState {
  pity5: number;
  pity4: number;
  guaranteed5: boolean;
  guaranteed4: boolean;
}

export interface PullResult {
  id: string;
  rarity: Rarity;
  featured: boolean;
  lostFiftyFifty: boolean;
  /** Pulls it took to hit this rarity (null for ★3). */
  pity: number | null;
}

export function newBannerState(): BannerState {
  return { pity5: 0, pity4: 0, guaranteed5: false, guaranteed4: false };
}

export function rate5(pull: number, r: GachaRules): number {
  if (pull >= r.hardPity5) return 1;
  return Math.min(1, r.base5 + Math.max(0, pull - r.softPity5 + 1) * r.softStep5);
}

export function rate4(pull: number, r: GachaRules): number {
  if (pull >= r.hardPity4) return 1;
  return Math.min(1, r.base4 + Math.max(0, pull - r.softPity4 + 1) * r.softStep4);
}

function pick<T>(list: readonly T[], rng: () => number): T {
  return list[Math.floor(rng() * list.length)]!;
}

function pickCharacter(bs: BannerState, banner: BannerDef, content: ContentIndex, rarity: 4 | 5, rng: () => number) {
  const featured = rarity === 5 ? (banner.featured5 ? [banner.featured5] : []) : banner.featured4;
  const pool = content.standardPool[rarity].filter((id) => !featured.includes(id));
  if (!featured.length) return { id: pick(pool, rng), featured: false, lostFiftyFifty: false };

  const key = rarity === 5 ? 'guaranteed5' : 'guaranteed4';
  // With nothing else in the pool, the featured unit is the only possible result.
  if (bs[key] || !pool.length || rng() < 0.5) {
    bs[key] = false;
    return { id: pick(featured, rng), featured: true, lostFiftyFifty: false };
  }
  bs[key] = true;
  return { id: pick(pool, rng), featured: false, lostFiftyFifty: true };
}

/** Rolls one pull, mutating the banner's pity state. */
export function rollPull(bs: BannerState, banner: BannerDef, content: ContentIndex, rng: () => number): PullResult {
  const rules = content.settings.gacha;
  bs.pity5++;
  bs.pity4++;
  if (rng() < rate5(bs.pity5, rules)) {
    const pity = bs.pity5;
    bs.pity5 = 0;
    // ★4 pity is left alone: if it was also due, it carries over to the next pull.
    return { ...pickCharacter(bs, banner, content, 5, rng), rarity: 5, pity };
  }
  if (rng() < rate4(bs.pity4, rules)) {
    const pity = bs.pity4;
    bs.pity4 = 0;
    return { ...pickCharacter(bs, banner, content, 4, rng), rarity: 4, pity };
  }
  return { id: pick(content.standardPool[3], rng), rarity: 3, featured: false, lostFiftyFifty: false, pity: null };
}
