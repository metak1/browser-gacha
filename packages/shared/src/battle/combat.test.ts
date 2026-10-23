import { describe, expect, it } from 'vitest';
import { buildBattleSetup, indexContent } from '../content';
import { createDefaultContent, REFERENCE_TEAM } from '../content/defaults';
import { upgradeContent } from '../content/upgrade';
import { act, currentActor, startBattle } from './engine';
import { chooseAction } from './ai';
import type { BattleEvent, BattleSetup, BattleState } from './types';
import type { Skill } from '../types';

const content = indexContent(createDefaultContent());

function setup(seed = 1): BattleSetup {
  const s = buildBattleSetup(content, seed, REFERENCE_TEAM.map((id) => ({ id, level: 10, constellation: 0 })), content.stagesById['1-1']!);
  for (const u of [...s.allies, ...s.enemies]) u.passive = null;
  return s;
}

/** Runs until ally a0 acts, then uses \`skill\` on e0 and returns that action's events. */
function useOnce(s: BattleSetup, skill: Skill, prepare?: (state: BattleState) => void): { events: BattleEvent[]; state: BattleState } {
  s.allies[0]!.basic = skill;
  const { state } = startBattle(s);
  prepare?.(state);
  while (currentActor(state)!.uid !== 'a0') act(state, chooseAction(state));
  return { events: act(state, { kind: 'basic', target: 'e0' }), state };
}

const damageTo = (events: BattleEvent[], uid: string) =>
  events.filter((e): e is BattleEvent & { type: 'damage' } => e.type === 'damage' && e.target === uid && e.source === 'a0');

describe('combat stats', () => {
  it('crits deal 1 + Crit DMG times damage', () => {
    const base = setup();
    base.allies[0]!.combat = { critRate: 0, critDmg: 0.5, effectHit: 0, effectRes: 0 };
    const hit = { name: 'Hit', targeting: 'enemy', cooldown: 0, effects: [{ kind: 'damage', to: 'target', mult: 1 }] } as Skill;
    const normal = damageTo(useOnce(base, hit).events, 'e0')[0]!;
    const critical = setup();
    critical.allies[0]!.combat = { critRate: 1, critDmg: 1.5, effectHit: 0, effectRes: 0 };
    const crit = damageTo(useOnce(critical, hit).events, 'e0')[0]!;
    expect(normal.crit).toBe(false);
    expect(crit.crit).toBe(true);
    // Same seed and variance draw order, so the only difference is the ×2.5.
    expect(crit.amount / normal.amount).toBeGreaterThan(2.2);
    expect(crit.amount / normal.amount).toBeLessThan(2.8);
  });

  it('scales damage, heals and shields with DEF, max HP or ATK × SPD', () => {
    const s = setup();
    const a0 = s.allies[0]!;
    a0.stats = { ...a0.stats, atk: 100, def: 400, hp: 5000, spd: 200 };
    a0.combat = { critRate: 0, critDmg: 0.5, effectHit: 0, effectRes: 0 };
    const byDef = useOnce(s, { name: 'Bash', targeting: 'enemy', cooldown: 0, effects: [{ kind: 'damage', to: 'target', mult: 1, scale: 'def' }] } as Skill);
    const s2 = setup();
    Object.assign(s2.allies[0]!, { stats: a0.stats, combat: a0.combat });
    const byAtk = useOnce(s2, { name: 'Hit', targeting: 'enemy', cooldown: 0, effects: [{ kind: 'damage', to: 'target', mult: 1 }] } as Skill);
    expect(damageTo(byDef.events, 'e0')[0]!.amount / damageTo(byAtk.events, 'e0')[0]!.amount).toBeCloseTo(4, 0);

    const s3 = setup();
    Object.assign(s3.allies[0]!, { stats: a0.stats, combat: a0.combat });
    const guard = useOnce(s3, { name: 'Guard', targeting: 'enemy', cooldown: 0, effects: [{ kind: 'shield', to: 'self', mult: 0.1, scale: 'hp' }] } as Skill);
    expect(guard.events.find((e) => e.type === 'shield')).toMatchObject({ amount: 500 });

    const s4 = setup();
    Object.assign(s4.allies[0]!, { stats: a0.stats, combat: a0.combat });
    const fast = useOnce(s4, { name: 'Gust', targeting: 'enemy', cooldown: 0, effects: [{ kind: 'shield', to: 'self', mult: 1, scale: 'spd' }] } as Skill);
    expect(fast.events.find((e) => e.type === 'shield')).toMatchObject({ amount: 200 });
  });

  it('Effect RES resists debuffs, Effect Hit pushes them through, and buffs are never resisted', () => {
    const stun = { name: 'Daze', targeting: 'enemy', cooldown: 0, effects: [{ kind: 'status', to: 'target', status: 'stun', turns: 1 }] } as Skill;
    const resisted = useOnce(setup(), stun, (state) => {
      state.units.find((u) => u.uid === 'e0')!.combat.effectRes = 1;
    });
    expect(resisted.events.some((e) => e.type === 'statusResisted' && e.target === 'e0')).toBe(true);

    const chance = { ...stun, effects: [{ kind: 'status', to: 'target', status: 'stun', turns: 1, chance: 0.5 }] } as Skill;
    const pushed = useOnce(setup(), chance, (state) => {
      state.units.find((u) => u.uid === 'a0')!.combat.effectHit = 1;
      state.units.find((u) => u.uid === 'e0')!.combat.effectRes = 0;
    });
    expect(pushed.events.some((e) => e.type === 'statusApplied' && e.target === 'e0')).toBe(true);

    const buff = { name: 'Rally', targeting: 'enemy', cooldown: 0, effects: [{ kind: 'status', to: 'self', status: 'atkUp', turns: 2 }] } as Skill;
    const self = useOnce(setup(), buff, (state) => {
      state.units.find((u) => u.uid === 'a0')!.combat.effectRes = 1;
    });
    expect(self.events.some((e) => e.type === 'statusApplied' && e.target === 'a0')).toBe(true);
  });

  it('older battle setups without combat stats keep the old fixed crits', () => {
    const s = setup();
    for (const u of [...s.allies, ...s.enemies]) delete u.combat;
    const { state } = startBattle(s);
    expect(state.units[0]!.combat).toEqual({ critRate: 0.1, critDmg: 0.5, effectHit: 0, effectRes: 0 });
  });
});

describe('stat-scaling spells upgrade', () => {
  it('moves default spells to their new scaling, leaving edited ones alone', () => {
    const b = createDefaultContent();
    const gaia = b.skills.find((s) => s.id === 'gaia-skill')!;
    const mossy = b.skills.find((s) => s.id === 'mossy-skill')!;
    // As they were before v14.
    gaia.effects = [{ kind: 'shield', to: 'allAllies', mult: 2.2 }, { kind: 'status', to: 'self', status: 'taunt', turns: 2 }];
    mossy.effects = [{ kind: 'heal', to: 'allAllies', mult: 1.5 }]; // an admin edit
    const { bundle } = upgradeContent(b, 13);
    expect(bundle.skills.find((s) => s.id === 'gaia-skill')!.effects[0]).toMatchObject({ kind: 'shield', scale: 'def' });
    expect(bundle.skills.find((s) => s.id === 'mossy-skill')!.effects).toEqual([{ kind: 'heal', to: 'allAllies', mult: 1.5 }]);
  });
});
