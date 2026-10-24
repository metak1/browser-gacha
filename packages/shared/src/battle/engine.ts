/**
 * Deterministic turn-based battle engine.
 *
 * Given the same BattleSetup and the same sequence of player actions, the engine
 * always produces the same battle. The client plays it live; the server replays
 * the submitted actions to verify the result before granting rewards.
 *
 * Functions mutate the BattleState they are given and return the events that
 * happened, which the client uses for animation and the combat log.
 */
import { elementMultiplier } from '../elements';
import { nextRandom } from '../rng';
import { applyPassiveCombat } from '../skills';
import { BASE_COMBAT } from '../stats';
import { STATUS_INFO, STATUS_MODIFIERS } from '../statuses';
import type { Effect, EffectTarget, PassiveTrigger, ScaleStat, Skill, StatusId } from '../types';
import type { BattleAction, BattleEvent, BattleSetup, BattleState, BattleUnit, Side, UnitSpec } from './types';

export const AV_BASE = 10_000;
export const MAX_TURNS = 300;
/** Kept for reference: the base crit rate and multiplier (see BASE_COMBAT). */
export const CRIT_RATE = BASE_COMBAT.critRate;
export const CRIT_MULTIPLIER = 1 + BASE_COMBAT.critDmg;
/** DEF reduces damage by def / (def + DEF_CONSTANT). */
export const DEF_CONSTANT = 300;

/** Most living units a side can have at once (summons stop at this). */
export const MAX_SIDE = 5;

/** Energy: units start part-way, gain it by acting and by being hit; the ultimate empties it. */
export const ENERGY = { max: 100, start: 20, basic: 25, skill: 35, hit: 8 } as const;

// ---------- setup ----------

function makeUnit(spec: UnitSpec, side: Side, index: number): BattleUnit {
  const stats = spec.stats;
  return {
    uid: `${side === 'ally' ? 'a' : 'e'}${index}`,
    side,
    kind: spec.kind,
    defId: spec.id,
    name: spec.name,
    emoji: spec.emoji,
    sprite: spec.sprite ?? null,
    element: spec.element,
    role: spec.role,
    boss: spec.boss,
    level: spec.level,
    maxHp: stats.hp,
    hp: stats.hp,
    atk: stats.atk,
    def: stats.def,
    spd: stats.spd,
    // Older setups have no combat stats: they get the old fixed crits plus any passive crit chance.
    combat: spec.combat ? { ...spec.combat } : applyPassiveCombat(BASE_COMBAT, spec.passive),
    shield: 0,
    av: AV_BASE / stats.spd,
    cooldown: 0,
    energy: ENERGY.start,
    statuses: [],
    basic: spec.basic,
    skill: spec.skill,
    ultimate: spec.ultimate ?? null,
    passive: spec.passive ?? null,
    ...(spec.friend ? { friend: spec.friend } : {}),
    ...(spec.mechanics
      ? {
          mechanics: spec.mechanics,
          mech: { chargeIn: spec.mechanics.charge?.every ?? 0, charging: null, enraged: false, addsDone: 0 },
        }
      : {}),
  };
}

export function startBattle(setup: BattleSetup): { state: BattleState; events: BattleEvent[] } {
  if (!setup.allies.length || !setup.enemies.length) throw new Error('Both sides need at least one unit');
  const state: BattleState = {
    units: [...setup.allies.map((u, i) => makeUnit(u, 'ally', i)), ...setup.enemies.map((u, i) => makeUnit(u, 'enemy', i))],
    rng: setup.seed | 0,
    turns: 0,
    actorUid: null,
    outcome: 'ongoing',
    wave: 1,
    waves: 1,
    reserve: structuredClone(setup.waves ?? []).filter((w) => w.length > 0),
    summons: structuredClone(setup.summons ?? {}),
    spawned: setup.enemies.length,
    turnLimit: Math.min(MAX_TURNS, setup.turnLimit ?? MAX_TURNS),
  };
  state.waves = 1 + state.reserve.length;
  const events: BattleEvent[] = [];
  for (const u of state.units) {
    if (state.outcome !== 'ongoing') break;
    if (isAlive(u)) firePassive(state, u, 'battleStart', null, events);
  }
  advanceToNextTurn(state, events);
  return { state, events };
}

