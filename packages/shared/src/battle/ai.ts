import { hash32 } from '../rng';
import { currentActor, hasLivingMinions, livingUnits, MAX_SIDE, ultimateReady, validTargets } from './engine';
import type { BattleAction, BattleState, BattleUnit } from './types';
import type { Skill } from '../types';

const isHealing = (skill: Skill) => skill.effects.some((e) => e.kind === 'heal');
const isPureHeal = (skill: Skill) => skill.effects.every((e) => e.kind === 'heal');

function minBy<T>(list: T[], score: (t: T) => number): T {
  let best = list[0] as T;
  for (const item of list) if (score(item) < score(best)) best = item;
  return best;
}

/**
 * Picks an action for the current actor. Used for enemies and for auto-battle.
 *
 * It never consumes battle RNG: the server replays enemy turns with this same
 * function, and auto-played ally turns must not shift the random sequence.
 * Variety comes from hashing the (deterministic) current state instead.
 */
export function chooseAction(state: BattleState): BattleAction {
  const actor = currentActor(state);
  if (!actor) throw new Error('No unit is waiting to act');

  // Save pure heals until someone is actually hurt, and pure summons until the side is thin.
  const allies = livingUnits(state, actor.side);
  const worthUsing = (s: Skill) =>
    (!isPureHeal(s) || allies.some((u) => u.hp / u.maxHp < 0.7)) &&
    (!s.effects.every((e) => e.kind === 'summon') || (allies.length < MAX_SIDE - 1 && !hasLivingMinions(state, actor.uid)));

  let kind: BattleAction['kind'] = 'basic';
  let chosen = actor.basic;
  if (ultimateReady(actor) && worthUsing(actor.ultimate!)) {
    kind = 'ultimate';
    chosen = actor.ultimate!;
  } else if (actor.skill && actor.cooldown === 0 && worthUsing(actor.skill)) {
    kind = 'skill';
    chosen = actor.skill;
  }
  if (chosen.targeting === 'none') return { kind };

  const targets = validTargets(state, actor, chosen);
  return { kind, target: pickTarget(state, actor, chosen, targets).uid };
}

function pickTarget(state: BattleState, actor: BattleUnit, skill: Skill, targets: BattleUnit[]): BattleUnit {
  if (skill.targeting === 'ally') {
    if (isHealing(skill)) return minBy(targets, (u) => u.hp / u.maxHp);
    // Buffs go to the hardest hitter.
    return minBy(targets, (u) => -u.atk);
  }
  // Break a charging boss before it unleashes.
  const charging = targets.find((u) => u.mech?.charging);
  if (charging) return charging;
  const roll = hash32(state.rng, state.turns, actor.uid.charCodeAt(1)) % 100;
  if (roll < 60) return minBy(targets, (u) => u.hp);
  return targets[roll % targets.length]!;
}
