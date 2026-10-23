import { randomUUID } from 'node:crypto';
import { buildEncounterSetup, guildBoss, type BattleSetup, type GuildDTO, type GuildSummaryDTO } from '@gacha/shared';
import { badRequest, conflict, notFound } from '../errors';
import { activeTitle, displayName, levelOf } from './account';
import type { ServiceContext } from './context';
import type { GearService } from './gear';
import { utcDay, type MissionService } from './missions';
import { grantReward } from './rewards';

export interface GuildBattleMeta {
  guildId: string;
  week: string;
}

/** Guilds and the weekly guild boss. */
export class GuildService {
  constructor(
    private readonly ctx: ServiceContext,
    private readonly gear: GearService,
    private readonly missions: MissionService,
  ) {}

  private settings() {
    return this.ctx.content.current.settings.guild;
  }

  list(query: string): GuildSummaryDTO[] {
    const max = this.settings().maxMembers;
    return this.ctx.guilds.search(query, 30).map((g) => ({ id: g.id, name: g.name, description: g.description, members: g.members, maxMembers: max, open: g.open }));
  }

  create(userId: string, name: string, description: string): string {
    const { guilds, users, db, now } = this.ctx;
    const cost = this.settings().createCost;
    return db.transaction(() => {
      if (guilds.membership(userId)) throw conflict('in_guild', 'Leave your guild first');
      if (guilds.byName(name)) throw conflict('name_taken', 'That guild name is taken');
      if (users.findById(userId)!.wallet.gold < cost) throw badRequest('insufficient_funds', `Founding a guild costs ${cost} gold`);
      const id = randomUUID();
      guilds.create({ id, name, description, open: true, createdAt: now() });
      guilds.addMember(id, userId, 'leader', now());
      users.adjustWallet(userId, { gold: -cost });
      return id;
    });
  }

  join(userId: string, guildId: string) {
    const { guilds, db, now } = this.ctx;
    db.transaction(() => {
      if (guilds.membership(userId)) throw conflict('in_guild', 'Leave your guild first');
      const g = guilds.get(guildId);
      if (!g) throw notFound('Guild not found');
      if (!g.open) throw badRequest('guild_closed', 'This guild is not taking new members');
      if (guilds.members(guildId).length >= this.settings().maxMembers) throw badRequest('guild_full', 'This guild is full');
      guilds.addMember(guildId, userId, 'member', now());
    });
  }

  /** Leaving as leader hands the guild to the longest-standing member, or disbands an empty guild. */
  leave(userId: string) {
    const { guilds, db } = this.ctx;
    db.transaction(() => {
      const m = guilds.membership(userId);
      if (!m) throw badRequest('no_guild', "You're not in a guild");
      guilds.removeMember(userId);
      const rest = guilds.members(m.guildId);
      if (!rest.length) guilds.delete(m.guildId);
      else if (m.role === 'leader') guilds.setRole(rest[0]!.userId, 'leader');
    });
  }

  update(userId: string, patch: { description: string; open: boolean }) {
    const m = this.ctx.guilds.membership(userId);
    if (!m) throw badRequest('no_guild', "You're not in a guild");
    if (m.role !== 'leader') throw badRequest('not_leader', 'Only the leader can change guild settings');
    this.ctx.guilds.update(m.guildId, patch);
  }

  private attemptsLeft(userId: string): number {
    return Math.max(0, this.settings().attemptsPerDay - this.ctx.guilds.attemptsOn(userId, utcDay(this.ctx.now())));
  }