// ---------- queries ----------

export const isAlive = (u: BattleUnit) => u.hp > 0;
export const opposite = (side: Side): Side => (side === 'ally' ? 'enemy' : 'ally');

export function getUnit(state: BattleState, uid: string): BattleUnit | undefined {
  return state.units.find((u) => u.uid === uid);
}

export function livingUnits(state: BattleState, side: Side): BattleUnit[] {
  return state.units.filter((u) => u.side === side && isAlive(u));
}

export function currentActor(state: BattleState): BattleUnit | null {
  return state.actorUid ? (getUnit(state, state.actorUid) ?? null) : null;
}

export function hasStatus(u: BattleUnit, id: StatusId): boolean {
  return u.statuses.some((s) => s.id === id);
}

export function effectiveStat(u: BattleUnit, stat: 'atk' | 'def' | 'spd'): number {
  let mult = 1;
  if (stat === 'atk' && hasStatus(u, 'atkUp')) mult += STATUS_MODIFIERS.atkUp;
  if (stat === 'def' && hasStatus(u, 'defUp')) mult += STATUS_MODIFIERS.defUp;
  if (stat === 'def' && hasStatus(u, 'defDown')) mult -= STATUS_MODIFIERS.defDown;
  if (stat === 'spd' && hasStatus(u, 'spdUp')) mult += STATUS_MODIFIERS.spdUp;
  if (stat === 'atk' && hasStatus(u, 'atkDown')) mult -= STATUS_MODIFIERS.atkDown;
  if (stat === 'spd' && hasStatus(u, 'spdDown')) mult -= STATUS_MODIFIERS.spdDown;
  return u[stat] * mult;
}

export function skillFor(unit: BattleUnit, kind: BattleAction['kind']): Skill | null {
  if (kind === 'ultimate') return unit.ultimate;
  return kind === 'skill' ? unit.skill : unit.basic;
}

export const ultimateReady = (u: BattleUnit) => Boolean(u.ultimate) && u.energy >= ENERGY.max;

/** Units the actor may pick for this skill. Taunting enemies must be targeted first. */
export function validTargets(state: BattleState, actor: BattleUnit, skill: Skill): BattleUnit[] {
  if (skill.targeting === 'none') return [];
  const side = skill.targeting === 'ally' ? actor.side : opposite(actor.side);
  const pool = livingUnits(state, side);
  if (skill.targeting === 'enemy') {
    const taunters = pool.filter((u) => hasStatus(u, 'taunt'));
    if (taunters.length) return taunters;
  }
  return pool;
}

/** Returns why an action is illegal right now, or null if it's fine. */
export function validateAction(state: BattleState, action: BattleAction): string | null {
  if (state.outcome !== 'ongoing') return 'The battle is over';
  const actor = currentActor(state);
  if (!actor) return 'No unit is waiting to act';
  if (action.kind !== 'basic' && action.kind !== 'skill' && action.kind !== 'ultimate') return 'Unknown action';
  const skill = skillFor(actor, action.kind);
  if (!skill) return `${actor.name} has no ${action.kind}`;
  if (action.kind !== 'basic' && hasStatus(actor, 'silence')) return `${actor.name} is silenced`;
  if (action.kind === 'skill' && actor.cooldown > 0) return `${skill.name} is on cooldown`;
  if (action.kind === 'ultimate' && actor.energy < ENERGY.max) return `${skill.name} needs full energy`;
  if (skill.targeting === 'none') return null;
  if (!action.target || !validTargets(state, actor, skill).some((u) => u.uid === action.target)) {
    return 'Invalid target';
  }
  return null;
}

/** Predicts the next `count` turns from the current action values. */
export function predictTurnOrder(state: BattleState, count: number): string[] {
  const sim = state.units.filter(isAlive).map((u) => ({ uid: u.uid, av: u.uid === state.actorUid ? 0 : u.av, step: AV_BASE / effectiveStat(u, 'spd') }));
  const order: string[] = [];
  if (!sim.length) return order;
  while (order.length < count) {
    let next = sim[0]!;
    for (const s of sim) if (s.av < next.av) next = s;
    const dt = next.av;
    for (const s of sim) s.av -= dt;
    order.push(next.uid);
    next.av = next.step;
  }
  return order;
}

