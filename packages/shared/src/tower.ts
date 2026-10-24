import type { ContentIndex, Encounter, EncounterMods } from './content';
import type { EncounterEnemy, Reward, SceneTheme } from './content/types';
import { hash32 } from './rng';
import { advance, dmg, status } from './skills';
import type { Effect, PassiveRule, PassiveTrigger } from './types';

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

const THEMES: SceneTheme[] = ['meadow', 'village', 'forest', 'ember', 'camp', 'frost', 'kingdom', 'storm', 'ruins', 'deep', 'cosmos'];

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
  /** What the enemies on this floor do, and the heroes that answer it. */
  challenge: TowerChallenge;
}

export type TowerChallengeId = 'venom' | 'ironhide' | 'empowered' | 'swift' | 'hex' | 'undying' | 'thorns';

/**
 * Every floor gives its enemies one extra mechanic. Nobody is locked out: each challenge just
 * rewards a different kind of hero, so climbing far takes a varied, upgraded roster.
 */
export interface TowerChallenge {
  id: TowerChallengeId;
  name: string;
  icon: string;
  /** What the enemies do. */
  text: string;
  /** Which heroes do well against it. */
  counter: string;
  /** Applied to every enemy (and its summons) on the floor. */
  mods: Pick<EncounterMods, 'stats' | 'passive'>;
}

const trigger = (on: PassiveTrigger, effects: Effect[], chance?: number): PassiveRule =>
  chance === undefined ? { kind: 'trigger', on, effects } : { kind: 'trigger', on, chance, effects };

export const TOWER_CHALLENGES: TowerChallenge[] = [
  {
    id: 'venom',
    name: 'Venom',
    icon: '🧪',
    text: 'Each enemy may poison your whole team at the start of its turn.',
    counter: 'Healers who cleanse, and heroes with high Effect RES.',
    mods: { passive: { name: 'Venom', rules: [trigger('turnStart', [status('poison', 2, 'allEnemies')], 0.25)] } },
  },
  {
    id: 'ironhide',
    name: 'Ironhide',
    icon: '🪨',
    text: 'Enemies have 2.5× DEF and +10% HP.',
    counter: 'Piercing attacks, DEF Down, and damage that scales with HP or DEF.',
    mods: { stats: { def: 2.5, hp: 1.1 } },
  },
  {
    id: 'empowered',
    name: 'Empowered',
    icon: '💪',
    text: 'Enemies start with ATK Up and DEF Up, and may buff themselves again each turn.',
    counter: 'Dispellers, and ATK Down to blunt their hits.',
    mods: {
      passive: {
        name: 'Empowered',
        rules: [trigger('battleStart', [status('atkUp', 3, 'self'), status('defUp', 3, 'self')]), trigger('turnStart', [status('atkUp', 2, 'self')], 0.3)],
      },
    },
  },
  {
    id: 'swift',
    name: 'Swift',
    icon: '🌪️',
    text: 'Enemies have +10% SPD and a big head start.',
    counter: 'Delay and SPD Down, and tanks that taunt and shield.',
    mods: { stats: { spd: 1.1 }, passive: { name: 'Swift', rules: [trigger('battleStart', [advance(0.4, 'self')])] } },
  },
  {
    id: 'hex',
    name: 'Hex',
    icon: '🔇',
    text: 'Hitting an enemy may silence the attacker for 2 turns.',
    counter: 'Cleansers, high Effect RES, and heroes with strong basic attacks.',
    mods: { passive: { name: 'Hex', rules: [trigger('hit', [status('silence', 2, 'target')], 0.4)] } },
  },
  {
    id: 'undying',
    name: 'Undying',
    icon: '🌿',
    text: 'Enemies often regenerate at the start of their turn.',
    counter: 'Burst damage, Dispel, and burn or poison to outpace the healing.',
    mods: { passive: { name: 'Undying', rules: [trigger('turnStart', [status('regen', 1, 'self')], 0.5)] } },
  },
  {
    id: 'thorns',
    name: 'Thorns',
    icon: '🌵',
    text: 'Hitting an enemy hurts the attacker.',
    counter: 'Healers, shields, lifesteal, and big single hits over many small ones.',
    mods: { passive: { name: 'Thorns', rules: [trigger('hit', [dmg(0.6, 'target')])] } },
  },
];

/** A dungeon's mechanic (a challenge), if it has one. */
export const dungeonMechanic = (d: { mechanic: string | null }): TowerChallenge | null =>
  (d.mechanic && TOWER_CHALLENGES.find((c) => c.id === d.mechanic)) || null;

/** Encounter mods for a dungeon: its mechanic's stats and passive. */
export const dungeonMods = (d: { mechanic: string | null }): EncounterMods => dungeonMechanic(d)?.mods ?? {};

/**
 * The challenge on a floor. Consecutive floors always differ, every challenge comes up once in
 * 7 floors, and floor 1 opens with a gentle one (Ironhide).
 */
export const towerChallenge = (floor: number): TowerChallenge => TOWER_CHALLENGES[(floor * 3 + 5) % TOWER_CHALLENGES.length]!;

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

  const challenge = towerChallenge(floor);
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
    mods: {
      // Bosses bring their mechanics, so their floors are a little softer on stats.
      statMult: Math.round(statMult * (boss ? t.bossMult : 1) * 100) / 100,
      ...challenge.mods,
      ...(boss ? { boss: bossKit(floor, pick(regulars, 21)) } : {}),
    },
    reward,
    challenge,
  };
}

/**
 * Mechanics a tower boss gets on top of whatever it already has: a charged attack to break,
 * an enrage, and adds. They get sharper the higher the floor.
 */
function bossKit(floor: number, addUnit: string): NonNullable<EncounterMods['boss']> {
  const deep = floor >= 30;
  return {
    charge: { every: floor >= 15 ? 3 : 4, breakPct: deep ? 0.2 : 0.15, mult: deep ? 1.8 : 1.5 },
    enrage: { below: 0.5, atk: deep ? 1.4 : 1.25, spd: deep ? 1.25 : 1.15 },
    adds: { at: floor >= 20 ? [0.66, 0.33] : [0.5], unit: addUnit, count: floor >= 20 ? 2 : 1 },
  };
}
