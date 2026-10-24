import { heroStats, type ContentIndex, type OwnedCharacterDTO, type ProfileDTO } from '@gacha/shared';

/** A single number for sorting heroes by strength: their final stats, gear (and crits) included. */
export function heroPower(content: ContentIndex, profile: ProfileDTO, owned: OwnedCharacterDTO): number {
  return (
    heroStats(
      content,
      owned,
      profile.gear.filter((g) => g.equippedTo === owned.id),
    )?.power ?? 0
  );
}