// ---------- actions ----------

/** Performs the current actor's action, then advances to the next turn. */
export function act(state: BattleState, action: BattleAction): BattleEvent[] {
  const error = validateAction(state, action);
  if (error) throw new Error(error);
  const actor = currentActor(state)!;
  const skill = skillFor(actor, action.kind)!;
  const target = skill.targeting === 'none' ? null : getUnit(state, action.target!)!;

  const events: BattleEvent[] = [{ type: 'action', actor: actor.uid, kind: action.kind, skill: skill.name, target: target?.uid ?? null }];
  // Spend energy up front so hits taken during the ultimate don't refill it mid-cast.
  if (action.kind === 'ultimate') actor.energy = 0;
  for (const effect of skill.effects) {
    applyEffect(state, actor, target, effect, events);
    if (state.outcome !== 'ongoing') return events;
  }
  if (action.kind === 'skill') actor.cooldown = skill.cooldown;
  if (action.kind !== 'ultimate') actor.energy = Math.min(ENERGY.max, actor.energy + ENERGY[action.kind]);

  endTurn(state, actor);
  advanceToNextTurn(state, events);
  return events;
}

// ---------- internals ----------

function rand(state: BattleState): number {
  const [value, next] = nextRandom(state.rng);
  state.rng = next;
  return value;
}

function resolveTargets(state: BattleState, actor: BattleUnit, target: BattleUnit | null, to: EffectTarget): BattleUnit[] {
  switch (to) {
    case 'lowestAlly': {
      const allies = livingUnits(state, actor.side);
      if (!allies.length) return [];
      let low = allies[0]!;
      for (const u of allies) if (u.hp / u.maxHp < low.hp / low.maxHp) low = u;
      return [low];
    }
    case 'target':
      return target && isAlive(target) ? [target] : [];
    case 'self':
      return isAlive(actor) ? [actor] : [];
    case 'allEnemies':
      return livingUnits(state, opposite(actor.side));
    case 'allAllies':
      return livingUnits(state, actor.side);
  }
}

/** What an effect's multiplier applies to: ATK by default, or DEF, max HP, or ATK boosted by SPD. */
function scaleBase(u: BattleUnit, scale: ScaleStat = 'atk'): number {
  switch (scale) {
    case 'def':
      return effectiveStat(u, 'def');
    case 'hp':
      return u.maxHp;
    case 'spd':
      return (effectiveStat(u, 'atk') * effectiveStat(u, 'spd')) / 100;
    default:
      return effectiveStat(u, 'atk');
  }
}

/**
 * Chance a status lands. Debuffs on an opponent use the base chance (100% when the
 * spell has none) × (1 + caster's Effect Hit) × (1 − target's Effect RES).
 */
function statusChance(actor: BattleUnit, target: BattleUnit, effect: Effect & { kind: 'status' }): number | undefined {
  if (STATUS_INFO[effect.status].buff || actor.side === target.side) return effect.chance;
  const chance = (effect.chance ?? 1) * (1 + actor.combat.effectHit) * (1 - target.combat.effectRes);
  // A sure debuff with nothing reducing it stays sure (and draws no random number).
  return effect.chance === undefined && chance >= 1 ? undefined : Math.max(0, Math.min(1, chance));
}

/** Multiplier from the attacker's passive for hitting this defender. */
function passiveDamageBonus(attacker: BattleUnit, defender: BattleUnit): number {
  let bonus = 0;
  for (const r of attacker.passive?.rules ?? []) {
    if (r.kind === 'damageVsStatus' && hasStatus(defender, r.status)) bonus += r.amount;
    if (r.kind === 'lowHpDamage' && attacker.hp / attacker.maxHp < r.threshold) bonus += r.amount;
  }
  return 1 + bonus;
}

/**
 * Runs a unit's passive triggers for an event. `target` is the attacker for
 * "hit" triggers. Effects from passives can't set off further "hit" triggers,
 * so two retaliating units can't loop forever.
 */
