import { describe, expect, it } from 'vitest';
import { GEAR_RULES, perfectSubValue, reforgeOptions, reforgeSub, subQuality, subRolls, type GearItem } from './gear';
import { seededRandom } from './rng';

const item = (): Pick<GearItem, 'main' | 'subs' | 'rarity'> => ({
  rarity: 5,
  main: { stat: 'atk', value: 50 },
  subs: [
    { stat: 'hp', value: 200, rolls: 2 },
    { stat: 'def', value: 12, rolls: 1 },
  ],
});

describe('gear reforging', () => {
  it('rerolls a substat into a different stat that is not already on the item, keeping its rolls', () => {
    const rng = seededRandom(3);
    for (let i = 0; i < 50; i++) {
      const next = reforgeSub(item(), 0, rng);
      const sub = next.subs[0]!;
      expect(sub.stat).not.toBe('hp');
      expect(['atk', 'def']).not.toContain(sub.stat);
      expect(sub.rolls).toBe(2);
      // Two rolls, each within the stat's range for a ★5.
      const [min, max] = GEAR_RULES.subRanges[sub.stat];
      expect(sub.value).toBeGreaterThanOrEqual(Math.floor(min * 1.25 * 2 * 0.999));
      expect(sub.value).toBeLessThanOrEqual(Math.ceil(max * 1.25 * 2 * 1.001 * 1000) / 1000);
      expect(next.subs[1]).toEqual(item().subs[1]);
    }
  });

  it('rates a substat against the best value for its rolls', () => {
    expect(subQuality({ stat: 'spd', value: perfectSubValue('spd', 5, 1), rolls: 1 }, 5)).toBe(1);
    expect(subQuality({ stat: 'spd', value: perfectSubValue('spd', 5, 1) / 2, rolls: 1 }, 5)).toBeCloseTo(0.5, 1);
  });

  it('only offers stats that are not the main stat or another substat', () => {
    expect(reforgeOptions(item(), 0).sort()).toEqual(['atkPct', 'critDmg', 'critRate', 'defPct', 'effectHit', 'effectRes', 'hp', 'hpPct', 'spd'].sort());
  });

  it('estimates the roll count of older substats from their value', () => {
    const avg = ((GEAR_RULES.subRanges.atk[0] + GEAR_RULES.subRanges.atk[1]) / 2) * GEAR_RULES.rarityMult[4];
    expect(subRolls({ stat: 'atk', value: Math.round(avg * 3) }, 4)).toBe(3);
    expect(subRolls({ stat: 'atk', value: 1 }, 4)).toBe(1);
  });
});

describe('random main stats', () => {
  it('rolls each drop a main stat from its slot pool, varying from drop to drop', async () => {
    const { createDefaultContent } = await import('./content/defaults');
    const { MAIN_POOLS, rollGear } = await import('./gear');
    const rng = seededRandom(5);
    for (const t of createDefaultContent().gear) {
      expect(t.mainStat).toBeNull();
      const seen = new Set<string>();
      for (let i = 0; i < 60; i++) {
        const item = rollGear(t, rng, []);
        expect(MAIN_POOLS[t.slot]).toContain(item.main.stat);
        expect(item.main.value).toBeGreaterThan(0);
        expect(item.subs.map((s) => s.stat)).not.toContain(item.main.stat);
        seen.add(item.main.stat);
      }
      expect(seen.size).toBeGreaterThan(1);
      if (t.slot !== 'boots') expect(seen.has('spd')).toBe(false);
    }
  });

  it('still honours a fixed main stat on a template', async () => {
    const { rollGear } = await import('./gear');
    const item = rollGear(
      { id: 'x', name: 'X', emoji: '⚔️', slot: 'weapon', rarity: 4, mainStat: 'critDmg', mainBase: 0.2, icon: null, set: null },
      seededRandom(1),
      [],
    );
    expect(item.main).toEqual({ stat: 'critDmg', value: 0.2 });
  });

  it('switches default templates still on their old fixed main to random', async () => {
    const { createDefaultContent } = await import('./content/defaults');
    const { upgradeContent } = await import('./content/upgrade');
    const b = createDefaultContent();
    Object.assign(
      b.gear.find((g) => g.id === 'runed-saber')!,
      { mainStat: 'atk', mainBase: 28 },
    );
    Object.assign(
      b.gear.find((g) => g.id === 'knight-mail')!,
      { mainStat: 'hp', mainBase: 250 },
    ); // an admin edit
    const { bundle } = upgradeContent(b, 15);
    expect(bundle.gear.find((g) => g.id === 'runed-saber')!.mainStat).toBeNull();
    expect(bundle.gear.find((g) => g.id === 'knight-mail')).toMatchObject({ mainStat: 'hp', mainBase: 250 });
  });
});
