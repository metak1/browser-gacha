import type { StatusId } from './types';

export const STATUS_INFO: Record<StatusId, { label: string; icon: string; buff: boolean; description: string }> = {
  burn: { label: 'Burn', icon: '🔥', buff: false, description: 'Takes damage at the start of each turn.' },
  stun: { label: 'Stun', icon: '💫', buff: false, description: 'Skips its next turn.' },
  atkUp: { label: 'ATK Up', icon: '⚔️', buff: true, description: '+30% ATK.' },
  defUp: { label: 'DEF Up', icon: '🛡️', buff: true, description: '+40% DEF.' },
  defDown: { label: 'DEF Down', icon: '💔', buff: false, description: '-30% DEF.' },
  spdUp: { label: 'SPD Up', icon: '💨', buff: true, description: '+20% SPD.' },
  taunt: { label: 'Taunt', icon: '🎯', buff: true, description: 'Enemies must target this unit.' },
};

export const STATUS_MODIFIERS = {
  atkUp: 0.3,
  defUp: 0.4,
  defDown: 0.3,
  spdUp: 0.2,
  /** Burn damage per tick, as a fraction of the applier's ATK. */
  burn: 0.4,
} as const;
