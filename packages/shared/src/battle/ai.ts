import { hash32 } from '../rng';
import { STATUS_INFO } from '../statuses';
import { currentActor, hasLivingMinions, hasStatus, isAlive, livingUnits, MAX_SIDE, opposite, ultimateReady, validTargets } from './engine';
import type { BattleAction, BattleState, BattleUnit } from './types';
import type { Skill } from '../types';

const isHealing = (skill: Skill) => skill.effects.some((e) => e.kind === 'heal');
const isPureHeal = (skill: Skill) => skill.effects.every((e) => e.kind === 'heal');
const only = (skill: Skill, kind: Skill['effects'][number]['kind']) => skill.effects.every((e) => e.kind === kind);
const debuffs = (u: BattleUnit) => u.statuses.filter((s) => !STATUS_INFO[s.id].buff).length;
const buffs = (u: BattleUnit) => u.statuses.filter((s) => STATUS_INFO[s.id].buff).length;

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

  // Save pure heals until someone is actually hurt, pure summons until the side is thin, and
  // cleanses, dispels and revives until there's something to remove or someone to bring back.
  const allies = livingUnits(state, actor.side);
  const enemies = livingUnits(state, opposite(actor.side));
  const fallen = state.units.some((u) => u.side === actor.side && !isAlive(u) && !u.summonedBy);
  const worthUsing = (s: Skill) =>
    (!isPureHeal(s) || allies.some((u) => u.hp / u.maxHp < 0.7)) &&
    (!only(s, 'summon') || (allies.length < MAX_SIDE - 1 && !hasLivingMinions(state, actor.uid))) &&
    (!only(s, 'cleanse') || allies.some((u) => debuffs(u) > 0)) &&
    (!only(s, 'dispel') || enemies.some((u) => buffs(u) > 0)) &&
    (!only(s, 'revive') || fallen);

  let kind: BattleAction['kind'] = 'basic';
  let chosen = actor.basic;
  if (hasStatus(actor, 'silence')) {
    // Silenced: basic attacks only.
  } else if (ultimateReady(actor) && worthUsing(actor.ultimate!)) {
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
    if (skill.effects.some((e) => e.kind === 'cleanse') && targets.some((u) => debuffs(u) > 0)) return minBy(targets, (u) => -debuffs(u));
    if (isHealing(skill)) return minBy(targets, (u) => u.hp / u.maxHp);
    // Buffs go to the hardest hitter.
    return minBy(targets, (u) => -u.atk);
  }
  // Break a charging boss before it unleashes.
  const charging = targets.find((u) => u.mech?.charging);
  if (charging) return charging;
  if (skill.effects.some((e) => e.kind === 'dispel') && targets.some((u) => buffs(u) > 0)) return minBy(targets, (u) => -buffs(u));
  const roll = hash32(state.rng, state.turns, actor.uid.charCodeAt(1)) % 100;
  if (roll < 60) return minBy(targets, (u) => u.hp);
  return targets[roll % targets.length]!;
}
