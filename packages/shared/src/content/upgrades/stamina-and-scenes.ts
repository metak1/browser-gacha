import { type ContentUpgrade, setIfStill } from './helpers';

// Steps use literal values, not today's defaults, so a later change to a default can't change
// what an old step does.

/** Dungeon stamina per run by tier, as v25 set it. */
const V25_DUNGEON_STAMINA = [8, 12, 16, 20];
const v25Cost = (tier: number) => V25_DUNGEON_STAMINA[Math.min(tier, V25_DUNGEON_STAMINA.length - 1)]!;

/** Steps v25-v29: stamina pacing and the medieval landscapes. */
export const StaminaAndScenes: ContentUpgrade[] = [
  {
    id: 'v25-dungeon-stamina',
    version: 25,
    run(b) {
      // Dungeons cost stamina instead of having a daily run limit. The field is new, so every
      // tier got the schema's flat default; give tiers their cost by tier (8/12/16/20).
      for (const dg of b.dungeons) dg.tiers.forEach((t, i) => (t.stamina = v25Cost(i)));
      return true;
    },
  },
  {
    id: 'v26-ten-stamina-levels',
    version: 26,
    run(b) {
      // Every level costs the same stamina: campaign, hard and dungeon tiers alike. Only costs
      // still on their old defaults change.
      let changed = setIfStill(b.settings.stamina, 'campaignCost', 6, 10);
      changed = setIfStill(b.settings.stamina, 'hardCost', 12, 10) || changed;
      for (const dg of b.dungeons) dg.tiers.forEach((t, i) => (changed = setIfStill(t, 'stamina', v25Cost(i), 10) || changed));
      return changed;
    },
  },
  {
    id: 'v27-xp-per-stamina',
    version: 27,
    run(b) {
      // XP per stamina drops so a campaign win (10 stamina since v26, was 6) still gives the
      // same 60 XP. Only the old default pairing changes.
      return b.settings.stamina.campaignCost === 10 && setIfStill(b.settings.playerLevel, 'xpPerStamina', 10, 6);
    },
  },
  {
    id: 'v28-stamina-cap-200',
    version: 28,
    run(b) {
      // Max stamina 120 -> 200, so players who check in two or three times a day don't lose
      // regen to a full bar.
      return setIfStill(b.settings.stamina, 'max', 120, 200);
    },
  },
  {
    id: 'v29-medieval-landscapes',
    version: 29,
    run(b) {
      // The Armory moves to the war camp and the Bastion to the ruins, if they're still on their
      // old themes.
      let changed = false;
      for (const [id, from, to] of [
        ['armory', 'ember', 'camp'],
        ['bastion', 'frost', 'ruins'],
      ] as const) {
        const dg = b.dungeons.find((d) => d.id === id);
        if (dg) changed = setIfStill(dg, 'theme', from, to) || changed;
      }
      return changed;
    },
  },
];
