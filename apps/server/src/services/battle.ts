import { randomUUID } from 'node:crypto';
import {
  buildBattleSetup,
  buildEncounterSetup,
  dungeonKey,
  eventKey,
  evaluateObjectives,
  hardKey,
  isDungeonOpen,
  isDungeonTierUnlocked,
  isHardUnlocked,
  isFeatureUnlocked,
  isStageUnlocked,
  staminaCost,
  towerBest,
  towerFloor,
  towerKey,
  type Feature,
  type TowerDTO,
  type SweepRequest,
  starsEarned,
  replayBattle,
  type ArenaResultDTO,
  type BattleAction,
  type BattleSetup,
  type GearItem,
  type TeamMember,
  type XpGainDTO,
  type MaterialStack,
  type SalvagedDTO,
  type StageDef,
  type Outcome,
} from '@gacha/shared';
import { badRequest, conflict, notFound } from '../errors';
import type { ArenaBattleMeta, ArenaService } from './arena';
import type { ServiceContext } from './context';
import type { GearService } from './gear';
import { utcDay, type MissionService } from './missions';
import type { ProgressionService } from './progression';
import { addStamina, readStamina, spendStamina } from './stamina';
import { displayName, grantXp } from './account';
import type { EventService } from './events';
import type { GuildBattleMeta, GuildService } from './guild';
import type { SocialService } from './social';

export interface BattleResult {
  outcome: Outcome;
  firstClear: boolean;
  rewards: { gems: number; gold: number };
  drops: GearItem[];
  inventoryFull: boolean;
  salvaged: SalvagedDTO;
  materials: MaterialStack[];
  arena: ArenaResultDTO | null;
  objectives: boolean[];
  stars: number;
  newBest: boolean;
  hard: boolean;
  dungeon: { id: string; tier: number; runsLeft: number } | null;
  tower: { floor: number; best: number } | null;
  event: { id: string; stage: number; currency: number } | null;
  guild: { damage: number; total: number; pool: number; attemptsLeft: number } | null;
  xp: XpGainDTO | null;
}

interface EventMeta {
  eventId: string;
  stage: number;
  stamina: number;
}

interface TowerMeta {
  floor: number;
}

interface DungeonMeta {
  dungeonId: string;
  tier: number;
}

interface CampaignMeta {
  hard?: boolean;
  /** Stamina paid at the start, refunded on defeat. */
  stamina?: number;
}

/** What one paid-out win produced. */
interface Payout {
  gold: number;
  drops: GearItem[];
  inventoryFull: boolean;
  salvaged: SalvagedDTO;
  materials: MaterialStack[];
}

export interface SweepResult {
  runs: number;
  rewards: { gems: number; gold: number };
  drops: GearItem[];
  inventoryFull: boolean;
  salvaged: SalvagedDTO;
  materials: MaterialStack[];
  xp: XpGainDTO | null;
}

const noRewards = (outcome: Outcome): BattleResult => ({
  outcome,
  firstClear: false,
  rewards: { gems: 0, gold: 0 },
  drops: [],
  inventoryFull: false,
  salvaged: { count: 0, gold: 0, stones: 0 },
  materials: [],
  arena: null,
  objectives: [],
  stars: 0,
  newBest: false,
  hard: false,
  dungeon: null,
  tower: null,
  event: null,
  guild: null,
  xp: null,
});

/**
 * Battles are played on the client and verified here. Starting a battle
 * snapshots the team and picks the seed; completing it replays the submitted
 * actions through the shared engine, and only a verified victory pays out.
 */
export class BattleService {
  constructor(
    private readonly ctx: ServiceContext,
    private readonly missions: MissionService,
    private readonly gear: GearService,
    private readonly arena: ArenaService,
    private readonly progression: ProgressionService,
    private readonly social: SocialService,
    private readonly guild: GuildService,
    private readonly events: EventService,
  ) {}

