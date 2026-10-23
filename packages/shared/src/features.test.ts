import { describe, expect, it } from 'vitest';
import { eloDelta, tierFor, weekKey } from './arena';
import { autoBattle, replayBattle } from './battle/replay';
import { act, currentActor, ENERGY, startBattle, validateAction } from './battle/engine';
import { chooseAction } from './battle/ai';
import { buildArenaSetup, buildBattleSetup, indexContent } from './content';
import { createDefaultContent } from './content/defaults';
import { validateBundle } from './content/validate';
import { bundleSchema } from './content/schemas';
import { applyGear, GEAR_RULES, rollGear, upgradeGear } from './gear';
import { seededRandom } from './rng';

const content = indexContent(createDefaultContent());
const team = (ids: string[], level = 5) => ids.map((id) => ({ id, level, constellation: 0 }));

describe('ultimates', () => {
  it('every default hero and boss has a valid ultimate', () => {
    expect(content.bundle.characters.every((c) => c.ultimate && content.skillsById[c.ultimate])).toBe(true);
    expect(content.bundle.enemies.filter((e) => e.boss).every((e) => e.ultimate)).toBe(true);
  });

  it('needs full energy, and the AI fires it when ready', () => {
    const setup = buildBattleSetup(content, 4, team(['ignis', 'gaia']), content.stagesById['1-3']!);
    const { state } = startBattle(setup);
    while (currentActor(state)!.side !== 'ally') act(state, chooseAction(state));
    const actor = currentActor(state)!;
    expect(validateAction(state, { kind: 'ultimate' })).toMatch(/full energy/);
    actor.energy = ENERGY.max;
    expect(chooseAction(state).kind).toBe('ultimate');
    act(state, chooseAction(state));
    expect(actor.energy).toBe(0);
  });

  it('battles with ultimates still replay exactly', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const setup = buildBattleSetup(content, seed, team(['ignis', 'marina', 'zephyr', 'gaia'], 20), content.stagesById['3-4']!);
      const played = autoBattle(setup);
      expect(played.actions.some((a) => a.kind === 'ultimate')).toBe(true);
      expect(replayBattle(setup, played.actions).state).toEqual(played.state);
    }
  });
});

describe('gear', () => {
  const rng = seededRandom(9);
  const template = content.gearById['starforged-edge']!;

  it('rolls substats by rarity and never duplicates the main stat', () => {
    const item = rollGear(template, rng);
    expect(item.subs).toHaveLength(GEAR_RULES.substatsAtDrop[5]);
    const stats = [item.main.stat, ...item.subs.map((s) => s.stat)];
    expect(new Set(stats).size).toBe(stats.length);
  });

  it('upgrades grow the main stat and add substats every few levels', () => {
    let item = rollGear(content.gearById['bronze-blade']!, rng);
    const startMain = item.main.value;
    for (let i = 0; i < 12; i++) item = upgradeGear(item, rng);
    expect(item.level).toBe(12);
    expect(item.main.value).toBeCloseTo(startMain * (1 + GEAR_RULES.mainGrowth * 12), 0);
    expect(item.subs.length).toBe(GEAR_RULES.maxSubs);
  });

  it('applies flat and percent bonuses', () => {
    const stats = applyGear({ hp: 1000, atk: 100, def: 50, spd: 100 }, [
      { main: { stat: 'atk', value: 20 }, subs: [{ stat: 'atkPct', value: 0.1 }, { stat: 'spd', value: 5 }] },
    ]);
    expect(stats).toEqual({ hp: 1000, atk: 130, def: 50, spd: 105 });
  });

  it('gear flows into battle stats', () => {
    const item = rollGear(template, rng);
    const plain = buildBattleSetup(content, 1, team(['ignis']), content.stagesById['1-1']!);
    const geared = buildBattleSetup(content, 1, [{ id: 'ignis', level: 5, constellation: 0, gear: [item] }], content.stagesById['1-1']!);
    expect(geared.allies[0]!.stats.atk).toBeGreaterThan(plain.allies[0]!.stats.atk);
  });
});

describe('arena', () => {
  it('elo rewards upsets more than expected wins', () => {
    expect(eloDelta(1000, 1000, 1, 32)).toBe(16);
    expect(eloDelta(1000, 1400, 1, 32)).toBeGreaterThan(eloDelta(1400, 1000, 1, 32));
    expect(eloDelta(1000, 1000, 0, 32)).toBe(-16);
  });

  it('picks tiers and week keys', () => {
    const tiers = content.settings.arenaTiers;
    expect(tierFor(0, tiers).name).toBe('Bronze');
    expect(tierFor(1260, tiers).name).toBe('Gold');
    expect(weekKey(Date.UTC(2026, 9, 20))).toBe('2026-W43');
    expect(weekKey(Date.UTC(2027, 0, 1))).toBe('2026-W53');
  });

  it('builds PvP setups with heroes on both sides', () => {
    const setup = buildArenaSetup(content, 3, team(['ignis', 'gaia']), team(['marina', 'yuki']));
    expect(setup.enemies.map((e) => e.kind)).toEqual(['character', 'character']);
    expect(autoBattle(setup).state.outcome).not.toBe('ongoing');
  });
});

describe('content upgrades', () => {
  it('old content without the new fields still parses', () => {
    const old = createDefaultContent() as unknown as Record<string, unknown>;
    delete old.gear;
    for (const c of old.characters as Record<string, unknown>[]) delete c.ultimate;
    for (const s of old.stages as Record<string, unknown>[]) delete s.drops;
    const settings = old.settings as Record<string, unknown>;
    delete settings.arenaTiers;
    delete settings.gearMaxLevel;
    const parsed = bundleSchema.parse(old);
    expect(parsed.gear).toEqual([]);
    expect(parsed.characters[0]!.ultimate).toBeNull();
    expect(parsed.settings.arenaTiers.length).toBeGreaterThan(0);
    expect(validateBundle(parsed)).toEqual([]);
  });
});
