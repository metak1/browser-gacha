import type { BattleEvent, BattleState } from '@gacha/shared';

/**
 * Applies one event to the on-screen battle state, so HP bars and statuses
 * change at the moment each hit lands rather than all at once. The engine's
 * authoritative snapshot replaces this display state at the end of each step.
 */
export function applyEvent(s: BattleState, e: BattleEvent): BattleState {
  const next: BattleState = { ...s, units: s.units.map((u) => ({ ...u })) };
  const unit = (uid: string) => next.units.find((u) => u.uid === uid)!;

  switch (e.type) {
    case 'turnStart':
      next.actorUid = e.actor;
      break;
    case 'damage': {
      const t = unit(e.target);
      t.shield = Math.max(0, t.shield - e.absorbed);
      t.hp = Math.max(0, t.hp - (e.amount - e.absorbed));
      if (t.mech?.charging) t.mech = { ...t.mech, charging: { ...t.mech.charging, taken: t.mech.charging.taken + e.amount - e.absorbed } };
      break;
    }
    case 'mechanic': {
      const t = unit(e.unit);
      if (!t.mech) break;
      const charge = t.mechanics?.charge;
      if (e.kind === 'charge' && charge) t.mech = { ...t.mech, charging: { skill: charge.skill, taken: 0, need: charge.breakHp } };
      if (e.kind === 'break' || e.kind === 'unleash') t.mech = { ...t.mech, charging: null };
      if (e.kind === 'enrage') t.mech = { ...t.mech, enraged: true };
      break;
    }
    case 'heal': {
      const t = unit(e.target);
      t.hp = Math.min(t.maxHp, t.hp + e.amount);
      break;
    }
    case 'shield': {
      const t = unit(e.target);
      t.shield = Math.min(t.maxHp, t.shield + e.amount);
      break;
    }
    case 'statusApplied': {
      const t = unit(e.target);
      t.statuses = [...t.statuses.filter((x) => x.id !== e.status), { id: e.status, turns: e.turns, value: 0, fresh: false }];
      break;
    }
    case 'statusRemoved': {
      const t = unit(e.target);
      t.statuses = t.statuses.filter((x) => !e.statuses.includes(x.id));
      break;
    }
    case 'revive': {
      const t = unit(e.target);
      t.hp = e.hp;
      break;
    }
    case 'defeated': {
      const t = unit(e.target);
      t.hp = 0;
      t.shield = 0;
      t.statuses = [];
      break;
    }
    case 'spawn':
      // A new wave replaces the defeated enemies; summons join the field.
      if (e.reason === 'wave') next.units = next.units.filter((u) => u.side === 'ally' || u.hp > 0);
      next.units.push(...structuredClone(e.units));
      next.wave = e.wave;
      break;
    case 'end':
      next.outcome = e.outcome;
      next.actorUid = null;
      break;
    default:
      break;
  }
  return next;
}
