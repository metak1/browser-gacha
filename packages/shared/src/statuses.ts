import type { StatusId } from './types';

export const STATUS_INFO: Record<StatusId, { label: string; icon: string; buff: boolean; description: string }> = {
  burn: { label: 'Burn', icon: '🔥', buff: false, description: 'Takes damage at the start of each turn.' },
  stun: { label: 'Stun', icon: '💫', buff: false, description: 'Skips its next turn.' },
  atkUp: { label: 'ATK Up', icon: '⚔️', buff: true, description: '+30% ATK.' },
  defUp: { label: 'DEF Up', icon: '🛡️', buff: true, description: '+40% DEF.' },
  defDown: { label: 'DEF Down', icon: '💔', buff: false, description: '-30% DEF.' },
  spdUp: { label: 'SPD Up', icon: '💨', buff: true, description: '+20% SPD.' },
  taunt: { label: 'Taunt', icon: '🎯', buff: true, description: 'Enemies must target this unit.' },
  poison: { label: 'Poison', icon: '☠️', buff: false, description: 'Loses 6% of max HP at the start of each turn.' },
  regen: { label: 'Regen', icon: '🌿', buff: true, description: 'Heals 10% of max HP at the start of each turn.' },
  atkDown: { label: 'ATK Down', icon: '🔻', buff: false, description: '-30% ATK.' },
  spdDown: { label: 'SPD Down', icon: '🐌', buff: false, description: '-20% SPD.' },
  silence: { label: 'Silence', icon: '🔇', buff: false, description: 'Can only use its basic attack.' },
  immunity: { label: 'Immunity', icon: '✨', buff: true, description: 'Blocks new debuffs from enemies.' },
};

export const STATUS_MODIFIERS = {
  atkUp: 0.3,
  defUp: 0.4,
  defDown: 0.3,
  spdUp: 0.2,
  /** Burn damage per tick, as a fraction of the applier's ATK. */
  burn: 0.4,
  atkDown: 0.3,
  spdDown: 0.2,
  /** Poison per tick, as a fraction of the target's max HP… */
  poison: 0.06,
  /** …but on bosses at most this many times the applier's ATK. */
  poisonBossCap: 1.5,
  /** Regen per tick, as a fraction of max HP. */
  regen: 0.1,
} as const;
