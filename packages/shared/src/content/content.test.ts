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

describe('the Armory', () => {
  it('is added to older content, and a first-draft Armory gets the tuned enemy levels', () => {
    const fresh = createDefaultContent();
    const old = { ...fresh, dungeons: fresh.dungeons.filter((d) => d.id !== 'armory') };
    const added = upgradeContent(old, 19).bundle.dungeons.find((d) => d.id === 'armory')!;
    expect(added.tiers.every((t) => t.gearRolls && t.materialDrops.length === 0)).toBe(true);

    const draft = createDefaultContent();
    const a = draft.dungeons.find((d) => d.id === 'armory')!;
    [12, 27, 42, 52].forEach((lv, i) => {
      for (const e of [...a.tiers[i]!.enemies, ...a.tiers[i]!.waves.flat()]) e.level = lv;
    });
    const fixed = upgradeContent(draft, 20).bundle.dungeons.find((d) => d.id === 'armory')!;
    expect(fixed.tiers.map((t) => t.enemies[0]!.level)).toEqual(createDefaultContent().dungeons.find((d) => d.id === 'armory')!.tiers.map((t) => t.enemies[0]!.level));
  });
});

describe('gear dungeons', () => {
  it('are three, always open, with two sets and a mechanic each, covering every set once', () => {
    const gear = createDefaultContent().dungeons.filter((d) => d.tiers.some((t) => t.gearRolls));
    expect(gear.map((d) => d.id)).toEqual(['armory', 'bastion', 'windspire']);
    for (const d of gear) {
      expect(d.days).toHaveLength(7);
      expect(d.sets).toHaveLength(2);
      expect(d.mechanic).toBeTruthy();
    }
    expect(new Set(gear.map((d) => d.mechanic)).size).toBe(3);
    expect(gear.flatMap((d) => d.sets).sort()).toEqual(createDefaultContent().gearSets.map((s) => s.id).sort());
  });

  it('turns a v21 Armory into the crit-set dungeon and adds the other two', () => {
    const b = createDefaultContent();
    const v21 = structuredClone(b.dungeons.find((d) => d.id === 'armory')!);
    Object.assign(v21, { sets: [], mechanic: null, description: 'Gear only. Pick the set you want, win, and every drop belongs to it: random slot, main stat and bonus stats.' });
    v21.tiers = v21.tiers.map((t, i) => ({
      ...t,
      enemies: [
        ['orc', 'black-knight', 'orc'],
        ['minotaur', 'black-knight', 'orc-rider'],
        ['storm-knight', 'magma-golem', 'storm-knight'],
        ['black-knight', 'magma-golem', 'black-knight'],
      ][i]!.map((id) => ({ id, level: [17, 34, 50, 60][i]! })),
      waves: [[], [['orc', 'orc', 'orc']], [['minotaur', 'black-knight', 'minotaur']], [['orc', 'warlord', 'orc']]][i]!.map((w) => w.map((id) => ({ id, level: [17, 34, 50, 60][i]! }))),
    }));
    b.dungeons = [...b.dungeons.filter((d) => !['armory', 'bastion', 'windspire'].includes(d.id)), v21];
    const { bundle } = upgradeContent(b, 21);
    const def = createDefaultContent();
    for (const id of ['armory', 'bastion', 'windspire']) {
      expect(bundle.dungeons.find((d) => d.id === id)).toEqual(def.dungeons.find((d) => d.id === id));
    }
  });

  it('moves every level to 10 stamina, keeping XP per campaign win and edited costs', () => {
    const b = createDefaultContent();
    // As v25 left it: dungeon tiers 8/12/16/20, campaign 6, hard 12, 10 XP per stamina.
    for (const d of b.dungeons) d.tiers.forEach((t, i) => (t.stamina = [8, 12, 16, 20][i]!));
    b.dungeons.find((d) => d.id === 'armory')!.tiers[3]!.stamina = 25; // edited by an admin
    Object.assign(b.settings.stamina, { campaignCost: 6, hardCost: 12 });
    b.settings.playerLevel.xpPerStamina = 10;
    const { bundle } = upgradeContent(b, 25);
    expect(bundle.dungeons.find((d) => d.id === 'armory')!.tiers.map((t) => t.stamina)).toEqual([10, 10, 10, 25]);
    expect(bundle.dungeons.find((d) => d.id === 'ember-forge')!.tiers.map((t) => t.stamina)).toEqual([10, 10, 10]);
    expect(bundle.settings.stamina).toMatchObject({ campaignCost: 10, hardCost: 10 });
    expect(bundle.settings.stamina.campaignCost * bundle.settings.playerLevel.xpPerStamina).toBe(60);
  });

  it('drops the "bring …" advice from v23 descriptions but keeps edited ones', () => {
    const b = createDefaultContent();
    b.dungeons.find((d) => d.id === 'armory')!.description =
      'Crit gear (Precision, Ruin). Its armoured guards shrug off weak hits: bring piercing, DEF Down, or damage that scales with HP or DEF.';
    b.dungeons.find((d) => d.id === 'bastion')!.description = 'My own text.';
    const { bundle } = upgradeContent(b, 23);
    expect(bundle.dungeons.find((d) => d.id === 'armory')!.description).toBe('Crit gear: Precision and Ruin. Its armoured guards shrug off weak hits.');
    expect(bundle.dungeons.find((d) => d.id === 'bastion')!.description).toBe('My own text.');
  });
});
