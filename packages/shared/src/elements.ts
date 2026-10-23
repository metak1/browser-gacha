import type { ElementId } from './types';

export const ELEMENTS: Record<ElementId, { label: string; icon: string; color: string }> = {
  flame: { label: 'Flame', icon: '🔥', color: '#ff6b4a' },
  tide: { label: 'Tide', icon: '🌊', color: '#3fa7ff' },
  gale: { label: 'Gale', icon: '🍃', color: '#4fd1a5' },
  stone: { label: 'Stone', icon: '⛰️', color: '#c49a5a' },
  volt: { label: 'Volt', icon: '⚡', color: '#b57bff' },
  frost: { label: 'Frost', icon: '❄️', color: '#8fe3ff' },
};

/** Each element is strong against exactly one other, forming a cycle. */
export const ELEMENT_BEATS: Record<ElementId, ElementId> = {
  flame: 'frost',
  frost: 'gale',
  gale: 'stone',
  stone: 'volt',
  volt: 'tide',
  tide: 'flame',
};

export const ADVANTAGE_MULTIPLIER = 1.3;
export const DISADVANTAGE_MULTIPLIER = 0.8;

export function elementMultiplier(attacker: ElementId, defender: ElementId): number {
  if (ELEMENT_BEATS[attacker] === defender) return ADVANTAGE_MULTIPLIER;
  if (ELEMENT_BEATS[defender] === attacker) return DISADVANTAGE_MULTIPLIER;
  return 1;
}