  /** The player's team, plus a friend's borrowed support hero when asked. Inside the start transaction. */
  private teamWithSupport(userId: string, friendId?: string): TeamMember[] {
    const team = this.team(userId);
    if (!friendId) return team;
    const support = this.social.borrow(userId, friendId);
    return [...team, { ...support, friend: displayName(this.ctx, friendId) }];
  }

  start(userId: string, stageId: string, hard = false, friendId?: string): { battleId: string; setup: BattleSetup } {
    const { progress, random } = this.ctx;
    const content = this.ctx.content.current;
    const stage = content.stagesById[stageId];
    if (!stage) throw notFound(`Unknown stage ${stageId}`);
    const cleared = progress.clearedStages(userId);
    if (!isStageUnlocked(content, stageId, cleared)) throw badRequest('stage_locked', 'Clear the previous stage first');
    if (hard && !isHardUnlocked(content, stageId, cleared)) {
      throw badRequest('stage_locked', content.settings.hardMode.enabled ? "Clear the chapter, then the previous hard stage" : 'Hard mode is off');
    }
    const cost = staminaCost(content.settings.stamina, hard);
    const meta: CampaignMeta = { ...(hard ? { hard: true } : {}), stamina: cost };
    return this.ctx.db.transaction(() => {
      spendStamina(this.ctx, userId, cost);
      // The setup snapshots final stats (gear included) and skills, so later edits can't affect this battle.
      const setup: BattleSetup = buildBattleSetup(content, Math.floor(random() * 2 ** 31), this.teamWithSupport(userId, friendId), stage, hard);
      return { battleId: this.record(userId, 'campaign', stageId, setup, meta), setup };
    });
  }

  startEvent(userId: string, eventId: string, stageIndex: number, friendId?: string): { battleId: string; setup: BattleSetup } {
    const { progress, random } = this.ctx;
    const ev = this.events.active(eventId);
    const stage = ev.stages[stageIndex];
    if (!stage) throw notFound('Unknown event stage');
    if (stageIndex > 0 && !progress.clearedStages(userId).includes(eventKey(eventId, stageIndex - 1))) {
      throw badRequest('stage_locked', 'Clear the previous event stage first');
    }
    const cost = staminaCost(this.ctx.content.current.settings.stamina, false);
    const meta: EventMeta = { eventId, stage: stageIndex, stamina: cost };
    return this.ctx.db.transaction(() => {
      spendStamina(this.ctx, userId, cost);
      const setup = buildEncounterSetup(this.ctx.content.current, Math.floor(random() * 2 ** 31), this.teamWithSupport(userId, friendId), stage);
      return { battleId: this.record(userId, 'event', '', setup, meta), setup };
    });
  }

  startGuild(userId: string): { battleId: string; setup: BattleSetup } {
    return this.ctx.db.transaction(() => {
      const { setup, meta } = this.guild.startAttack(userId);
      return { battleId: this.record(userId, 'guild', '', setup, meta), setup };
    });
  }

  private requireFeature(userId: string, feature: Feature, label: string) {
    const settings = this.ctx.content.current.settings;
    if (!isFeatureUnlocked(settings, feature, this.ctx.progress.clearedStages(userId))) {
      throw badRequest('feature_locked', `${label} opens after you clear stage ${settings.unlocks[feature]}`);
    }
  }

  startDungeon(userId: string, dungeonId: string, tier: number): { battleId: string; setup: BattleSetup } {
    const { progress, random, now } = this.ctx;
    const content = this.ctx.content.current;
    const dungeon = content.dungeonsById[dungeonId];
    const def = dungeon?.tiers[tier];
    if (!dungeon || !def) throw notFound('Unknown dungeon');
    this.requireFeature(userId, 'dungeons', 'Dungeons');
    if (!isDungeonOpen(dungeon, now())) throw badRequest('dungeon_closed', `${dungeon.name} is closed today`);
    if (!isDungeonTierUnlocked(dungeonId, tier, progress.clearedStages(userId))) throw badRequest('stage_locked', 'Clear the previous tier first');
    if (this.runsLeft(userId, dungeonId) <= 0) throw badRequest('no_runs', 'No runs left today. Come back tomorrow!');
    const setup = buildEncounterSetup(content, Math.floor(random() * 2 ** 31), this.team(userId), def);
    const meta: DungeonMeta = { dungeonId, tier };
    return { battleId: this.record(userId, 'dungeon', '', setup, meta), setup };
  }

