import type { ContentBundle } from '../types';

/**
 * One content upgrade: a change to stored content that brings it up to date with the game's
 * defaults without undoing an admin's edits. Steps run once each, in list order, and the server
 * records the ids that have run. To redo a step (say it shipped with a bug, or a dev server ran a
 * draft of it), give it a new id rather than editing it in place.
 */
export interface ContentUpgrade {
  id: string;
  /** The schema version this step had before the ledger, so older saves know it already ran. */
  version: number;
  /** Changes `b` in place; returns whether anything changed. */
  run(b: ContentBundle): boolean;
}

/** Sets `obj[key]` to `next` only if it is still `old` (an admin's own value is kept). Returns whether it changed. */
export function setIfStill<T extends object, K extends keyof T>(obj: T, key: K, old: T[K], next: T[K]): boolean {
  if (obj[key] !== old) return false;
  obj[key] = next;
  return true;
}

/** "level:enemy/enemy|wave/wave;..." for a dungeon's tiers, to recognise known line-ups. */
export function lineupSignature(dg: { tiers: { enemies: { id: string; level: number }[]; waves: { id: string; level: number }[][] }[] }): string {
  return dg.tiers
    .map((t) => `${t.enemies[0]?.level ?? 0}:${t.enemies.map((e) => e.id).join('/')}|${t.waves.map((w) => w.map((e) => e.id).join('/')).join('+')}`)
    .join(';');
}

/** JSON with object keys sorted and undefined fields dropped, for order-independent comparison. */
/**
 * A dungeon compared field by field, without the fields added after v21 (mechanic, tier stamina),
 * which parsing fills with defaults. Key order differs between stored (schema order) and default
 * content, so this is canonical.
 */
export function armoryShape(dg: { mechanic?: unknown; tiers: object[] }): string {
  return canonical({ ...dg, mechanic: undefined, tiers: dg.tiers.map((t) => ({ ...t, stamina: undefined })) });
}

export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`;
  }
  return JSON.stringify(v);
}
