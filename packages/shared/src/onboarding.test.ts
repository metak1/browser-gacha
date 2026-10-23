import { describe, expect, it } from 'vitest';
import { indexContent } from './content';
import { createDefaultContent } from './content/defaults';
import { firstSummonFree, GUIDE_FLAGS, guideStep } from './onboarding';

const content = indexContent(createDefaultContent());
const starters = content.settings.starterCharacters.map((id) => ({ id }));
const fresh = { flags: [] as string[], clearedStages: [] as string[], roster: starters, banners: {} };

describe('guided tutorial', () => {
  it('walks welcome → summon → battle → level up → finish', () => {
    expect(guideStep(content, fresh)).toBe('welcome');
    const welcomed = { ...fresh, flags: [GUIDE_FLAGS.welcome] };
    expect(guideStep(content, welcomed)).toBe('summon');
    const pulled = { ...welcomed, flags: [...welcomed.flags, GUIDE_FLAGS.firstSummon], roster: [{ id: 'pebble' }] };
    expect(guideStep(content, pulled)).toBe('battle');
    const won = { ...pulled, clearedStages: [content.stages[0]!.id] };
    expect(guideStep(content, won)).toBe('levelUp');
    const leveled = { ...won, flags: [...won.flags, GUIDE_FLAGS.levelUp] };
    expect(guideStep(content, leveled)).toBe('finish');
    expect(guideStep(content, { ...leveled, flags: [...leveled.flags, GUIDE_FLAGS.done] })).toBeNull();
  });

  it('starts new players without heroes', () => {
    expect(content.settings.starterCharacters).toEqual([]);
  });

  it('can be skipped at any point', () => {
    expect(guideStep(content, { ...fresh, flags: [GUIDE_FLAGS.done] })).toBeNull();
  });

  it('is not shown to accounts that were already playing', () => {
    expect(guideStep(content, { ...fresh, clearedStages: ['1-1', '1-2'] })).toBeNull();
    expect(guideStep(content, { ...fresh, banners: { standard: { pity5: 3, pity4: 3 } } })).toBeNull();
  });

  it('offers the free first 10× until it is used', () => {
    expect(firstSummonFree(content, [])).toBe(true);
    expect(firstSummonFree(content, [GUIDE_FLAGS.firstSummon])).toBe(false);
  });
});