  private team(userId: string) {
    const team = this.gear.teamMembers(userId, this.ctx.roster.getTeam(userId));
    if (!team.length) throw badRequest('empty_team', 'Pick a team first');
    return team;
  }

  private runsLeft(userId: string, dungeonId: string): number {
    const used = this.ctx.dungeons.runsOn(userId, utcDay(this.ctx.now()))[dungeonId] ?? 0;
    return Math.max(0, this.ctx.content.current.settings.dungeonRunsPerDay - used);
  }

  startArena(userId: string, opponentId: string): { battleId: string; setup: BattleSetup } {
    this.requireFeature(userId, 'arena', 'The arena');
    const { setup, meta } = this.arena.start(userId, opponentId);
    return { battleId: this.record(userId, 'arena', '', setup, meta), setup };
  }

  /** The tower: only the next floor can be fought, and each floor pays out once. */
  startTower(userId: string, floor: number): { battleId: string; setup: BattleSetup } {
    this.requireFeature(userId, 'tower', 'The tower');
    const best = towerBest(this.ctx.progress.clearedStages(userId));
    if (!Number.isInteger(floor) || floor !== best + 1) throw badRequest('stage_locked', `Your next floor is ${best + 1}`);
    const content = this.ctx.content.current;
    const f = towerFloor(content, floor);
    const setup = buildEncounterSetup(content, Math.floor(this.ctx.random() * 2 ** 31), this.team(userId), f.encounter, f.mods);
    const meta: TowerMeta = { floor };
    return { battleId: this.record(userId, 'tower', '', setup, meta), setup };
  }

  /** Best floor and the leaderboard (top 20, plus your own place). */
  towerBoard(userId: string): TowerDTO {
    const board = this.ctx.progress.towerBoard();
    const rank = board.findIndex((r) => r.userId === userId);
    return {
      best: towerBest(this.ctx.progress.clearedStages(userId)),
      leaders: board.slice(0, 20).map((r) => ({ name: displayName(this.ctx, r.userId), title: null, floor: r.floor, me: r.userId === userId })),
      myRank: rank >= 0 ? rank + 1 : null,
    };
  }

  private completeTower(userId: string, meta: TowerMeta, won: boolean): BattleResult {
    const { progress, users, now } = this.ctx;
    const outcome = won ? 'victory' : 'defeat';
    const before = towerBest(progress.clearedStages(userId));
    if (!won) return { ...noRewards(outcome), tower: { floor: meta.floor, best: before } };
    this.missions.record(userId, 'winBattles');
    const { firstClear } = progress.recordClear(userId, towerKey(meta.floor), now());
    const tower = { floor: meta.floor, best: Math.max(before, meta.floor) };
    if (!firstClear) return { ...noRewards(outcome), tower };
    const reward = towerFloor(this.ctx.content.current, meta.floor).reward;
    users.adjustWallet(userId, { gems: reward.gems, gold: reward.gold, stardust: reward.stardust });
    for (const m of reward.materials) this.ctx.materials.add(userId, m.id, m.count);
    return { ...noRewards(outcome), firstClear, rewards: { gems: reward.gems, gold: reward.gold }, materials: reward.materials, tower };
  }

  private record(userId: string, mode: 'campaign' | 'arena' | 'dungeon' | 'event' | 'guild' | 'tower', stageId: string, setup: BattleSetup, meta: unknown) {
    const battleId = randomUUID();
    this.ctx.progress.createBattle({ id: battleId, userId, stageId, mode, meta, setup, createdAt: this.ctx.now() });
    return battleId;
  }

