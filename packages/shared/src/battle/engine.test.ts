import { describe, expect, it } from 'vitest';
import { buildBattleSetup, indexContent } from '../content';
import { createDefaultContent, REFERENCE_TEAM } from '../content/defaults';
import { applyPassiveCombat } from '../skills';
import { chooseAction } from './ai';
import { act, currentActor, predictTurnOrder, startBattle, validateAction } from './engine';
import { autoBattle, replayBattle } from './replay';
import type { BattleEvent, BattleSetup } from './types';

const content = indexContent(createDefaultContent());

function setupFor(stageId: string, level: number, seed: number, team = REFERENCE_TEAM): BattleSetup {
  return buildBattleSetup(
    content,
    seed,
    team.map((id) => ({ id, level, constellation: 0 })),
    content.stagesById[stageId]!,
  );
}

describe('battle engine', () => {
  it('is deterministic for the same seed and actions', () => {
    const setup = setupFor('1-3', 3, 1234);
    const a = autoBattle(setup);
    const b = autoBattle(setup);
    expect(a.state).toEqual(b.state);
    expect(a.state.outcome).not.toBe('ongoing');
  });

  it('replaying recorded actions reproduces the outcome', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const setup = setupFor('1-4', 4, seed);
      const played = autoBattle(setup);
      const replay = replayBattle(setup, played.actions);
      expect(replay.error).toBeUndefined();
      expect(replay.outcome).toBe(played.state.outcome);
      expect(replay.state).toEqual(played.state);
    }
  });

  it('rejects illegal action logs', () => {
    const setup = setupFor('1-1', 1, 99);
    const played = autoBattle(setup);
    expect(replayBattle(setup, [{ kind: 'basic', target: 'a0' }]).error).toMatch(/Invalid target/);
    expect(replayBattle(setup, [...played.actions, { kind: 'basic', target: 'e0' }]).error).toMatch(/after the battle/);
    // Using a skill twice in a row breaks cooldown rules.
    const { state } = startBattle(setup);
    while (currentActor(state)!.side !== 'ally') act(state, chooseAction(state));
    const actor = currentActor(state)!;
    actor.cooldown = 2;
    expect(validateAction(state, { kind: 'skill', target: 'e0' })).toMatch(/cooldown/);
  });

  it('an unfinished log is not a victory', () => {
    const setup = setupFor('1-1', 1, 5);
    const played = autoBattle(setup);
    expect(replayBattle(setup, played.actions.slice(0, 1)).outcome).toBe('ongoing');
  });

  it('orders turns by speed', () => {
    const { state } = startBattle(setupFor('1-2', 1, 1));
    const order = predictTurnOrder(state, 6);
    expect(order[0]).toBe(state.actorUid);
    // Bats (spd 118) are the fastest units on this stage.
    expect(state.units.find((u) => u.uid === order[0])!.defId).toBe('bat');
  });

  it('the starter team reliably clears the first stage', () => {
    let wins = 0;
    for (let seed = 1; seed <= 100; seed++) if (autoBattle(setupFor('1-1', 1, seed)).state.outcome === 'victory') wins++;
    expect(wins).toBeGreaterThanOrEqual(95);
  });
});

describe('passives', () => {
  const withPassive = (setup: BattleSetup, side: 'allies' | 'enemies', i: number, passive: BattleSetup['allies'][number]['passive']) => {
    const unit = setup[side][i]!;
    unit.passive = passive;
    // Combat stats are resolved with the passive, as content resolution does.
    if (unit.combat) unit.combat = applyPassiveCombat(unit.combat, passive);
    return setup;
  };
  const strip = (setup: BattleSetup) => {
    for (const u of [...setup.allies, ...setup.enemies]) u.passive = null;
    return setup;
  };

  it('copies default passives and their stat bonuses into battle units', () => {
    const plain = { ...content.charactersById.pebble!, passive: null };
    const setup = setupFor('1-1', 10, 1, ['pebble']);
    expect(setup.allies[0]!.passive?.name).toBe('Sturdy');
    const unbuffed = buildBattleSetup(
      indexContent({ ...createDefaultContent(), characters: [plain] }),
      1,
      [{ id: 'pebble', level: 10, constellation: 0 }],
      content.stagesById['1-1']!,
    );
    expect(setup.allies[0]!.stats.hp).toBe(Math.round(unbuffed.allies[0]!.stats.hp * 1.12));
  });

  it('fires battle-start triggers before the first turn', () => {
    const setup = withPassive(strip(setupFor('1-1', 5, 3)), 'allies', 0, {
      name: 'Head Start',
      rules: [{ kind: 'trigger', on: 'battleStart', effects: [{ kind: 'energy', to: 'self', amount: 30 }] }],
    });
    const { state, events } = startBattle(setup);
    expect(events[0]).toEqual({ type: 'passive', unit: 'a0', name: 'Head Start' });
    expect(state.units.find((u) => u.uid === 'a0')!.energy).toBe(50);
  });

  it('retaliates when hit without looping between two thorny units', () => {
    const thorns = {
      name: 'Thorns',
      rules: [{ kind: 'trigger' as const, on: 'hit' as const, effects: [{ kind: 'damage' as const, to: 'target' as const, mult: 0.3 }] }],
    };
    const setup = strip(setupFor('1-1', 5, 7));
    for (const u of [...setup.allies, ...setup.enemies]) u.passive = structuredClone(thorns);
    const played = autoBattle(setup);
    expect(played.state.outcome).not.toBe('ongoing');
    const replay = replayBattle(setup, played.actions);
    expect(replay.state).toEqual(played.state);
  });

  it('always crits with 100% crit rate and heals the most injured ally', () => {
    const setup = withPassive(strip(setupFor('1-1', 5, 9)), 'allies', 0, {
      name: 'Precision',
      rules: [
        { kind: 'critRate', amount: 1 },
        { kind: 'trigger', on: 'turnStart', effects: [{ kind: 'heal', to: 'lowestAlly', mult: 0.1 }] },
      ],
    });
    const { state } = startBattle(setup);
    const hurt = state.units.find((u) => u.uid === 'a2')!;
    hurt.hp = Math.round(hurt.maxHp * 0.3);
    while (currentActor(state)!.uid !== 'a0') act(state, chooseAction(state));
    const events = act(state, { kind: 'basic', target: 'e0' });
    expect(events.filter((e) => e.type === 'damage' && e.source === 'a0').every((e) => e.type === 'damage' && e.crit)).toBe(true);
    // On a0's next turn its passive heals the most injured ally.
    const later = [...events];
    while (state.outcome === 'ongoing' && currentActor(state)!.uid !== 'a0') later.push(...act(state, chooseAction(state)));
    const fired = later.findIndex((e) => e.type === 'passive' && e.unit === 'a0' && e.name === 'Precision');
    expect(fired).toBeGreaterThanOrEqual(0);
    expect(later[fired + 1]).toMatchObject({ type: 'heal', target: 'a2' });
  });
});

