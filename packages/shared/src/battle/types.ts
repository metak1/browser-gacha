import type { CombatStats, ElementId, Passive, Role, Skill, Stats, StatusId } from '../types';

export type Side = 'ally' | 'enemy';
export type Outcome = 'ongoing' | 'victory' | 'defeat';

/**
 * A fully resolved unit: final stats and skill definitions are copied in, so a
 * battle never depends on content that might be edited while it's in progress.
 */
export interface UnitSpec {
  kind: 'character' | 'enemy';
  id: string;
  name: string;
  emoji: string;
  sprite: string | null;
  element: ElementId;
  role: Role;
  boss: boolean;
  level: number;
  stats: Stats;
  /** Crit and effect stats. Setups saved before they existed leave this out (see makeUnit). */
  combat?: CombatStats;
  basic: Skill;
  skill: Skill | null;
  /** Big move, usable when energy is full. */
  ultimate: Skill | null;
  passive?: Passive | null;
  /** Set on a borrowed support hero: the lending friend's name. */
  friend?: string;
  mechanics?: UnitMechanics;
}

/** Boss mechanics resolved for battle (see EnemyMechanics). */
export interface UnitMechanics {
  /** `breakHp`: damage that breaks a charge, fixed when the battle is set up. */
  charge?: { skill: Skill; every: number; breakHp: number };
  enrage?: { below: number; atk: number; spd: number };
  /** `unit` is called at the boss's level, from BattleSetup.summons. */
  adds?: { at: number[]; unit: string; count: number };
}

/** Where a boss is in its mechanics. */
export interface MechanicState {
  /** Own turns until the next charge. */
  chargeIn: number;
  /** Set while charging: damage taken so far and needed to break it. */
  charging: { skill: Skill; taken: number; need: number } | null;
  enraged: boolean;
  /** How many of the `adds` thresholds have fired. */
  addsDone: number;
}

export type MechanicKind = 'charge' | 'unleash' | 'break' | 'enrage' | 'adds';

/** Everything needed to reproduce a battle exactly. */
export interface BattleSetup {
  seed: number;
  allies: UnitSpec[];
  enemies: UnitSpec[];
  /** Enemy waves that follow the first, in order. */
  waves?: UnitSpec[][];
  /** Units that summon effects can call, keyed by `enemyId@level`. */
  summons?: Record<string, UnitSpec>;
  /** Ends the battle (as a defeat) after this many turns; guild boss attacks are timed. */
  turnLimit?: number;
}

export interface StatusInstance {
  id: StatusId;
  turns: number;
  /** Burn damage per tick; unused by other statuses. */
  value: number;
  /** Applied during the holder's own turn, so that turn doesn't count toward its duration. */
  fresh: boolean;
}

export interface BattleUnit {
  uid: string;
  side: Side;
  kind: 'character' | 'enemy';
  defId: string;
  name: string;
  emoji: string;
  sprite: string | null;
  element: ElementId;
  role: Role;
  boss: boolean;
  level: number;
  maxHp: number;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  combat: CombatStats;
  shield: number;
  /** Action value: distance to this unit's next turn. Lowest acts next. */
  av: number;
  /** Own turns until the skill is ready. */
  cooldown: number;
  /** Fills as the unit acts and gets hit; the ultimate needs MAX_ENERGY. */
  energy: number;
  statuses: StatusInstance[];
  basic: Skill;
  skill: Skill | null;
  ultimate: Skill | null;
  passive: Passive | null;
  /** For summoned units: the uid of the unit that called them. */
  summonedBy?: string;
  /** A borrowed support hero: the lending friend's name. */
  friend?: string;
  mechanics?: UnitMechanics;
  mech?: MechanicState;
}

export interface BattleState {
  units: BattleUnit[];
  rng: number;
  /** Turns taken so far (actions + skipped turns). */
  turns: number;
  actorUid: string | null;
  outcome: Outcome;
  /** Current wave (1-based) and total waves. */
  wave: number;
  waves: number;
  /** Waves still to come. */
  reserve: UnitSpec[][];
  summons: Record<string, UnitSpec>;
  /** Enemy units created so far, for unique uids. */
  spawned: number;
  /** Turn cap (MAX_TURNS unless the setup sets a lower one). */
  turnLimit: number;
}

export type ActionKind = 'basic' | 'skill' | 'ultimate';
export const ACTION_KINDS: ActionKind[] = ['basic', 'skill', 'ultimate'];

export interface BattleAction {
  kind: ActionKind;
  target?: string;
}

export type BattleEvent =
  | { type: 'turnStart'; actor: string }
  | { type: 'action'; actor: string; kind: ActionKind; skill: string; target: string | null }
  | {
      type: 'damage';
      source: string | null;
      target: string;
      amount: number;
      absorbed: number;
      crit: boolean;
      advantage: 'strong' | 'weak' | null;
      status?: StatusId;
    }
  | { type: 'heal'; source: string; target: string; amount: number }
  | { type: 'shield'; source: string; target: string; amount: number }
  | { type: 'statusApplied'; target: string; status: StatusId; turns: number }
  /** A debuff didn't land: resisted (Effect RES), or blocked by Immunity. */
  | { type: 'statusResisted'; target: string; status: StatusId; immune?: boolean }
  /** Cleanse or dispel removed these statuses. */
  | { type: 'statusRemoved'; target: string; statuses: StatusId[] }
  | { type: 'advance'; target: string; amount: number }
  | { type: 'delay'; target: string; amount: number }
  | { type: 'revive'; source: string; target: string; hp: number }
  | { type: 'stunned'; actor: string }
  | { type: 'passive'; unit: string; name: string }
  /** A boss mechanic fired; `name` is the charged skill for charge, unleash and break. */
  | { type: 'mechanic'; unit: string; kind: MechanicKind; name: string }
  /** New units joined: the next wave (defeated enemies leave) or a summon. */
  | { type: 'spawn'; reason: 'wave' | 'summon'; units: BattleUnit[]; source: string | null; wave: number }
  | { type: 'defeated'; target: string }
  | { type: 'end'; outcome: 'victory' | 'defeat' };
