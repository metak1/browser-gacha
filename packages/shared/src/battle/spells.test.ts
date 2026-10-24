import { describe, expect, it } from 'vitest';
import { buildBattleSetup, indexContent } from '../content';
import { createDefaultContent, REFERENCE_TEAM } from '../content/defaults';
import { cleanse, delay, dispel, dmg, revive, skill, status } from '../skills';
import { STATUS_MODIFIERS } from '../statuses';
import type { Effect, Targeting } from '../types';
import { chooseAction } from './ai';
import { act, currentActor, effectiveStat, getUnit, livingUnits, opposite, startBattle, validateAction, validTargets } from './engine';
import { autoBattle, replayBattle } from './replay';
import type { BattleEvent, BattleSetup, BattleState, BattleUnit } from './types';

const content = indexContent(createDefaultContent());

/** Stage 1-1 with everyone very tanky, so nobody falls by accident. */
function setup(): BattleSetup {
  const s = buildBattleSetup(
    content,
    3,
    REFERENCE_TEAM.map((id) => ({ id, level: 10, constellation: 0 })),
    content.stagesById['1-1']!,
  );
  for (const u of [...s.allies, ...s.enemies]) u.stats = { ...u.stats, hp: 100_000 };
  return s;
}

/** Casts a test spell (as the current actor's basic attack) on a target, or the first valid one. */
function cast(state: BattleState, effects: Effect[], targeting: Targeting = 'enemy', target?: string): { actor: BattleUnit; events: BattleEvent[] } {
  const actor = currentActor(state)!;
  actor.basic = skill('Test Spell', targeting, 0, ...effects);
  const pick = targeting === 'none' ? undefined : (target ?? validTargets(state, actor, actor.basic)[0]!.uid);
  return { actor, events: act(state, { kind: 'basic', target: pick }) };
}

/** Lets the AI play until `until` is true. */
function playUntil(state: BattleState, until: (events: BattleEvent[]) => boolean, max = 60): BattleEvent[] {
  const events: BattleEvent[] = [];
  for (let i = 0; i < max && state.outcome === 'ongoing' && !until(events); i++) events.push(...act(state, chooseAction(state)));
  return events;
}

describe('new statuses', () => {
  it('poison takes a share of max HP each turn, capped on bosses', () => {
    const { state } = startBattle(setup());
    const { actor } = cast(state, [status('poison', 3)]);
    const target = state.units.find((u) => u.side !== actor.side && u.statuses.some((s) => s.id === 'poison'))!;
    const events = playUntil(state, (ev) => ev.some((e) => e.type === 'damage' && e.status === 'poison'));
    const tick = events.find((e) => e.type === 'damage' && e.status === 'poison') as BattleEvent & { type: 'damage' };
    expect(tick.target).toBe(target.uid);
    expect(tick.amount).toBe(Math.round(target.maxHp * STATUS_MODIFIERS.poison));

    // On a boss the tick is capped by the caster's ATK.
    const boss = startBattle(setup()).state;
    const caster = currentActor(boss)!;
    const victim = livingUnits(boss, opposite(caster.side))[0]!;
    victim.boss = true;
    cast(boss, [status('poison', 3)], 'enemy', victim.uid);
    expect(victim.statuses.find((s) => s.id === 'poison')!.value).toBe(Math.round(effectiveStat(caster, 'atk') * STATUS_MODIFIERS.poisonBossCap));
  });

  it('regen heals at the start of each turn', () => {
    const { state } = startBattle(setup());
    const { actor } = cast(state, [status('regen', 3, 'self')], 'none');
    actor.hp = actor.maxHp / 2;
    const events = playUntil(state, (ev) => ev.some((e) => e.type === 'turnStart' && e.actor === actor.uid));
    const heal = events.find((e) => e.type === 'heal' && e.target === actor.uid && e.source === actor.uid) as BattleEvent & { type: 'heal' };
    expect(heal.amount).toBe(Math.round(actor.maxHp * STATUS_MODIFIERS.regen));
  });

  it('ATK Down and SPD Down lower stats', () => {
    const { state } = startBattle(setup());
    const target = livingUnits(state, opposite(currentActor(state)!.side))[0]!;
    const atk = effectiveStat(target, 'atk');
    const spd = effectiveStat(target, 'spd');
    cast(state, [status('atkDown', 2), status('spdDown', 2)], 'enemy', target.uid);
    expect(effectiveStat(target, 'atk')).toBeCloseTo(atk * (1 - STATUS_MODIFIERS.atkDown));
    expect(effectiveStat(target, 'spd')).toBeCloseTo(spd * (1 - STATUS_MODIFIERS.spdDown));
  });

  it('silence leaves only the basic attack, for players and the AI', () => {
    const { state } = startBattle(setup());
    const { actor } = cast(state, [status('silence', 2, 'self')], 'none');
    actor.cooldown = 0;
    actor.energy = 100;
    playUntil(state, () => state.actorUid === actor.uid);
    expect(validateAction(state, { kind: 'skill', target: validTargets(state, actor, actor.skill!)[0]?.uid })).toMatch(/silenced/);
    expect(validateAction(state, { kind: 'ultimate' })).toMatch(/silenced/);
    expect(chooseAction(state).kind).toBe('basic');
  });

  it('immunity blocks enemy debuffs but not buffs', () => {
    const { state } = startBattle(setup());
    const caster = currentActor(state)!;
    const target = livingUnits(state, opposite(caster.side))[0]!;
    target.statuses.push({ id: 'immunity', turns: 3, value: 0, fresh: false });
    const { events } = cast(state, [status('stun', 1)], 'enemy', target.uid);
    expect(events).toContainEqual({ type: 'statusResisted', target: target.uid, status: 'stun', immune: true });
    expect(target.statuses.some((s) => s.id === 'stun')).toBe(false);
  });
});

