import { describe, expect, it } from 'vitest';
import { buildBattleSetup, indexContent, isStageUnlocked } from './index';
import { createDefaultContent } from './defaults';
import { upgradeContent } from './upgrade';
import { validateBundle } from './validate';

describe('content', () => {
  it('default content is valid', () => {
    expect(validateBundle(createDefaultContent())).toEqual([]);
  });

  it('catches broken references', () => {
    const b = createDefaultContent();
    b.characters[0]!.basic = 'nope';
    b.stages[0]!.enemies.push({ id: 'ghost', level: 1 });
    b.banners[0]!.featured5 = 'cinder';
    b.settings.starterCharacters = ['missing'];
    b.missions.push({ ...b.missions[0]!, id: 'm2', target: 'zzz' });
    const errors = validateBundle(b).join('\n');
    expect(errors).toMatch(/unknown spell "nope"/);
    expect(errors).toMatch(/unknown enemy "ghost"/);
    expect(errors).toMatch(/is ★4/);
    expect(errors).toMatch(/starter character "missing"/);
    expect(errors).toMatch(/missions\/m2: clearStage missions need/);
  });

  it('catches duplicate ids and bad shapes', () => {
    const b = createDefaultContent();
    b.skills.push({ ...b.skills[0]! });
    expect(validateBundle(b).join()).toMatch(/duplicate id/);
    const c = createDefaultContent();
    (c.characters[0] as { rarity: number }).rarity = 7;
    expect(validateBundle(c).length).toBeGreaterThan(0);
  });

  it('orders stages by chapter and index for unlocking', () => {
    const b = createDefaultContent();
    b.stages.reverse();
    const content = indexContent(b);
    expect(content.stages.map((s) => s.id).slice(0, 3)).toEqual(['1-1', '1-2', '1-3']);
    expect(isStageUnlocked(content, '1-2', [])).toBe(false);
    expect(isStageUnlocked(content, '1-2', ['1-1'])).toBe(true);
  });

  it('battle setups snapshot resolved units', () => {
    const b = createDefaultContent();
    const content = indexContent(b);
    const setup = buildBattleSetup(content, 1, [{ id: 'ignis', level: 10, constellation: 2 }], content.stagesById['1-1']!);
    expect(setup.allies[0]!.basic.name).toBe('Ember Claw');
    expect(setup.allies[0]!.stats.atk).toBeGreaterThan(b.characters[0]!.base.atk);
    // Editing content afterwards doesn't touch the snapshot.
    b.skills.find((s) => s.id === 'ignis-basic')!.name = 'Changed';
    expect(setup.allies[0]!.basic.name).toBe('Ember Claw');
  });
});

describe('difficulty curve upgrade', () => {
  /** Default content as it was before v11: old levels, no multiplier, first-release star budgets. */
  function oldContent() {
    const b = createDefaultContent();
    const s = b.stages.find((x) => x.id === '2-4')!;
    s.enemies = s.enemies.map((e) => ({ ...e, level: 13 }));
    s.recommendedLevel = 15;
    s.statMult = 1;
    s.gold = 60 + 13 * 25;
    s.objectives = [{ kind: 'win' }, { kind: 'noDeaths' }, { kind: 'maxActions', value: 18 }];
    return b;
  }

  it('moves stages on the old defaults to the new curve', () => {
    const { bundle } = upgradeContent(oldContent(), 10);
    const s = bundle.stages.find((x) => x.id === '2-4')!;
    const def = createDefaultContent().stages.find((x) => x.id === '2-4')!;
    expect(s.enemies.map((e) => e.level)).toEqual(def.enemies.map((e) => e.level));
    expect(s.statMult).toBe(def.statMult);
    expect(s.objectives).toEqual(def.objectives);
  });

  it('leaves stages an admin changed alone', () => {
    const b = oldContent();
    const s = b.stages.find((x) => x.id === '2-4')!;
    s.recommendedLevel = 20;
    s.objectives = [{ kind: 'win' }, { kind: 'maxActions', value: 33 }];
    const { bundle } = upgradeContent(b, 10);
    const after = bundle.stages.find((x) => x.id === '2-4')!;
    expect(after.recommendedLevel).toBe(20);
    expect(after.statMult).toBe(1);
    expect(after.objectives).toEqual([{ kind: 'win' }, { kind: 'maxActions', value: 33 }]);
  });
});

describe('boots', () => {
  it('only allows SPD as a main stat on boots', () => {
    const b = createDefaultContent();
    expect(validateBundle(b)).toEqual([]);
    Object.assign(b.gear.find((g) => g.id === 'moon-pendant')!, { mainStat: 'spd', mainBase: 4 });
    expect(validateBundle(b).join('\n')).toMatch(/only allowed on boots/);
  });

  it('turns old SPD charms into boots and adds the new boots to default drop tables', () => {
    const b = createDefaultContent();
    // As before v15: the two SPD charms, no other boots, and the old drop tables.
    b.gear = b.gear.filter((g) => g.slot !== 'boots' || ['lucky-clover', 'swift-feather'].includes(g.id));
    Object.assign(b.gear.find((g) => g.id === 'lucky-clover')!, { slot: 'charm', name: 'Lucky Clover', mainStat: 'spd', mainBase: 3 });
    Object.assign(b.gear.find((g) => g.id === 'swift-feather')!, { slot: 'charm', name: 'My Feather', mainStat: 'spd', mainBase: 6 });
    const s11 = b.stages.find((s) => s.id === '1-1')!;
    s11.drops = [{ gear: 'bronze-blade', chance: 0.35 }, { gear: 'leather-vest', chance: 0.35 }, { gear: 'lucky-clover', chance: 0.25 }];
    const s21 = b.stages.find((s) => s.id === '2-1')!;
    s21.drops = [{ gear: 'runed-saber', chance: 0.25 }, { gear: 'knight-mail', chance: 0.25 }, { gear: 'lucky-clover', chance: 0.3 }, { gear: 'moon-pendant', chance: 0.15 }];
    const { bundle } = upgradeContent(b, 14);
    expect(validateBundle(bundle)).toEqual([]);
    expect(bundle.gear.find((g) => g.id === 'lucky-clover')).toMatchObject({ slot: 'boots', name: 'Clover Sandals' });
    // Renamed by an admin: moved to boots, name kept.
    expect(bundle.gear.find((g) => g.id === 'swift-feather')).toMatchObject({ slot: 'boots', name: 'My Feather' });
    expect(bundle.gear.filter((g) => g.slot === 'boots').map((g) => g.id).sort()).toEqual(
      ['iron-greaves', 'lucky-clover', 'pilgrim-treads', 'ranger-boots', 'swift-feather', 'warlord-sabatons'],
    );
    expect(bundle.stages.find((s) => s.id === '2-1')!.drops.some((d) => d.gear === 'ranger-boots')).toBe(true);
  });
});
