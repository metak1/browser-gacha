import type { ContentIndex, Encounter, EncounterMods } from './content';
import type { CharacterDef, EncounterEnemy, Reward, SceneTheme } from './content/types';
import { ELEMENTS } from './elements';
import { hash32 } from './rng';
import { ELEMENT_IDS, type ElementId, type Rarity } from './types';

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
  /** A trial floor's rule: only some heroes may enter. */
  trial: TowerTrial | null;
}

/**
 * Trial floors restrict who may fight, so climbing needs a deep roster rather than one
 * strong team: heroes of one element, low-rarity heroes, or just two heroes.
 */
export type TowerTrial = { kind: 'element'; element: ElementId } | { kind: 'rarity'; max: Rarity } | { kind: 'duo' };

/** The trial on a floor, if it is one. Trials rotate element → rarity → element → duo. */
export function towerTrial(content: ContentIndex, floor: number): TowerTrial | null {
  const t = content.settings.tower;
  if (!t.trialEvery || floor % t.trialEvery !== t.trialOffset % t.trialEvery || floor % t.bossEvery === 0) return null;
  const n = Math.floor(floor / t.trialEvery);
  // Only elements some hero has, so every trial can be entered by someone.
  const elements = ELEMENT_IDS.filter((e) => content.bundle.characters.some((c) => c.element === e));
  switch (n % 4) {
    case 1:
      return { kind: 'rarity', max: floor >= 40 ? 3 : 4 };
    case 3:
      return { kind: 'duo' };
    default:
      return elements.length ? { kind: 'element', element: elements[hash32(floor, 5, 104729) % elements.length]! } : { kind: 'duo' };
  }
}

/** Whether a hero may enter a trial (the duo trial takes anyone, just fewer of them). */
export function trialAllows(trial: TowerTrial, hero: Pick<CharacterDef, 'element' | 'rarity'>): boolean {
  if (trial.kind === 'element') return hero.element === trial.element;
  if (trial.kind === 'rarity') return hero.rarity <= trial.max;
  return true;
}

/** Which heroes of a team enter a trial floor, in team order. */
export function trialEntrants(content: ContentIndex, trial: TowerTrial, team: string[]): string[] {
  const allowed = team.filter((id) => {
    const hero = content.charactersById[id];
    return hero && trialAllows(trial, hero);
  });
  return trial.kind === 'duo' ? allowed.slice(0, 2) : allowed;
}

export function describeTrial(trial: TowerTrial): { name: string; icon: string; rule: string } {
  if (trial.kind === 'element') {
    const el = ELEMENTS[trial.element];
    return { name: `${el.label} Trial`, icon: el.icon, rule: `Only ${el.label} heroes may enter.` };
  }
  if (trial.kind === 'rarity') {
    return { name: trial.max === 3 ? '★3 Trial' : 'Humble Trial', icon: '★', rule: trial.max === 3 ? 'Only ★3 heroes may enter.' : 'Only ★3 and ★4 heroes may enter.' };
  }
  return { name: 'Duo Trial', icon: '👥', rule: 'Only the first two heroes of your team enter.' };
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

  const trial = towerTrial(content, floor);
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
    // Bosses bring their own mechanics and trials restrict the team, so their floors are a little softer on stats.
    mods: { statMult: Math.round(statMult * (boss ? t.bossMult : 1) * (trial ? t.trialMult : 1) * 100) / 100 },
    reward,
    trial,
  };
}