function firePassive(state: BattleState, unit: BattleUnit, on: PassiveTrigger, target: BattleUnit | null, events: BattleEvent[]) {
  for (const rule of unit.passive?.rules ?? []) {
    if (rule.kind !== 'trigger' || rule.on !== on) continue;
    if (rule.chance !== undefined && rand(state) >= rule.chance) continue;
    events.push({ type: 'passive', unit: unit.uid, name: unit.passive!.name });
    for (const effect of rule.effects) {
      applyEffect(state, unit, target, effect, events, true);
      if (state.outcome !== 'ongoing') return;
    }
  }
}

/** Key for a summonable unit in BattleSetup.summons. */
export const summonKey = (unitId: string, level: number) => `${unitId}@${level}`;

function newUid(state: BattleState, side: Side): string {
  if (side === 'enemy') return `e${state.spawned++}`;
  return `a${state.units.filter((u) => u.side === 'ally').length}`;
}

/** Brings units onto the field; they wait a full turn before acting. */
function spawnUnits(state: BattleState, specs: UnitSpec[], side: Side, events: BattleEvent[], reason: 'wave' | 'summon', source: string | null) {
  const units = specs.map((spec) => {
    const u = makeUnit(spec, side, 0);
    u.uid = newUid(state, side);
    if (reason === 'summon' && source) u.summonedBy = source;
    return u;
  });
  state.units.push(...units);
  events.push({ type: 'spawn', reason, units: structuredClone(units), source, wave: state.wave });
  for (const u of units) {
    if (state.outcome !== 'ongoing') return;
    firePassive(state, u, 'battleStart', null, events);
  }
}

/** The next wave replaces the defeated enemies. */
function nextWave(state: BattleState, events: BattleEvent[]) {
  const specs = state.reserve.shift()!;
  state.units = state.units.filter((u) => u.side === 'ally' || isAlive(u));
  state.wave++;
  spawnUnits(state, specs, 'enemy', events, 'wave', null);
}

/** True while any unit this one summoned is still standing (it can't summon more until they fall). */
export const hasLivingMinions = (state: BattleState, uid: string) => state.units.some((u) => u.summonedBy === uid && isAlive(u));

function summon(state: BattleState, actor: BattleUnit, effect: Effect & { kind: 'summon' }, events: BattleEvent[]) {
  if (hasLivingMinions(state, actor.uid)) return;
  const spec = state.summons[summonKey(effect.unit, actor.level)];
  if (!spec) return;
  const room = MAX_SIDE - livingUnits(state, actor.side).length;
  const count = Math.min(effect.count, room);
  if (count <= 0) return;
  spawnUnits(
    state,
    Array.from({ length: count }, () => structuredClone(spec)),
    actor.side,
    events,
    'summon',
    actor.uid,
  );
}