  get(userId: string): GuildDTO | null {
    const { guilds, now } = this.ctx;
    const m = guilds.membership(userId);
    if (!m) return null;
    const g = guilds.get(m.guildId)!;
    const members = guilds.members(g.id);
    const { boss, week, pool } = guildBoss(this.ctx.content.current.settings, now(), members.length);
    const damage = guilds.damage(g.id, week);
    const total = damage.reduce((s, d) => s + d.damage, 0);
    const claimed = new Set(guilds.claimedChests(userId, week));
    const attacked = damage.some((d) => d.userId === userId);
    return {
      id: g.id,
      name: g.name,
      description: g.description,
      open: g.open,
      members: members
        .map((mem) => {
          const d = damage.find((x) => x.userId === mem.userId);
          return {
            id: mem.userId,
            name: displayName(this.ctx, mem.userId),
            title: activeTitle(this.ctx, mem.userId),
            level: levelOf(this.ctx, mem.userId),
            role: mem.role,
            weeklyDamage: d?.damage ?? 0,
            weeklyAttacks: d?.attacks ?? 0,
          };
        })
        .sort((a, b) => b.weeklyDamage - a.weeklyDamage),
      memberCount: members.length,
      maxMembers: this.settings().maxMembers,
      role: m.role,
      boss: { enemy: boss.enemy, level: boss.level, week, pool, damage: Math.min(total, pool), attemptsLeft: this.attemptsLeft(userId), attemptsPerDay: this.settings().attemptsPerDay },
      chests: this.settings().tiers.map((t) => ({
        percent: t.percent,
        reward: t.reward,
        unlocked: attacked && total >= (pool * t.percent) / 100,
        claimed: claimed.has(t.percent),
      })),
    };
  }

  /**
   * A timed attack on this week's boss. The boss's HP is the guild's whole pool,
   * so a single attack never finishes it: what counts is the damage dealt.
   * The attempt is used up when the battle starts. Call inside a transaction.
   */
  startAttack(userId: string): { setup: BattleSetup; meta: GuildBattleMeta } {
    const { guilds, random, now } = this.ctx;
    const m = guilds.membership(userId);
    if (!m) throw badRequest('no_guild', 'Join a guild first');
    if (this.attemptsLeft(userId) <= 0) throw badRequest('no_attempts', 'No guild attacks left today');
    const team = this.gear.teamMembers(userId, this.ctx.roster.getTeam(userId));
    if (!team.length) throw badRequest('empty_team', 'Pick a team first');
    const content = this.ctx.content.current;
    const { boss, week, pool } = guildBoss(content.settings, now(), guilds.members(m.guildId).length);
    const setup = buildEncounterSetup(content, Math.floor(random() * 2 ** 31), team, { enemies: [{ id: boss.enemy, level: boss.level }] });
    setup.enemies[0]!.stats = { ...setup.enemies[0]!.stats, hp: pool };
    setup.turnLimit = this.settings().turnLimit;
    guilds.addAttempt(userId, utcDay(now()));
    return { setup, meta: { guildId: m.guildId, week } };
  }

  /** Records an attack's damage (to the boss unit only, not its minions). Inside the completion transaction. */
  settle(userId: string, meta: GuildBattleMeta, bossMaxHp: number, bossHp: number) {
    const { guilds, users, now } = this.ctx;
    const damage = Math.max(0, bossMaxHp - bossHp);
    const stillMember = guilds.membership(userId)?.guildId === meta.guildId;
    if (stillMember) guilds.addDamage(meta.guildId, meta.week, userId, damage);
    users.adjustWallet(userId, { gold: this.settings().attemptGold });
    this.missions.record(userId, 'guildAttacks');
    const members = guilds.members(meta.guildId).length;
    const { pool } = guildBoss(this.ctx.content.current.settings, now(), members);
    const total = guilds.damage(meta.guildId, meta.week).reduce((s, d) => s + d.damage, 0);
    return { damage, total: Math.min(total, pool), pool, attemptsLeft: this.attemptsLeft(userId) };
  }

  claimChest(userId: string, percent: number) {
    const { guilds, db } = this.ctx;
    db.transaction(() => {
      const state = this.get(userId);
      if (!state) throw badRequest('no_guild', "You're not in a guild");
      const chest = state.chests.find((c) => c.percent === percent);
      if (!chest) throw notFound('Chest not found');
      if (!chest.unlocked) throw badRequest('locked', 'Your guild has not reached this chest yet (and you need to attack this week)');
      if (!guilds.claimChest(userId, state.boss.week, percent)) throw conflict('already_claimed', 'Chest already opened');
      grantReward(this.ctx, userId, chest.reward);
    });
  }
}
