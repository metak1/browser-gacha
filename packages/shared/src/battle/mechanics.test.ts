import { describe, expect, it } from 'vitest';
import { buildBattleSetup, indexContent } from '../content';
import { createDefaultContent, REFERENCE_TEAM } from '../content/defaults';
import { chooseAction } from './ai';
import { act, currentActor, getUnit, livingUnits, startBattle } from './engine';
import { autoBattle, replayBattle } from './replay';
import type { BattleAction, BattleEvent, BattleSetup, BattleState } from './types';

const content = indexContent(createDefaultContent());

/** A stage with tanky allies whose hits do a fixed-ish amount, so fights last. */
function setupFor(stageId: string, level: number, allyAtk: number): BattleSetup {
  const stage = content.stagesById[stageId]!;
  const setup = buildBattleSetup(
    content,
    7,
    REFERENCE_TEAM.map((id) => ({ id, level, constellation: 0 })),
    stage,
  );
  for (const a of setup.allies) a.stats = { ...a.stats, hp: 1_000_000, atk: allyAtk };
  return setup;
}

const bossUid = (state: BattleState) => state.units.find((u) => u.boss)!.uid;

/** Plays turns, with ally turns chosen by `ally`, until `until` says stop or the battle ends. */
function play(state: BattleState, events: BattleEvent[], ally: (s: BattleState) => BattleAction, until: () => boolean, max = 200) {
  for (let i = 0; i < max && state.outcome === 'ongoing' && !until(); i++) {
    const actor = currentActor(state)!;
    events.push(...act(state, actor.side === 'ally' ? ally(state) : chooseAction(state)));
  }
}

const hit = (target: string) => (): BattleAction => ({ kind: 'basic', target });
const mech = (events: BattleEvent[], kind: string) => events.filter((e) => e.type === 'mechanic' && e.kind === kind);

describe('boss mechanics', () => {
  it('charges a big attack and unleashes it on its next turn', () => {
    const setup = setupFor('1-4', 4, 1);
    const { state, events } = startBattle(setup);
    const boss = bossUid(state);
    // Only ever hit a minion, so the charge is never broken.
    const minion = state.units.find((u) => u.side === 'enemy' && !u.boss)!.uid;
    play(state, events, hit(minion), () => mech(events, 'unleash').length > 0);
    const charge = events.findIndex((e) => e.type === 'mechanic' && e.kind === 'charge');
    const unleash = events.findIndex((e) => e.type === 'mechanic' && e.kind === 'unleash');
    expect(charge).toBeGreaterThanOrEqual(0);
    expect(unleash).toBeGreaterThan(charge);
    // Nothing else for the boss in between: the next boss turn is the unleash.
    const bossTurns = events.slice(charge + 1, unleash).filter((e) => e.type === 'turnStart' && e.actor === boss);
    expect(bossTurns).toHaveLength(1);
    expect(events.slice(unleash).some((e) => e.type === 'action' && e.actor === boss && e.skill === 'Tidal Crush')).toBe(true);
  });

  it('breaks the charge when the team deals enough damage, stunning the boss', () => {
    const setup = setupFor('1-4', 4, 400);
    const boss = setup.enemies.find((e) => e.boss)!;
    boss.stats = { ...boss.stats, hp: 1_000_000 };
    boss.mechanics!.charge!.breakHp = 500;
    const { state, events } = startBattle(setup);
    const uid = bossUid(state);
    const target = (s: BattleState): BattleAction => {
      // Taunting minions must be hit first; otherwise go for the boss.
      const enemies = livingUnits(s, 'enemy');
      const taunt = enemies.find((u) => u.statuses.some((x) => x.id === 'taunt'));
      return { kind: 'basic', target: (taunt ?? getUnit(s, uid)!).uid };
    };
    play(state, events, target, () => mech(events, 'break').length > 0);
    const brk = events.findIndex((e) => e.type === 'mechanic' && e.kind === 'break');
    expect(brk).toBeGreaterThanOrEqual(0);
    expect(getUnit(state, uid)!.mech!.charging).toBeNull();
    // Its next turn is lost to the stun, and the charged attack never lands.
    play(state, events, target, () => events.slice(brk).some((e) => e.type === 'stunned' && e.actor === uid));
    expect(events.slice(brk).some((e) => e.type === 'stunned' && e.actor === uid)).toBe(true);
    expect(mech(events, 'unleash')).toHaveLength(0);
  });

  it('enrages once below the threshold', () => {
    const setup = setupFor('2-4', 13, 60);
    const { state, events } = startBattle(setup);
    const uid = bossUid(state);
    const atk = getUnit(state, uid)!.atk;
    const boss = getUnit(state, uid)!;
    boss.hp = Math.floor(boss.maxHp * 0.31);
    play(
      state,
      events,
      () => ({ kind: 'basic', target: livingUnits(state, 'enemy').find((u) => u.statuses.some((x) => x.id === 'taunt'))?.uid ?? uid }),
      () => mech(events, 'enrage').length > 0,
    );
    expect(mech(events, 'enrage')).toHaveLength(1);
    expect(getUnit(state, uid)!.atk).toBe(Math.round(atk * 1.3));
  });

  it('calls adds at its HP thresholds', () => {
    const setup = setupFor('3-4', 23, 60);
    const { state, events } = startBattle(setup);
    const uid = bossUid(state);
    const boss = getUnit(state, uid)!;
    boss.hp = Math.floor(boss.maxHp * 0.61);
    play(
      state,
      events,
      () => ({ kind: 'basic', target: livingUnits(state, 'enemy').find((u) => u.statuses.some((x) => x.id === 'taunt'))?.uid ?? uid }),
      () => mech(events, 'adds').length > 0,
    );
    expect(mech(events, 'adds')).toHaveLength(1);
    const spawn = events.find((e) => e.type === 'spawn' && e.reason === 'summon' && e.source === uid);
    if (spawn?.type !== 'spawn') throw new Error('no adds spawned');
    expect(spawn.units.length).toBeGreaterThan(0);
    expect(spawn.units.every((u) => u.defId === 'skeleton')).toBe(true);
  });

  it('replays boss fights exactly', () => {
    for (const stageId of ['1-4', '2-4', '3-4', '4-4', '5-4', '6-4']) {
      const stage = content.stagesById[stageId]!;
      for (let seed = 1; seed <= 5; seed++) {
        const setup = buildBattleSetup(
          content,
          seed,
          REFERENCE_TEAM.map((id) => ({ id, level: stage.recommendedLevel + 5, constellation: 0 })),
          stage,
        );
        const played = autoBattle(setup);
        const replay = replayBattle(setup, played.actions);
        expect(replay.error).toBeUndefined();
        expect(replay.state).toEqual(played.state);
      }
    }
  });
});