describe('waves and summons', () => {
  it('brings in the next wave only after the first is defeated, and replays exactly', () => {
    const setup = setupFor('4-2', 40, 11, ['zephyr', 'gaia', 'marina', 'raijin']);
    expect(setup.waves).toHaveLength(1);
    const played = autoBattle(setup);
    expect(played.state.outcome).toBe('victory');
    expect(played.state.wave).toBe(2);
    // Wave 1's defeated enemies left; wave 2 units have fresh uids.
    expect(played.state.units.filter((u) => u.side === 'enemy').map((u) => u.uid)).toEqual(['e3', 'e4', 'e5']);
    expect(replayBattle(setup, played.actions).state).toEqual(played.state);
  });

  it('does not end the battle while a wave is still to come', () => {
    const setup = setupFor('4-2', 40, 2, ['zephyr', 'gaia', 'marina', 'raijin']);
    const { state } = startBattle(setup);
    for (const u of state.units) if (u.side === 'enemy') u.hp = 1;
    const events: BattleEvent[] = [];
    while (state.outcome === 'ongoing' && state.wave === 1) {
      events.push(...act(state, chooseAction(state)));
    }
    expect(events.filter((e) => e.type === 'end')).toHaveLength(0);
    expect(events.some((e) => e.type === 'spawn' && e.reason === 'wave' && e.wave === 2)).toBe(true);
  });

  it('summons weaker minions, never past 5 units, and not while its minions live', () => {
    const setup = setupFor('4-4', 34, 5, ['pebble']);
    const summonKeyName = Object.keys(setup.summons ?? {})[0]!;
    expect(summonKeyName).toBe(`spark@${content.stagesById['4-4']!.enemies[0]!.level}`);
    const placed = buildBattleSetup(content, 1, [{ id: 'pebble', level: 1, constellation: 0 }], {
      ...content.stagesById['4-4']!,
      enemies: [{ id: 'spark', level: 34 }],
    });
    expect(setup.summons![summonKeyName]!.stats.hp).toBeLessThan(placed.enemies[0]!.stats.hp);

    const { state } = startBattle(setup);
    const boss = state.units.find((u) => u.defId === 'thunderbird')!;
    const summonOnce = () => {
      while (currentActor(state)!.uid !== boss.uid) act(state, chooseAction(state));
      boss.cooldown = 0;
      return act(state, { kind: 'skill' });
    };
    const first = summonOnce().filter((e) => e.type === 'spawn');
    expect(first).toHaveLength(1);
    expect(state.units.filter((u) => u.side === 'enemy' && u.hp > 0).length).toBeLessThanOrEqual(5);
    // Minions still standing: casting again calls nobody.
    if (state.outcome === 'ongoing' && state.units.some((u) => u.summonedBy === boss.uid && u.hp > 0)) {
      expect(summonOnce().filter((e) => e.type === 'spawn')).toHaveLength(0);
    }
  });

  it('hard mode raises enemy levels and stats', () => {
    const normal = buildBattleSetup(content, 1, [{ id: 'pebble', level: 10, constellation: 0 }], content.stagesById['1-1']!);
    const hard = buildBattleSetup(content, 1, [{ id: 'pebble', level: 10, constellation: 0 }], content.stagesById['1-1']!, true);
    expect(hard.enemies[0]!.level).toBe(normal.enemies[0]!.level + content.settings.hardMode.levelBonus);
    expect(hard.enemies[0]!.stats.hp).toBeGreaterThan(normal.enemies[0]!.stats.hp * 1.2);
  });
});
