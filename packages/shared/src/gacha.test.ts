import { describe, expect, it } from 'vitest';
import { indexContent } from './content';
import { createDefaultContent } from './content/defaults';
import { newBannerState, rate4, rate5, rollPull, type PullResult } from './gacha';
import { seededRandom } from './rng';

const content = indexContent(createDefaultContent());
const rules = content.settings.gacha;

function simulate(bannerId: string, pulls: number, seed: number): PullResult[] {
  const rng = seededRandom(seed);
  const bs = newBannerState();
  const banner = content.bannersById[bannerId]!;
  return Array.from({ length: pulls }, () => rollPull(bs, banner, content, rng));
}

describe('gacha', () => {
  it('rate curves reach hard pity', () => {
    expect(rate5(1, rules)).toBe(0.006);
    expect(rate5(89, rules)).toBeLessThan(1);
    expect(rate5(90, rules)).toBe(1);
    expect(rate4(10, rules)).toBe(1);
  });

  it('limited banner honours rates, pity and the 50/50', () => {
    const all = simulate('thunder', 300_000, 42);
    const fives = all.filter((r) => r.rarity === 5);
    const rate = fives.length / all.length;
    expect(rate).toBeGreaterThan(0.014);
    expect(rate).toBeLessThan(0.018);

    let gap5 = 0;
    let gap4 = 0;
    let lostStreak = 0;
    for (const r of all) {
      gap5 = r.rarity === 5 ? 0 : gap5 + 1;
      gap4 = r.rarity >= 4 ? 0 : gap4 + 1;
      expect(gap5).toBeLessThan(90);
      expect(gap4).toBeLessThan(10);
      if (r.rarity === 5) {
        lostStreak = r.lostFiftyFifty ? lostStreak + 1 : 0;
        expect(lostStreak).toBeLessThanOrEqual(1);
      }
    }

    const featuredShare = fives.filter((r) => r.featured).length / fives.length;
    expect(featuredShare).toBeGreaterThan(0.62);
    expect(featuredShare).toBeLessThan(0.71);
    expect(fives.every((r) => r.featured === (r.id === 'raijin'))).toBe(true);
  });

  it('standard banner never drops limited characters', () => {
    expect(simulate('standard', 50_000, 7).some((r) => r.id === 'raijin')).toBe(false);
  });
});