describe('new effects', () => {
  it('cleanse removes debuffs, dispel removes buffs', () => {
    const { state } = startBattle(setup());
    const caster = currentActor(state)!;
    const friend = livingUnits(state, caster.side).find((u) => u.uid !== caster.uid)!;
    friend.statuses.push({ id: 'burn', turns: 2, value: 5, fresh: false }, { id: 'atkUp', turns: 2, value: 0, fresh: false });
    const { events } = cast(state, [cleanse()], 'ally', friend.uid);
    expect(friend.statuses.map((s) => s.id)).toEqual(['atkUp']);
    expect(events).toContainEqual({ type: 'statusRemoved', target: friend.uid, statuses: ['burn'] });

    const next = currentActor(state)!;
    const foe = livingUnits(state, opposite(next.side))[0]!;
    foe.statuses.push({ id: 'defUp', turns: 2, value: 0, fresh: false }, { id: 'stun', turns: 1, value: 0, fresh: false });
    cast(state, [dispel()], 'enemy', foe.uid);
    expect(foe.statuses.map((s) => s.id)).toEqual(['stun']);
  });

  it('delay pushes a turn back', () => {
    const { state } = startBattle(setup());
    const caster = currentActor(state)!;
    const target = livingUnits(state, opposite(caster.side))[0]!;
    // Time moves on after the cast, so measure against a bystander's gauge.
    const others = () => state.units.filter((u) => u !== target && u !== caster && u.uid !== state.actorUid);
    const before = new Map(others().map((u) => [u.uid, target.av - u.av]));
    cast(state, [delay(0.5)], 'enemy', target.uid);
    const bystander = others().find((u) => before.has(u.uid))!;
    expect(target.av - bystander.av - before.get(bystander.uid)!).toBeCloseTo(0.5 * (10_000 / effectiveStat(target, 'spd')));
  });

  it('revives the first fallen ally, or all of them, but never summons', () => {
    const { state } = startBattle(setup());
    const caster = currentActor(state)!;
    const [a, b] = livingUnits(state, caster.side).filter((u) => u.uid !== caster.uid);
    a!.hp = 0;
    b!.hp = 0;
    b!.summonedBy = caster.uid;
    const { events } = cast(state, [revive(0.4, 'allAllies')], 'none');
    expect(a!.hp).toBe(Math.round(a!.maxHp * 0.4));
    expect(b!.hp).toBe(0);
    expect(events.filter((e) => e.type === 'revive').map((e) => (e as { target: string }).target)).toEqual([a!.uid]);
  });

  it('multi-hit splits damage into hits; pierce and lifesteal change the numbers', () => {
    const base = setup();
    const run = (effect: Effect) => {
      const { state } = startBattle(structuredClone(base));
      const target = livingUnits(state, opposite(currentActor(state)!.side))[0]!;
      target.def = 400;
      const { actor, events } = cast(state, [effect], 'enemy', target.uid);
      const hits = events.filter((e) => e.type === 'damage' && e.target === target.uid) as (BattleEvent & { type: 'damage' })[];
      return { actor, events, hits, total: hits.reduce((n, e) => n + e.amount, 0) };
    };
    const single = run(dmg(2));
    const triple = run({ ...dmg(2), hits: 3 } as Effect);
    expect(single.hits).toHaveLength(1);
    expect(triple.hits).toHaveLength(3);
    expect(triple.total).toBeGreaterThan(single.total * 0.8);
    expect(triple.total).toBeLessThan(single.total * 1.6);

    expect(run({ ...dmg(2), pierce: 1 } as Effect).total).toBeGreaterThan(single.total);

    const drain = run({ ...dmg(2), lifesteal: 0.5 } as Effect);
    drain.actor.hp = drain.actor.maxHp; // heals are capped at max HP, so check the event amount below
    const heal = drain.events.find((e) => e.type === 'heal' && e.target === drain.actor.uid) as BattleEvent & { type: 'heal' };
    expect(heal).toBeDefined();
  });

  it('battles with the new spells replay identically on the server', () => {
    const s = setup();
    for (const a of s.allies) {
      a.stats = { ...a.stats, hp: 3000 };
      a.skill = skill(
        'Hex Volley',
        'enemy',
        2,
        { kind: 'damage', to: 'target', mult: 1.5, hits: 3, pierce: 0.3, lifesteal: 0.2 },
        status('poison', 2),
        status('silence', 1),
        delay(0.2),
      );
      a.ultimate = skill('Renewal', 'none', 0, cleanse('allAllies'), status('regen', 2, 'allAllies'), revive(0.5, 'allAllies'), dispel('allEnemies'));
    }
    for (const e of s.enemies) e.stats = { ...e.stats, hp: 4000 };
    const auto = autoBattle(s);
    expect(auto.state.outcome).not.toBe('ongoing');
    const replay = replayBattle(s, auto.actions);
    expect(replay.error).toBeUndefined();
    expect(replay.outcome).toBe(auto.state.outcome);
    expect(getUnit(replay.state, 'a0')?.hp).toBe(getUnit(auto.state, 'a0')?.hp);
  });
});
