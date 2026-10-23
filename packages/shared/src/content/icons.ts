/**
 * Icon numbers in the Raven Fantasy Icons sheet (1-based, 16 per row), picked by
 * eye from the sheet. Used for UI chrome and to give default content its icons;
 * admins can choose any icon per spell / gear template.
 */
import type { GearSlot } from '../gear';
import type { ElementId, Skill, StatusId } from '../types';

export const UI_ICONS = {
  gems: 161,
  gold: 131,
  stardust: 984,
  ticket: 305,
  chest: 6,
  trophy: 15,
  skull: 862,
  heart: 659,
  shieldUp: 664,
} as const;

export const SLOT_ICONS: Record<GearSlot, number> = { weapon: 1508, armor: 1921, charm: 2065, boots: 7 };

export const STATUS_ICONS: Record<StatusId, number> = {
  burn: 993,
  stun: 1075,
  atkUp: 868,
  defUp: 876,
  defDown: 884,
  spdUp: 875,
  taunt: 663,
};

interface ElementIcons {
  basic: number;
  single: number;
  aoe: number;
  ult: number;
  shield: number;
}

const ELEMENT_ICONS: Record<ElementId, ElementIcons> = {
  flame: { basic: 1006, single: 1001, aoe: 998, ult: 1007, shield: 853 },
  frost: { basic: 1022, single: 1017, aoe: 1014, ult: 1015, shield: 856 },
  volt: { basic: 1038, single: 1025, aoe: 1031, ult: 1039, shield: 857 },
  gale: { basic: 973, single: 965, aoe: 963, ult: 970, shield: 855 },
  tide: { basic: 818, single: 822, aoe: 786, ult: 787, shield: 858 },
  stone: { basic: 1476, single: 209, aoe: 29, ult: 1153, shield: 860 },
};

const HEAL_SINGLE = 1041;
const HEAL_ALL = 1042;
const ADVANCE = 875;

/** A sensible default icon for a spell, from its owner's element and its first effect. */
export function defaultSkillIcon(element: ElementId, slot: 'basic' | 'skill' | 'ult', skill: Skill): number {
  const icons = ELEMENT_ICONS[element];
  if (slot === 'basic') return icons.basic;
  const first = skill.effects[0];
  if (!first) return icons.single;
  switch (first.kind) {
    case 'damage':
      if (slot === 'ult') return icons.ult;
      return first.to === 'allEnemies' ? icons.aoe : icons.single;
    case 'heal':
      return first.to === 'allAllies' ? HEAL_ALL : HEAL_SINGLE;
    case 'shield':
      return icons.shield;
    case 'advance':
    case 'energy':
      return ADVANCE;
    case 'summon':
      return icons.aoe;
    case 'status':
      return STATUS_ICONS[first.status];
  }
}
