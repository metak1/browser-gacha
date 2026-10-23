import type { ContentIndex, Encounter, EncounterMods } from './content';
import type { EncounterEnemy, Reward, SceneTheme } from './content/types';
import { hash32 } from './rng';

/** Progress key for a cleared tower floor (stored with stage clears). */
export const towerKey = (floor: number) => `tower:${floor}`;

/** Highest tower floor cleared, from the cleared-stage keys. */
export function towerBest(cleared: Iterable<string>): number {
  let best = 0;
  for (const k of cleared) {
    if (!k.startsWith('tower:')) continue;
    const f = Number(k.slice(6));
    if (f > best) best = f;
  }
  return best;
}

const THEMES: SceneTheme[] = ['meadow', 'ember', 'frost', 'storm', 'deep', 'cosmos'];

export interface TowerFloor {
  floor: number;
  boss: boolean;
  /** A milestone floor pays the milestone reward on its first clear. */
  milestone: boolean;
  /** Team level the floor is tuned for. */
  recommendedLevel: number;
  theme: SceneTheme;
  encounter: Encounter;
  mods: EncounterMods;
  /** Paid on the first clear only. */
  reward: Reward;
}

/**
 * Builds a tower floor. Floors are generated, so the tower never ends:
 * enemies level up one per floor until the level cap, then keep getting
 * stronger through a stat multiplier. Every `bossEvery` floors a chapter boss
 * (with its mechanics) guards the way. The same floor always has the same enemies.
 */
export function towerFloor(content: ContentIndex, floor: number): TowerFloor {
  const t = content.settings.tower;
  const maxLevel = content.settings.maxLevel;
  const enemyLevel = Math.min(maxLevel, t.startLevel + floor - 1);
  const beyond = Math.max(0, t.startLevel + floor - 1 - maxLevel);
  const statMult = Math.round((t.baseMult + t.multPerFloor * floor) * (1 + t.multPastCap * beyond) * 100) / 100;

  const regulars = content.bundle.enemies.filter((e) => !e.boss).map((e) => e.id);
  const bosses = content.bundle.enemies.filter((e) => e.boss).map((e) => e.id);
  const pick = (list: string[], salt: number) => list[hash32(floor, salt, 7919) % list.length]!;
  const lineup = (ids: string[]): EncounterEnemy[] => ids.map((id) => ({ id, level: enemyLevel }));

  const boss = floor % t.bossEvery === 0 && bosses.length > 0;
  const size = floor < 20 ? 3 : 4;
  const first = boss
    ? [pick(regulars, 1), bosses[(floor / t.bossEvery - 1) % bosses.length]!]
    : Array.from({ length: size }, (_, i) => pick(regulars, i + 1));
  // Deeper floors bring a second wave.
  const waves = !boss && floor >= t.wavesFrom ? [Array.from({ length: 3 }, (_, i) => pick(regulars, i + 11))] : [];

  const milestone = floor % t.milestoneEvery === 0;
  const reward: Reward = {
    gems: t.floorGems + (milestone ? t.milestoneReward.gems : 0),
    gold: t.floorGold + t.floorGoldPerFloor * floor + (milestone ? t.milestoneReward.gold : 0),
    stardust: milestone ? t.milestoneReward.stardust : 0,
    materials: milestone ? structuredClone(t.milestoneReward.materials) : [],
  };

  return {
    floor,
    boss,
    milestone,
    recommendedLevel: Math.min(maxLevel, enemyLevel + 3),
    theme: THEMES[Math.floor((floor - 1) / 10) % THEMES.length]!,
    encounter: { enemies: lineup(first.filter(Boolean)), waves: waves.map(lineup) },
    // Bosses bring their own mechanics, so their floors are a little softer on stats.
    mods: { statMult: boss ? Math.round(statMult * t.bossMult * 100) / 100 : statMult },
    reward,
  };
}
