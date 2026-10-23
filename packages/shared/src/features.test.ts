import { describe, expect, it } from 'vitest';
import { eloDelta, tierFor, weekKey } from './arena';
import { autoBattle, replayBattle } from './battle/replay';
import { act, currentActor, ENERGY, startBattle, validateAction } from './battle/engine';
import { chooseAction } from './battle/ai';
import { buildArenaSetup, buildBattleSetup, indexContent } from './content';
import { createDefaultContent } from './content/defaults';
import { towerFloor, trialEntrants } from './tower';
import { validateBundle } from './content/validate';
import { bundleSchema } from './content/schemas';
import { applyGear, applyGearCombat, bestLoadout, GEAR_RULES, rollGear, upgradeGear, wornSets, type GearItem } from './gear';
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
    const item = rollGear(template, rng, content.bundle.gearSets);
    expect(item.subs).toHaveLength(GEAR_RULES.substatsAtDrop[5]);
    const stats = [item.main.stat, ...item.subs.map((s) => s.stat)];
    expect(new Set(stats).size).toBe(stats.length);
  });

  it('upgrades grow the main stat and add substats every few levels', () => {
    let item = rollGear(content.gearById['bronze-blade']!, rng, content.bundle.gearSets);
    const startMain = item.main.value;
    for (let i = 0; i < 12; i++) item = upgradeGear(item, rng);
    expect(item.level).toBe(12);
    expect(item.main.value).toBeCloseTo(startMain * (1 + GEAR_RULES.mainGrowth * 12), 0);
    expect(item.subs.length).toBe(GEAR_RULES.maxSubs);
  });

  it('applies flat and percent bonuses', () => {
    const stats = applyGear({ hp: 1000, atk: 100, def: 50, spd: 100 }, [
      { main: { stat: 'atk', value: 20 }, subs: [{ stat: 'atkPct', value: 0.1 }, { stat: 'spd', value: 5 }], set: null },
    ], {});
    expect(stats).toEqual({ hp: 1000, atk: 130, def: 50, spd: 105 });
  });

  it('rolls a set on every drop, unless the template fixes one', () => {
    const own = seededRandom(3);
    const ids = content.bundle.gearSets.map((s) => s.id);
    const seen = new Set<string | null>();
    for (let i = 0; i < 60; i++) seen.add(rollGear(template, own, content.bundle.gearSets).set);
    expect([...seen].every((s) => s !== null && ids.includes(s))).toBe(true);
    expect(seen.size).toBeGreaterThan(1);
    expect(rollGear({ ...template, set: 'precision' }, own, content.bundle.gearSets).set).toBe('precision');
  });

  it('adds set bonuses for enough pieces of a set, stacking the 2- and 4-piece bonuses', () => {
    const sets = content.gearSetsById;
    const piece = (set: string | null) => ({ main: { stat: 'hp' as const, value: 0 }, subs: [], set });
    const base = { critRate: 0.05, critDmg: 0.5, effectHit: 0, effectRes: 0 };
    expect(applyGearCombat(base, [piece('precision')], sets).critRate).toBeCloseTo(0.05);
    expect(applyGearCombat(base, [piece('precision'), piece('precision')], sets).critRate).toBeCloseTo(0.11);
    expect(applyGearCombat(base, [piece('precision'), piece('precision'), piece('precision'), piece('precision')], sets).critRate).toBeCloseTo(0.23);
    // Two 2-piece sets at once.
    const stats = applyGear({ hp: 1000, atk: 100, def: 50, spd: 100 }, [piece('fury'), piece('fury'), piece('gale'), piece('gale')], sets);
    expect(stats).toEqual({ hp: 1000, atk: 108, def: 50, spd: 105 });
    expect(wornSets([piece('fury'), piece('fury'), piece(null)], sets)).toEqual([
      { set: sets.fury, pieces: 2, bonuses: [{ ...sets.fury!.bonuses[0]!, active: true }, { ...sets.fury!.bonuses[1]!, active: false }] },
    ]);
  });

  it('auto-equip completes a set when the bonus outweighs a stronger single piece', () => {
    const sets = content.gearSetsById;
    const item = (id: string, slot: GearItem['slot'], set: string, atk: number): GearItem => ({
      id, templateId: 'x', slot, rarity: 4, level: 0, mainBase: 0, main: { stat: 'atk', value: atk }, subs: [], equippedTo: null, set,
    });
    const bag = [
      item('w', 'weapon', 'fury', 10), item('a', 'armor', 'fury', 10), item('c', 'charm', 'fury', 10),
      item('b-fury', 'boots', 'fury', 10), item('b-big', 'boots', 'gale', 14),
    ];
    const best = bestLoadout({ hp: 1000, atk: 400, def: 50, spd: 100 }, bag, 'hero', sets);
    expect(best.map((s) => s.best?.id)).toEqual(['w', 'a', 'c', 'b-fury']);
  });

  it('gear flows into battle stats', () => {
    const item = rollGear(template, rng, content.bundle.gearSets);
    const plain = buildBattleSetup(content, 1, team(['ignis']), content.stagesById['1-1']!);
    const geared = buildBattleSetup(content, 1, [{ id: 'ignis', level: 5, constellation: 0, gear: [item] }], content.stagesById['1-1']!);
    expect(geared.allies[0]!.stats.atk).toBeGreaterThan(plain.allies[0]!.stats.atk);
  });
});

describe('tower trials', () => {
  it('puts a trial on one floor in five, never on a boss floor, rotating its rule', () => {
    const t = content.settings.tower;
    const kinds: string[] = [];
    for (let floor = 1; floor <= 60; floor++) {
      const f = towerFloor(content, floor);
      expect(Boolean(f.trial)).toBe(floor % t.trialEvery === t.trialOffset);
      if (f.boss) expect(f.trial).toBeNull();
      if (f.trial) kinds.push(f.trial.kind);
    }
    expect(kinds.slice(0, 4)).toEqual(['element', 'rarity', 'element', 'duo']);
    // Trials soften enemy stats to make up for the smaller team.
    const plain = towerFloor(content, 2).mods.statMult!;
    expect(towerFloor(content, 3).mods.statMult!).toBeLessThan(plain + t.multPerFloor * 2);
  });

  it('only lets in heroes the trial allows', () => {
    const flame = content.bundle.characters.filter((c) => c.element === 'flame').map((c) => c.id);
    const other = content.bundle.characters.filter((c) => c.element !== 'flame').map((c) => c.id);
    const team = [other[0]!, flame[0]!, other[1]!, flame[1]!];
    expect(trialEntrants(content, { kind: 'element', element: 'flame' }, team)).toEqual([flame[0], flame[1]]);
    expect(trialEntrants(content, { kind: 'duo' }, team)).toEqual(team.slice(0, 2));
    const r3 = trialEntrants(content, { kind: 'rarity', max: 3 }, content.bundle.characters.map((c) => c.id));
    expect(r3.every((id) => content.charactersById[id]!.rarity === 3)).toBe(true);
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