  complete(userId: string, battleId: string, actions: BattleAction[]): BattleResult {
    const { db, users, progress, now } = this.ctx;
    const battle = progress.findBattle(battleId);
    if (!battle || battle.userId !== userId) throw notFound('Battle not found');
    if (battle.status !== 'active') throw conflict('battle_finished', 'This battle has already been completed');

    const replay = replayBattle(battle.setup, actions);
    if (replay.error) throw badRequest('invalid_battle', replay.error);
    const won = replay.outcome === 'victory';
    // Rewards come from the stage as it is now; if it was deleted, only the win counts.
    const stage = this.ctx.content.current.stagesById[battle.stageId];

    return db.transaction(() => {
      // Guards against two concurrent completions of the same battle.
      if (!progress.finishBattle(battleId, won ? 'won' : 'lost', now())) {
        throw conflict('battle_finished', 'This battle has already been completed');
      }
      const result = this.settle(userId, battle, replay, actions, won, stage);
      // Account XP for every win (and every guild attack, which can't be "won").
      const p = this.ctx.content.current.settings.playerLevel;
      const staminaSpent = (battle.meta as { stamina?: number } | null)?.stamina ?? 0;
      const xp =
        battle.mode === 'guild'
          ? p.xpGuild
          : !won || (battle.mode === 'dungeon' && result.rewards.gold === 0)
            ? 0
            : battle.mode === 'arena'
              ? p.xpArena
              : battle.mode === 'dungeon' || battle.mode === 'tower'
                ? p.xpDungeon
                : staminaSpent * p.xpPerStamina;
      return { ...result, xp: grantXp(this.ctx, userId, xp) };
    });
  }

  /** Pays out a verified battle by mode. Inside the completion transaction. */
  private settle(
    userId: string,
    battle: NonNullable<ReturnType<ServiceContext['progress']['findBattle']>>,
    replay: ReturnType<typeof replayBattle>,
    actions: BattleAction[],
    won: boolean,
    stage: StageDef | undefined,
  ): BattleResult {
    const { users, progress, now } = this.ctx;
    {
      if (battle.mode === 'guild') {
        const boss = replay.state.units.find((u) => u.uid === 'e0')!;
        return { ...noRewards(replay.outcome), guild: this.guild.settle(userId, battle.meta as GuildBattleMeta, boss.maxHp, boss.hp) };
      }
      if (battle.mode === 'event') return this.completeEvent(userId, battle.meta as EventMeta, won);
      if (battle.mode === 'arena') {
        // Arena losses still count: they move the rating.
        const { result, rewards } = this.arena.settle(userId, battle.meta as ArenaBattleMeta, won);
        if (won) this.missions.record(userId, 'winBattles');
        return { ...noRewards(replay.outcome), rewards, arena: result };
      }
      if (battle.mode === 'dungeon') return this.completeDungeon(userId, battle.meta as DungeonMeta, won);
      if (battle.mode === 'tower') return this.completeTower(userId, battle.meta as TowerMeta, won);
      const meta = (battle.meta ?? {}) as CampaignMeta;
      const hard = meta.hard === true;
      if (!won) {
        // A loss gives the stamina back.
        addStamina(this.ctx, userId, meta.stamina ?? 0);
        return { ...noRewards(replay.outcome), hard };
      }

      this.missions.record(userId, 'winBattles');
      if (!stage) return { ...noRewards(replay.outcome), hard };
      const h = this.ctx.content.current.settings.hardMode;
      // Hard mode has no star objectives: a clear is a clear.
      const objectives = hard ? [] : evaluateObjectives(stage.objectives, replay.state, actions.length);
      const stars = hard ? 1 : starsEarned(objectives, true);
      const { firstClear, previousStars } = progress.recordClear(userId, hard ? hardKey(stage.id) : stage.id, now(), stars);
      const gems = firstClear ? (hard ? h.firstClearGems : stage.firstClearGems) : 0;
      users.adjustWallet(userId, { gems });
      const { gold, drops, inventoryFull, salvaged, materials } = this.payStage(userId, stage, hard);
      const rewards = { gems, gold };
      return {
        outcome: replay.outcome,
        firstClear,
        rewards,
        drops,
        inventoryFull,
        salvaged,
        materials,
        arena: null,
        objectives,
        stars,
        newBest: !hard && stars > previousStars,
        hard,
        dungeon: null,
        tower: null,
        event: null,
        guild: null,
        xp: null,
      };
    }
  }

