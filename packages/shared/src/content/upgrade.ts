import type { ContentBundle } from './types';
import { ContentAdditions } from './upgrades/content-additions';
import { GearDungeons } from './upgrades/gear-dungeons';
import type { ContentUpgrade } from './upgrades/helpers';
import { StaminaAndScenes } from './upgrades/stamina-and-scenes';
import { TuningAndGear } from './upgrades/tuning-and-gear';

export type { ContentUpgrade } from './upgrades/helpers';

/**
 * Every content upgrade, oldest first. Add a new step at the end with a new id (and the next
 * `version`); see ContentUpgrade for how to redo a step.
 */
export const CONTENT_UPGRADES: ContentUpgrade[] = [...ContentAdditions, ...TuningAndGear, ...GearDungeons, ...StaminaAndScenes];

/** Ids of the steps a save at an old schema version has already had (from before the ledger). */
export function appliedThrough(version: number): Set<string> {
  return new Set(CONTENT_UPGRADES.filter((s) => s.version <= version).map((s) => s.id));
}

/** The highest step version, written alongside the ledger for older builds that only read the number. */
export const CONTENT_SCHEMA_VERSION = Math.max(...CONTENT_UPGRADES.map((s) => s.version));

/**
 * Brings content saved by an older version of the game up to date by running every step not in
 * `applied`, in order. Steps merge in new default pieces and move values still on an old default,
 * without touching anything the admin changed. (Fields themselves get their defaults from the zod
 * schemas.) Returns the upgraded copy, whether anything changed, and the ids that ran.
 */
export function upgradeContent(bundle: ContentBundle, applied: ReadonlySet<string>): { bundle: ContentBundle; changed: boolean; ran: string[] } {
  const b = structuredClone(bundle);
  let changed = false;
  const ran: string[] = [];
  for (const step of CONTENT_UPGRADES) {
    if (applied.has(step.id)) continue;
    if (step.run(b)) changed = true;
    ran.push(step.id);
  }
  return { bundle: b, changed, ran };
}
