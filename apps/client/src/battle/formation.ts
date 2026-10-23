import type { BattleUnit } from '@gacha/shared';

/** Feet position of a unit, in percent of the stage's width (x) and height (y). */
export interface Slot {
  x: number;
  y: number;
}

/** Stage height / width, matching battle.css (taller on phones). 1% of stage height = aspect cqw. */
export function stageAspect(): number {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches ? 3 / 4 : 9 / 16;
}

// Ally layouts by team size (front row nearer the centre). Enemies mirror these.
const LAYOUTS: Slot[][] = [
  [],
  [{ x: 27, y: 76 }],
  [{ x: 29, y: 68 }, { x: 17, y: 84 }],
  [{ x: 30, y: 64 }, { x: 16, y: 74 }, { x: 30, y: 88 }],
  [{ x: 31, y: 62 }, { x: 17, y: 68 }, { x: 29, y: 82 }, { x: 15, y: 90 }],
  [{ x: 32, y: 60 }, { x: 19, y: 64 }, { x: 33, y: 76 }, { x: 19, y: 82 }, { x: 31, y: 92 }],
];

export function formation(units: BattleUnit[]): Record<string, Slot> {
  const slots: Record<string, Slot> = {};
  for (const side of ['ally', 'enemy'] as const) {
    const list = units.filter((u) => u.side === side);
    const layout = LAYOUTS[Math.min(list.length, LAYOUTS.length - 1)]!;
    list.forEach((u, i) => {
      const s = layout[i] ?? layout[layout.length - 1]!;
      // Bosses stand a little further back so their larger frame doesn't crowd the front row.
      const x = side === 'ally' ? s.x : 100 - s.x + (u.boss ? 3 : 0);
      slots[u.uid] = { x, y: s.y };
    });
  }
  return slots;
}

/** How far an attacker travels (in cqw) to strike a target, stopping just short. */
export function lungeOffset(from: Slot, to: Slot): { dx: number; dy: number } {
  const dir = Math.sign(to.x - from.x) || 1;
  return { dx: to.x - from.x - dir * 9, dy: (to.y - from.y) * stageAspect() };
}
