import {
  applyGear,
  applyGearCombat,
  applyPassiveCombat,
  ascensionBonus,
  constellationOf,
  roleCombat,
  scaleStats,
  statPower,
  type ContentIndex,
  type OwnedCharacterDTO,
  type ProfileDTO,
} from '@gacha/shared';

/** A single number for sorting heroes by strength: their final stats, gear (and crits) included. */
export function heroPower(content: ContentIndex, profile: ProfileDTO, owned: OwnedCharacterDTO): number {
  const c = content.charactersById[owned.id];
  if (!c) return 0;
  const base = scaleStats(c.base, owned.level, constellationOf(owned.copies), ascensionBonus(content.settings.progression, owned.ascension));
  const worn = profile.gear.filter((g) => g.equippedTo === owned.id);
  return statPower(applyGear(base, worn, content.gearSetsById), applyGearCombat(applyPassiveCombat(roleCombat(c.role), c.passive), worn, content.gearSetsById));
}
