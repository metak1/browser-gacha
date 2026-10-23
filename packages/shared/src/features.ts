import type { GameSettings } from './content/types';

/** Parts of the game that open up as the player progresses. */
export type Feature = 'arena' | 'dungeons' | 'tower';
export const FEATURES: Feature[] = ['arena', 'dungeons', 'tower'];
export const FEATURE_INFO: Record<Feature, { label: string; icon: string; blurb: string }> = {
  arena: { label: 'Arena', icon: '🏟️', blurb: "Battle other players' defense teams and climb the weekly tiers." },
  dungeons: { label: 'Dungeons', icon: '🗝️', blurb: 'Farm ascension essence in a different elemental dungeon each day.' },
  tower: { label: 'Endless Tower', icon: '🗼', blurb: 'Climb floor after floor of ever-stronger foes, with a boss every 5 floors.' },
};

/** The stage that unlocks a feature, or null if it's always open. */
export const featureRequirement = (settings: GameSettings, f: Feature): string | null => settings.unlocks[f];

export function isFeatureUnlocked(settings: GameSettings, f: Feature, cleared: Iterable<string>): boolean {
  const need = featureRequirement(settings, f);
  return !need || new Set(cleared).has(need);
}

/** Features open after a clear that weren't before it, e.g. to celebrate on the result screen. */
export function newlyUnlocked(settings: GameSettings, before: Iterable<string>, after: Iterable<string>): Feature[] {
  const b = [...before];
  const a = [...after];
  return FEATURES.filter((f) => !isFeatureUnlocked(settings, f, b) && isFeatureUnlocked(settings, f, a));
}