function applyEffect(state: BattleState, actor: BattleUnit, target: BattleUnit | null, effect: Effect, events: BattleEvent[], fromPassive = false) {
  if (effect.kind === 'summon') {
    if (isAlive(actor)) summon(state, actor, effect, events);
    return;
  }
  if (effect.kind === 'revive') {
    revive(state, actor, effect, events);
    return;
  }
  const atk = effectiveStat(actor, 'atk');
  for (const t of resolveTargets(state, actor, target, effect.to)) {
    switch (effect.kind) {
      case 'damage': {
        const def = effectiveStat(t, 'def') * (1 - (effect.pierce ?? 0));
        const elem = elementMultiplier(actor.element, t.element);
        const advantage = elem > 1 ? 'strong' : elem < 1 ? 'weak' : null;
        const hits = effect.hits ?? 1;
        let dealt = 0;
        // Multi-hit spreads the multiplier over the hits; each one rolls its own crit.
        for (let h = 0; h < hits && isAlive(t); h++) {
          const crit = rand(state) < actor.combat.critRate;
          const variance = 0.95 + rand(state) * 0.1;
          const bonus = passiveDamageBonus(actor, t);
          const raw =
            scaleBase(actor, effect.scale) *
            (effect.mult / hits) *
            (1 - def / (def + DEF_CONSTANT)) *
            elem *
            (crit ? 1 + actor.combat.critDmg : 1) *
            variance *
            bonus;
          const amount = Math.max(1, Math.round(raw));
          dealt += amount;
          dealDamage(state, actor.uid, t, amount, crit, advantage, events, undefined, fromPassive);
          if (state.outcome !== 'ongoing') return;
        }
        if (effect.lifesteal && isAlive(actor)) {
          const amount = Math.min(actor.maxHp - actor.hp, Math.round(dealt * effect.lifesteal));
          actor.hp += amount;
          events.push({ type: 'heal', source: actor.uid, target: actor.uid, amount });
        }
        break;
      }
      case 'heal': {
        const amount = Math.min(t.maxHp - t.hp, Math.round(scaleBase(actor, effect.scale) * effect.mult));
        t.hp += amount;
        events.push({ type: 'heal', source: actor.uid, target: t.uid, amount });
        break;
      }
      case 'shield': {
        const amount = Math.round(scaleBase(actor, effect.scale) * effect.mult);
        t.shield = Math.min(t.maxHp, t.shield + amount);
        events.push({ type: 'shield', source: actor.uid, target: t.uid, amount });
        break;
      }
      case 'status': {
        const debuffing = !STATUS_INFO[effect.status].buff && actor.side !== t.side;
        if (debuffing && hasStatus(t, 'immunity')) {
          events.push({ type: 'statusResisted', target: t.uid, status: effect.status, immune: true });
          break;
        }
        const chance = statusChance(actor, t, effect);
        if (chance !== undefined && rand(state) >= chance) {
          events.push({ type: 'statusResisted', target: t.uid, status: effect.status });
          break;
        }
        const value = statusValue(effect.status, atk, t);
        const fresh = t.uid === state.actorUid;
        const existing = t.statuses.find((s) => s.id === effect.status);
        if (existing) {
          existing.turns = Math.max(existing.turns, effect.turns);
          existing.value = Math.max(existing.value, value);
          existing.fresh = existing.fresh || fresh;
        } else {
          t.statuses.push({ id: effect.status, turns: effect.turns, value, fresh });
        }
        events.push({ type: 'statusApplied', target: t.uid, status: effect.status, turns: effect.turns });
        break;
      }
      case 'advance': {
        if (t.uid === state.actorUid) break; // the actor's gauge resets at end of turn anyway
        const amount = effect.amount * (AV_BASE / effectiveStat(t, 'spd'));
        t.av = Math.max(0, t.av - amount);
        events.push({ type: 'advance', target: t.uid, amount: effect.amount });
        break;
      }
      case 'delay': {
        if (t.uid === state.actorUid) break;
        t.av += effect.amount * (AV_BASE / effectiveStat(t, 'spd'));
        events.push({ type: 'delay', target: t.uid, amount: effect.amount });
        break;
      }
      case 'energy': {
        t.energy = Math.min(ENERGY.max, t.energy + effect.amount);
        break;
      }
      case 'cleanse':
      case 'dispel': {
        const buffs = effect.kind === 'dispel';
        const removed = t.statuses.filter((s) => STATUS_INFO[s.id].buff === buffs).map((s) => s.id);
        if (!removed.length) break;
        t.statuses = t.statuses.filter((s) => STATUS_INFO[s.id].buff !== buffs);
        events.push({ type: 'statusRemoved', target: t.uid, statuses: removed });
        break;
      }
      default:
        break;
    }
  }
}

/** What a status stores when applied: burn and poison damage per tick, regen healing per tick. */
function statusValue(id: StatusId, applierAtk: number, target: BattleUnit): number {
  switch (id) {
    case 'burn':
      return Math.round(applierAtk * STATUS_MODIFIERS.burn);
    case 'poison': {
      const tick = target.maxHp * STATUS_MODIFIERS.poison;
      return Math.max(1, Math.round(target.boss ? Math.min(tick, applierAtk * STATUS_MODIFIERS.poisonBossCap) : tick));
    }
    case 'regen':
      return Math.max(1, Math.round(target.maxHp * STATUS_MODIFIERS.regen));
    default:
      return 0;
  }
}

