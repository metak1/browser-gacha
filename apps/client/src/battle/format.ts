import { getUnit, STATUS_INFO, type BattleEvent, type BattleState } from '@gacha/shared';

export type PopupKind = 'damage' | 'crit' | 'heal' | 'shield' | 'buff' | 'debuff' | 'miss' | 'passive';

/** Text that floats over a unit when an event lands on it. */
export function popupFor(e: BattleEvent): { uid: string; text: string; kind: PopupKind } | null {
  switch (e.type) {
    case 'damage':
      return { uid: e.target, text: `-${e.amount}${e.crit ? '!' : ''}`, kind: e.crit ? 'crit' : 'damage' };
    case 'heal':
      return e.amount > 0 ? { uid: e.target, text: `+${e.amount}`, kind: 'heal' } : null;
    case 'shield':
      return { uid: e.target, text: `🛡 ${e.amount}`, kind: 'shield' };
    case 'statusApplied': {
      const info = STATUS_INFO[e.status];
      return { uid: e.target, text: `${info.icon} ${info.label}`, kind: info.buff ? 'buff' : 'debuff' };
    }
    case 'statusResisted':
      return { uid: e.target, text: 'Resisted', kind: 'miss' };
    case 'stunned':
      return { uid: e.actor, text: '💫 Stunned', kind: 'debuff' };
    case 'passive':
      return { uid: e.unit, text: `✦ ${e.name}`, kind: 'passive' };
    case 'spawn':
      return e.source ? { uid: e.source, text: '✦ Summon!', kind: 'passive' } : null;
    case 'mechanic':
      return e.kind === 'break'
        ? { uid: e.unit, text: 'BREAK!', kind: 'crit' }
        : e.kind === 'enrage'
          ? { uid: e.unit, text: '😡 Enraged!', kind: 'debuff' }
          : e.kind === 'charge'
            ? { uid: e.unit, text: '⚠ Charging', kind: 'debuff' }
            : null;
    default:
      return null;
  }
}

/** The big alert shown across the stage when a boss mechanic fires. */
export function mechanicAlert(e: BattleEvent & { type: 'mechanic' }, state: BattleState): { title: string; text: string } | null {
  const boss = getUnit(state, e.unit);
  if (!boss) return null;
  switch (e.kind) {
    case 'charge': {
      const need = boss.mechanics?.charge?.breakHp ?? 0;
      return { title: `⚠ ${boss.name} is charging ${e.name}!`, text: `Deal ${need.toLocaleString()} damage to it before its next turn to break it.` };
    }
    case 'break':
      return { title: 'BREAK!', text: `${e.name} is cancelled, and ${boss.name} is stunned.` };
    case 'enrage':
      return { title: `😡 ${boss.name} is enraged!`, text: 'Its attack and speed rise. Finish it quickly!' };
    case 'adds':
      return { title: `📯 ${boss.name} calls for help!`, text: `${e.name} joins the fight.` };
    default:
      return null;
  }
}

/** One combat-log line per event, or null for events not worth logging. */
export function describeEvent(e: BattleEvent, state: BattleState): string | null {
  const name = (uid: string) => getUnit(state, uid)?.name ?? uid;
  switch (e.type) {
    case 'action': {
      const on = e.target && e.target !== e.actor ? ` on ${name(e.target)}` : '';
      return `${name(e.actor)} uses ${e.skill}${on}.`;
    }
    case 'damage': {
      if (e.status === 'burn') return `${name(e.target)} burns for ${e.amount}.`;
      const notes = [e.crit && 'critical', e.advantage === 'strong' && 'super effective', e.advantage === 'weak' && 'resisted']
        .filter(Boolean)
        .join(', ');
      return `${name(e.target)} takes ${e.amount} damage${notes ? ` (${notes})` : ''}.`;
    }
    case 'heal':
      return `${name(e.target)} recovers ${e.amount} HP.`;
    case 'shield':
      return `${name(e.target)} gains a ${e.amount} shield.`;
    case 'statusApplied':
      return `${name(e.target)} gains ${STATUS_INFO[e.status].label} (${e.turns}).`;
    case 'statusResisted':
      return `${name(e.target)} resists ${STATUS_INFO[e.status].label}.`;
    case 'stunned':
      return `${name(e.actor)} is stunned and can't move!`;
    case 'passive':
      return `${name(e.unit)}'s ${e.name} activates.`;
    case 'spawn': {
      const who = e.units.map((u) => u.name).join(', ');
      return e.reason === 'wave' ? `Wave ${e.wave}: ${who} appear!` : `${name(e.source ?? '')} summons ${who}!`;
    }
    case 'mechanic':
      return e.kind === 'charge'
        ? `${name(e.unit)} is charging ${e.name}! Deal heavy damage to break it.`
        : e.kind === 'unleash'
          ? `${name(e.unit)} unleashes ${e.name}!`
          : e.kind === 'break'
            ? `${name(e.unit)}'s ${e.name} is broken!`
            : e.kind === 'enrage'
              ? `${name(e.unit)} is enraged!`
              : `${name(e.unit)} calls for help!`;
    case 'defeated':
      return `${name(e.target)} is defeated!`;
    case 'end':
      return e.outcome === 'victory' ? 'Victory!' : 'Your team has fallen…';
    default:
      return null;
  }
}
