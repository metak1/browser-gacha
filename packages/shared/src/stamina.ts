import type { StaminaSettings } from './content/types';

export interface StaminaState {
  current: number;
  max: number;
  /** When the next point regenerates (ms), or null when full. */
  nextAt: number | null;
}

/**
 * Stamina is stored as a value plus the time it was last settled. It regenerates
 * one point per \`regenMinutes\` up to \`max\`; refills can push it above max, and
 * then it doesn't regenerate until it drops back under. A null value means full.
 */
export function staminaAt(settings: StaminaSettings, stored: number | null, storedAt: number, now: number): StaminaState & { settledAt: number } {
  const max = settings.max;
  if (stored === null) return { current: max, max, nextAt: null, settledAt: now };
  if (stored >= max) return { current: stored, max, nextAt: null, settledAt: now };
  const step = settings.regenMinutes * 60_000;
  const ticks = Math.max(0, Math.floor((now - storedAt) / step));
  const current = Math.min(max, stored + ticks);
  if (current >= max) return { current, max, nextAt: null, settledAt: now };
  const settledAt = storedAt + ticks * step;
  return { current, max, nextAt: settledAt + step, settledAt };
}

/** Stamina a campaign battle or sweep run costs. */
export const staminaCost = (settings: StaminaSettings, hard: boolean) => (hard ? settings.hardCost : settings.campaignCost);