/** Brings fallen units of the caster's side back: all of them, or the first to have fallen. */
function revive(state: BattleState, actor: BattleUnit, effect: Effect & { kind: 'revive' }, events: BattleEvent[]) {
  const fallen = state.units.filter((u) => u.side === actor.side && !isAlive(u) && !u.summonedBy);
  for (const u of effect.to === 'allAllies' ? fallen : fallen.slice(0, 1)) {
    if (livingUnits(state, actor.side).length >= MAX_SIDE) return;
    u.hp = Math.max(1, Math.round(u.maxHp * effect.amount));
    u.av = AV_BASE / effectiveStat(u, 'spd');
    events.push({ type: 'revive', source: actor.uid, target: u.uid, hp: u.hp });
  }
}

function dealDamage(
  state: BattleState,
  source: string | null,
  target: BattleUnit,
  amount: number,
  crit: boolean,
  advantage: 'strong' | 'weak' | null,
  events: BattleEvent[],
  status?: StatusId,
  fromPassive = false,
) {
  const absorbed = Math.min(target.shield, amount);
  target.shield -= absorbed;
  target.hp = Math.max(0, target.hp - (amount - absorbed));
  if (target.hp > 0) target.energy = Math.min(ENERGY.max, target.energy + ENERGY.hit);
  events.push({ type: 'damage', source, target: target.uid, amount, absorbed, crit, advantage, ...(status ? { status } : {}) });
  if (target.mech && target.hp > 0) bossDamaged(state, target, amount - absorbed, events);
  const attacker = source ? getUnit(state, source) : undefined;
  if (target.hp === 0) {
    target.statuses = [];
    target.shield = 0;
    events.push({ type: 'defeated', target: target.uid });
    checkOutcome(state, events);
    if (state.outcome === 'ongoing' && attacker && isAlive(attacker) && attacker.side !== target.side) {
      firePassive(state, attacker, 'kill', null, events);
    }
  } else if (!fromPassive && attacker && attacker.side !== target.side) {
    firePassive(state, target, 'hit', attacker, events);
  }
}

// ---------- boss mechanics ----------

/** Damage taken can break a charge, set off the enrage, and call adds. */
function bossDamaged(state: BattleState, boss: BattleUnit, dealt: number, events: BattleEvent[]) {
  const m = boss.mech!;
  const mech = boss.mechanics!;
  if (m.charging) {
    m.charging.taken += dealt;
    if (m.charging.taken >= m.charging.need) {
      events.push({ type: 'mechanic', unit: boss.uid, kind: 'break', name: m.charging.skill.name });
      m.charging = null;
      // Stunned for its next turn (or this one, when a burn tick at its turn start broke the charge).
      const stun = boss.statuses.find((s) => s.id === 'stun');
      if (stun) stun.turns = Math.max(stun.turns, 1);
      else boss.statuses.push({ id: 'stun', turns: 1, value: 0, fresh: false });
      events.push({ type: 'statusApplied', target: boss.uid, status: 'stun', turns: 1 });
    }
  }
  const frac = boss.hp / boss.maxHp;
  if (mech.enrage && !m.enraged && frac < mech.enrage.below) {
    m.enraged = true;
    boss.atk = Math.round(boss.atk * mech.enrage.atk);
    boss.spd = Math.round(boss.spd * mech.enrage.spd);
    events.push({ type: 'mechanic', unit: boss.uid, kind: 'enrage', name: boss.name });
  }
  const adds = mech.adds;
  while (adds && m.addsDone < adds.at.length && frac <= adds.at[m.addsDone]!) {
    m.addsDone++;
    const spec = state.summons[summonKey(adds.unit, boss.level)];
    const count = Math.min(adds.count, MAX_SIDE - livingUnits(state, boss.side).length);
    if (!spec || count <= 0 || state.outcome !== 'ongoing') continue;
    events.push({ type: 'mechanic', unit: boss.uid, kind: 'adds', name: spec.name });
    spawnUnits(
      state,
      Array.from({ length: count }, () => structuredClone(spec)),
      boss.side,
      events,
      'summon',
      boss.uid,
    );
  }
}