  /** Event wins pay the event currency (and first-clear gems); losses refund stamina. */
  private completeEvent(userId: string, meta: EventMeta, won: boolean): BattleResult {
    const { progress, users, events, random, now } = this.ctx;
    const outcome = won ? 'victory' : 'defeat';
    if (!won) {
      addStamina(this.ctx, userId, meta.stamina);
      return noRewards(outcome);
    }
    this.missions.record(userId, 'winBattles');
    const ev = this.ctx.content.current.bundle.events.find((e) => e.id === meta.eventId);
    const stage = ev?.stages[meta.stage];
    if (!ev || !stage) return noRewards(outcome);
    const { firstClear } = progress.recordClear(userId, eventKey(ev.id, meta.stage), now());
    const currency = stage.currencyMin + Math.floor(random() * (stage.currencyMax - stage.currencyMin + 1));
    events.addCurrency(userId, ev.id, currency);
    const rewards = { gems: firstClear ? stage.firstClearGems : 0, gold: stage.gold };
    users.adjustWallet(userId, rewards);
    return { ...noRewards(outcome), firstClear, rewards, event: { id: ev.id, stage: meta.stage, currency } };
  }

  /** Pays a dungeon win and uses up one of today's runs. Call inside the completion transaction. */
  private completeDungeon(userId: string, meta: DungeonMeta, won: boolean): BattleResult {
    const { progress, users, now } = this.ctx;
    const outcome = won ? 'victory' : 'defeat';
    const left = this.runsLeft(userId, meta.dungeonId);
    const info = (runsLeft: number) => ({ id: meta.dungeonId, tier: meta.tier, runsLeft });
    // Losses are free; a win past today's limit (from battles started earlier) pays nothing.
    if (!won || left <= 0) return { ...noRewards(outcome), dungeon: info(left) };
    this.missions.record(userId, 'winBattles');
    this.missions.record(userId, 'dungeonRuns');
    this.ctx.dungeons.addRun(userId, meta.dungeonId, utcDay(now()));
    const { firstClear } = progress.recordClear(userId, dungeonKey(meta.dungeonId, meta.tier), now());
    const tier = this.ctx.content.current.dungeonsById[meta.dungeonId]?.tiers[meta.tier];
    if (!tier) return { ...noRewards(outcome), firstClear, dungeon: info(left - 1) };
    users.adjustWallet(userId, { gold: tier.gold });
    const materials = this.progression.rollMaterialDrops(userId, tier.materialDrops);
    return { ...noRewards(outcome), firstClear, rewards: { gems: 0, gold: tier.gold }, materials, dungeon: info(left - 1) };
  }

  /** Gold, gear and materials for one campaign win (not first-clear gems). Inside a transaction. */
  private payStage(userId: string, stage: StageDef, hard: boolean): Payout {
    const h = this.ctx.content.current.settings.hardMode;
    const gold = Math.round(stage.gold * (hard ? h.rewardMult : 1));
    this.ctx.users.adjustWallet(userId, { gold });
    const { drops, inventoryFull, salvaged } = this.gear.rollDrops(userId, stage.drops, hard ? h.gearChanceMult : 1);
    const materials = this.progression.rollMaterialDrops(userId, stage.materialDrops, hard ? h.rewardMult : 1);
    return { gold, drops, inventoryFull, salvaged, materials };
  }

