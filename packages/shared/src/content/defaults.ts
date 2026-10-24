/**
 * The content a fresh database is seeded with. After seeding, the database is
 * the source of truth and this file is only used for "reset to defaults".
 * Each kind of content lives in defaults/.
 */
import type { ContentBundle } from './types';
import { characters, enemies, skills } from './defaults/units';
import { chapters, stages } from './defaults/campaign';
import { banners, gear, gearSets, materials } from './defaults/items';
import { missions } from './defaults/missions';
import { dungeons } from './defaults/dungeons';
import { settings } from './defaults/settings';
import { events } from './defaults/events';

export { ENEMY_SPRITES } from './defaults/units';
export { STAGE_TUNING } from './defaults/campaign';
export { DUNGEON_STAMINA } from './defaults/dungeons';
export { REFERENCE_TEAM } from './defaults/settings';
export { HARVEST_EVENT } from './defaults/events';

const DEFAULT_CONTENT: ContentBundle = {
  version: 1,
  settings,
  skills,
  characters,
  enemies,
  chapters,
  stages,
  banners,
  missions,
  gear,
  gearSets,
  materials,
  dungeons,
  events,
};

/** A fresh, deep copy of the default content. */
export function createDefaultContent(): ContentBundle {
  return structuredClone(DEFAULT_CONTENT);
}