/**
 * Runs a boss's scripted turn, if this is one: it either starts charging or
 * unleashes a finished charge. Returns true when the turn was used up.
 */
function bossTurn(state: BattleState, boss: BattleUnit, events: BattleEvent[]): boolean {
  const m = boss.mech;
  const charge = boss.mechanics?.charge;
  if (!m || !charge) return false;
  if (m.charging) {
    const skill = m.charging.skill;
    m.charging = null;
    events.push({ type: 'mechanic', unit: boss.uid, kind: 'unleash', name: skill.name });
    const targets = skill.targeting === 'none' ? [] : validTargets(state, boss, skill);
    const target = targets.length ? targets[Math.floor(rand(state) * targets.length)]! : null;
    events.push({ type: 'action', actor: boss.uid, kind: 'skill', skill: skill.name, target: target?.uid ?? null });
    for (const effect of skill.effects) {
      applyEffect(state, boss, target, effect, events);
      if (state.outcome !== 'ongoing') return true;
    }
    endTurn(state, boss);
    return true;
  }
  if (--m.chargeIn > 0) return false;
  m.chargeIn = charge.every;
  m.charging = { skill: charge.skill, taken: 0, need: charge.breakHp };
  events.push({ type: 'mechanic', unit: boss.uid, kind: 'charge', name: charge.skill.name });
  endTurn(state, boss);
  return true;
}

function checkOutcome(state: BattleState, events: BattleEvent[]) {
  if (state.outcome !== 'ongoing') return;
  // With waves still to come, the next one arrives at the start of the next turn.
  const enemiesLeft = livingUnits(state, 'enemy').length > 0;
  if (!enemiesLeft && !state.reserve.length) finish(state, 'victory', events);
  else if (!livingUnits(state, 'ally').length) finish(state, 'defeat', events);
}

function finish(state: BattleState, outcome: 'victory' | 'defeat', events: BattleEvent[]) {
  state.outcome = outcome;
  state.actorUid = null;
  events.push({ type: 'end', outcome });
}

function endTurn(state: BattleState, unit: BattleUnit) {
  for (const s of unit.statuses) {
    if (s.fresh) s.fresh = false;
    else s.turns--;
  }
  unit.statuses = unit.statuses.filter((s) => s.turns > 0);
  unit.av = AV_BASE / effectiveStat(unit, 'spd');
  state.turns++;
  state.actorUid = null;
}

/** Moves time forward until a unit is ready to choose an action (or the battle ends). */
function advanceToNextTurn(state: BattleState, events: BattleEvent[]) {
  while (state.outcome === 'ongoing') {
    if (state.turns >= state.turnLimit) {
      finish(state, 'defeat', events);
      return;
    }
    if (!livingUnits(state, 'enemy').length && state.reserve.length) {
      nextWave(state, events);
      continue;
    }
    const living = state.units.filter(isAlive);
    let next = living[0]!;
    for (const u of living) if (u.av < next.av) next = u;
    const dt = next.av;
    for (const u of living) u.av -= dt;
    next.av = 0;

    state.actorUid = next.uid;
    events.push({ type: 'turnStart', actor: next.uid });
    if (next.cooldown > 0) next.cooldown--;

    for (const s of next.statuses) {
      if ((s.id === 'burn' || s.id === 'poison') && isAlive(next)) dealDamage(state, null, next, s.value, false, null, events, s.id);
    }
    if (state.outcome !== 'ongoing') return;
    if (!isAlive(next)) continue;
    const regen = next.statuses.find((s) => s.id === 'regen');
    if (regen) {
      const amount = Math.min(next.maxHp - next.hp, regen.value);
      next.hp += amount;
      events.push({ type: 'heal', source: next.uid, target: next.uid, amount });
    }

    firePassive(state, next, 'turnStart', null, events);
    if (state.outcome !== 'ongoing') return;
    if (!isAlive(next)) continue;

    if (hasStatus(next, 'stun')) {
      events.push({ type: 'stunned', actor: next.uid });
      endTurn(state, next);
      continue;
    }
    if (bossTurn(state, next, events)) {
      if (state.outcome !== 'ongoing') return;
      continue;
    }
    return;
  }
}