  /**
   * Repeats a mastered stage or cleared dungeon tier instantly: same loot as a
   * win, paid for with stamina (campaign) or daily runs (dungeons). Runs stop
   * early when stamina or runs run out.
   */
  sweep(userId: string, req: SweepRequest): SweepResult {
    const { progress, now } = this.ctx;
    const content = this.ctx.content.current;
    const settings = content.settings;
    const wanted = Math.max(1, Math.min(settings.maxSweep, Math.floor(req.count)));
    const cleared = new Set(progress.clearedStages(userId));
    const total: SweepResult = { runs: 0, rewards: { gems: 0, gold: 0 }, drops: [], inventoryFull: false, salvaged: { count: 0, gold: 0, stones: 0 }, materials: [], xp: null };
    const p = settings.playerLevel;
    const add = (p: Payout) => {
      total.runs++;
      total.rewards.gold += p.gold;
      total.drops.push(...p.drops);
      total.inventoryFull ||= p.inventoryFull;
      total.salvaged.count += p.salvaged.count;
      total.salvaged.gold += p.salvaged.gold;
      total.salvaged.stones += p.salvaged.stones;
      for (const m of p.materials) {
        const have = total.materials.find((x) => x.id === m.id);
        if (have) have.count += m.count;
        else total.materials.push({ ...m });
      }
    };

    if (req.kind === 'dungeon') {
      const dungeon = content.dungeonsById[req.dungeonId];
      const tier = dungeon?.tiers[req.tier];
      if (!dungeon || !tier) throw notFound('Unknown dungeon');
      this.requireFeature(userId, 'dungeons', 'Dungeons');
      if (!isDungeonOpen(dungeon, now())) throw badRequest('dungeon_closed', `${dungeon.name} is closed today`);
      if (!cleared.has(dungeonKey(dungeon.id, req.tier))) throw badRequest('not_mastered', 'Clear this tier once before sweeping it');
      return this.ctx.db.transaction(() => {
        const runs = Math.min(wanted, this.runsLeft(userId, dungeon.id));
        if (runs <= 0) throw badRequest('no_runs', 'No runs left today. Come back tomorrow!');
        for (let i = 0; i < runs; i++) {
          this.missions.record(userId, 'winBattles');
          this.missions.record(userId, 'dungeonRuns');
          this.ctx.dungeons.addRun(userId, dungeon.id, utcDay(now()));
          this.ctx.users.adjustWallet(userId, { gold: tier.gold });
          add({ gold: tier.gold, drops: [], inventoryFull: false, salvaged: { count: 0, gold: 0, stones: 0 }, materials: this.progression.rollMaterialDrops(userId, tier.materialDrops) });
        }
        total.xp = grantXp(this.ctx, userId, runs * p.xpDungeon);
        return total;
      });
    }

    const stage = content.stagesById[req.stageId];
    if (!stage) throw notFound(`Unknown stage ${req.stageId}`);
    const hard = req.hard === true;
    const best = progress.stageStars(userId)[stage.id] ?? 0;
    const mastered = hard ? cleared.has(hardKey(stage.id)) : best >= Math.max(1, stage.objectives.length);
    if (!mastered) throw badRequest('not_mastered', hard ? 'Clear this stage on hard first' : 'Earn all stars on this stage to sweep it');
    const cost = staminaCost(settings.stamina, hard);
    return this.ctx.db.transaction(() => {
      const runs = cost > 0 ? Math.min(wanted, Math.floor(readStaminaNow(this.ctx, userId) / cost)) : wanted;
      if (runs <= 0) throw badRequest('no_stamina', `Not enough stamina: a run costs ${cost}`);
      spendStamina(this.ctx, userId, runs * cost);
      for (let i = 0; i < runs; i++) {
        this.missions.record(userId, 'winBattles');
        progress.recordClear(userId, hard ? hardKey(stage.id) : stage.id, now(), hard ? 1 : best);
        add(this.payStage(userId, stage, hard));
      }
      total.xp = grantXp(this.ctx, userId, runs * cost * p.xpPerStamina);
      return total;
    });
  }
}

function readStaminaNow(ctx: ServiceContext, userId: string): number {
  return readStamina(ctx, userId).current;
}
