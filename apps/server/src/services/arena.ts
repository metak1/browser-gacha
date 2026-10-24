import { randomUUID } from 'node:crypto';
import {
  buildArenaSetup,
  minRankForLevel,
  eloDelta,
  resolveTeam,
  teamPower,
  tierFor,
  weekKey,
  type ArenaHistoryDTO,
  type ArenaLeaderboardEntryDTO,
  type ArenaOpponentDTO,
  type ArenaResultDTO,
  type ArenaStatusDTO,
  type BattleSetup,
  type TeamMember,
} from '@gacha/shared';
import { badRequest, notFound } from '../errors';
import type { ArenaOffer, ArenaPlayer } from '../repos/arena';
import type { ServiceContext } from './context';
import type { GearService } from './gear';
import type { MissionService } from './missions';
import { utcDay } from './missions';
import { grantReward } from './rewards';

const OFFER_COUNT = 3;
const BOT_NAMES = ['Shadow Knight', 'Rogue Mage', 'Iron Warden', 'Mist Dancer', 'Ember Duelist', 'Frost Ranger', 'Gale Rider', 'Stone Sentinel'];

/** Stored on arena battles so completion knows who was fought. */
export interface ArenaBattleMeta {
  opponent: ArenaOffer;
}

/**
 * Asynchronous PvP. Players fight other players' saved defense teams (played
 * by the AI). Opponents are chosen by the server and remembered, so a client
 * can't pick a weak target or invent one. When there aren't enough real
 * players nearby, generated bot teams fill the list.
 */
export class ArenaService {
  constructor(
    private readonly ctx: ServiceContext,
    private readonly gear: GearService,
    private readonly missions: MissionService,
  ) {}

  status(userId: string): ArenaStatusDTO {
    const { db } = this.ctx;
    return db.transaction(() => {
      const { player, seasonReward } = this.refreshPeriodic(userId);
      if (!player.offers.length) player.offers = this.makeOffers(player);
      this.ctx.arena.save(player);
      return this.toStatus(player, seasonReward);
    });
  }

  refresh(userId: string): ArenaStatusDTO {
    return this.ctx.db.transaction(() => {
      const { player } = this.refreshPeriodic(userId);
      player.offers = this.makeOffers(player);
      this.ctx.arena.save(player);
      return this.toStatus(player, null);
    });
  }

  setDefense(userId: string, team: string[]): ArenaStatusDTO {
    const { maxTeamSize } = this.ctx.content.current.settings;
    if (!team.length || team.length > maxTeamSize) throw badRequest('invalid_team', `A defense needs 1 to ${maxTeamSize} heroes`);
    if (new Set(team).size !== team.length) throw badRequest('invalid_team', 'A hero can only defend once');
    if (this.gear.teamMembers(userId, team).length !== team.length) throw badRequest('invalid_team', "You don't own all of those heroes");
    return this.ctx.db.transaction(() => {
      const { player } = this.refreshPeriodic(userId);
      player.defense = team;
      this.ctx.arena.save(player);
      return this.toStatus(player, null);
    });
  }

  /** Spends a ticket and returns the battle setup against an offered opponent. */
  start(userId: string, opponentId: string): { setup: BattleSetup; meta: ArenaBattleMeta } {
    const { db, content, roster, random } = this.ctx;
    return db.transaction(() => {
      const { player } = this.refreshPeriodic(userId);
      const opponent = player.offers.find((o) => o.id === opponentId);
      if (!opponent) throw notFound('That opponent is no longer available. Refresh the list.');
      if (player.ticketsUsed >= content.current.settings.arenaTicketsPerDay) {
        throw badRequest('no_tickets', 'No arena tickets left today');
      }
      const attackers = this.gear.teamMembers(userId, roster.getTeam(userId));
      if (!attackers.length) throw badRequest('empty_team', 'Pick a team first');
      const defenders = this.defenderTeam(opponent);
      if (!defenders.length) throw notFound('That opponent has no defense team. Refresh the list.');

      player.ticketsUsed++;
      // Each opponent can be fought once per list.
      player.offers = player.offers.filter((o) => o.id !== opponentId);
      this.ctx.arena.save(player);
      const setup = buildArenaSetup(content.current, Math.floor(random() * 2 ** 31), attackers, defenders);
      return { setup, meta: { opponent } };
    });
  }

  /** Applies a finished arena battle. Call inside the battle-completion transaction. */
  settle(userId: string, meta: ArenaBattleMeta, won: boolean): { result: ArenaResultDTO; rewards: { gems: number; gold: number } } {
    const { arena, users, content, now } = this.ctx;
    const { settings } = content.current;
    const player = this.ensure(userId);
    const opp = meta.opponent;
    const defender = opp.isBot ? undefined : arena.get(opp.id);
    const oppRating = defender?.rating ?? opp.rating;

    const delta = eloDelta(player.rating, oppRating, won ? 1 : 0, settings.arenaK);
    const ratingBefore = player.rating;
    player.rating = Math.max(0, player.rating + delta);
    if (won) player.wins++;
    else player.losses++;
    arena.save(player);

    let defenderDelta = 0;
    if (defender) {
      defenderDelta = eloDelta(defender.rating, ratingBefore, won ? 0 : 1, Math.round(settings.arenaK / 2));
      defender.rating = Math.max(0, defender.rating + defenderDelta);
      arena.save(defender);
    }

    const me = users.findById(userId)!;
    arena.addHistory({
      attackerId: userId,
      defenderId: defender ? opp.id : null,
      attackerName: me.username ?? `Guest ${userId.slice(0, 4)}`,
      defenderName: opp.name,
      attackerWon: won,
      attackerDelta: delta,
      defenderDelta,
      createdAt: now(),
    });

    const rewards = won ? { gems: settings.arenaWinGems, gold: settings.arenaWinGold } : { gems: 0, gold: 0 };
    if (won) {
      users.adjustWallet(userId, rewards);
      this.missions.record(userId, 'arenaWins');
    }
    return { result: { opponentName: opp.name, ratingBefore, ratingAfter: player.rating, delta }, rewards };
  }

  leaderboard(userId: string): ArenaLeaderboardEntryDTO[] {
    return this.ctx.arena.top(50).map((row, i) => ({
      rank: i + 1,
      name: row.username ?? `Guest ${row.userId.slice(0, 4)}`,
      rating: row.rating,
      isYou: row.userId === userId,
    }));
  }

  // ---------- internals ----------

  private ensure(userId: string): ArenaPlayer {
    const { arena, roster, content, now } = this.ctx;
    let player = arena.get(userId);
    if (!player) {
      arena.create(userId, content.current.settings.arenaStartRating, roster.getTeam(userId), weekKey(now()));
      player = arena.get(userId)!;
    }
    return player;
  }

  /** Resets daily tickets and pays out the weekly season if a new week has started. */
  private refreshPeriodic(userId: string) {
    const { content, now } = this.ctx;
    const { settings } = content.current;
    const player = this.ensure(userId);
    const today = utcDay(now());
    if (player.ticketDay !== today) {
      player.ticketDay = today;
      player.ticketsUsed = 0;
    }
    let seasonReward: ArenaStatusDTO['seasonReward'] = null;
    const week = weekKey(now());
    if (player.week !== week) {
      const tier = tierFor(player.rating, settings.arenaTiers);
      grantReward(this.ctx, userId, tier.reward);
      // Soft reset: halfway back to the starting rating.
      player.rating = Math.round(settings.arenaStartRating + (player.rating - settings.arenaStartRating) / 2);
      player.week = week;
      player.offers = [];
      seasonReward = { tier: tier.name, icon: tier.icon, reward: tier.reward, ratingAfterReset: player.rating };
    }
    return { player, seasonReward };
  }

  private makeOffers(player: ArenaPlayer): ArenaOffer[] {
    const { arena, users, random, roster, content } = this.ctx;
    const pool = arena.nearby(player.userId, player.rating, 10).filter((p) => this.gear.teamMembers(p.userId, p.defense).length > 0);
    const offers: ArenaOffer[] = [];
    while (offers.length < Math.min(2, OFFER_COUNT) && pool.length) {
      const [p] = pool.splice(Math.floor(random() * pool.length), 1);
      const u = users.findById(p!.userId);
      offers.push({ id: p!.userId, name: u?.username ?? `Guest ${p!.userId.slice(0, 4)}`, rating: p!.rating, isBot: false });
    }

    // Bots mirror the player's team (same size, same rarity per slot, similar level) so the fight
    // is fair; the three offers range from a little easier to a little harder.
    const index = content.current;
    const myTeam = this.gear.teamMembers(player.userId, roster.getTeam(player.userId));
    const avgLevel = myTeam.length ? Math.round(myTeam.reduce((s, m) => s + m.level, 0) / myTeam.length) : 1;
    const rarities = myTeam.length
      ? myTeam.map((m) => index.charactersById[m.id]!.rarity)
      : Array.from({ length: index.settings.maxTeamSize }, () => 3 as const);
    const variants = [
      { rating: -60, level: -2 },
      { rating: 0, level: 0 },
      { rating: 60, level: 2 },
    ];
    while (offers.length < OFFER_COUNT) {
      const v = variants[offers.length % variants.length]!;
      const team: string[] = [];
      for (const r of rarities) {
        const pool = index.bundle.characters.filter((c) => !team.includes(c.id) && c.rarity === r);
        const fallback = index.bundle.characters.filter((c) => !team.includes(c.id));
        const from = pool.length ? pool : fallback;
        if (!from.length) break;
        team.push(from[Math.floor(random() * from.length)]!.id);
      }
      if (!team.length) break;
      const name = `${BOT_NAMES[Math.floor(random() * BOT_NAMES.length)]} ${Math.floor(random() * 90) + 10}`;
      offers.push({
        id: `bot-${randomUUID()}`,
        name,
        rating: Math.max(0, player.rating + v.rating),
        isBot: true,
        bot: { level: Math.max(1, Math.min(index.settings.maxLevel, avgLevel + v.level)), team },
      });
    }
    return offers;
  }

  private defenderTeam(opponent: ArenaOffer): TeamMember[] {
    if (opponent.isBot) {
      const known = this.ctx.content.current.charactersById;
      return (opponent.bot?.team ?? [])
        .filter((id) => known[id])
        .map((id) => ({
          id,
          level: opponent.bot!.level,
          constellation: 0,
          // Bots are ascended just enough for their level, like a player's would be.
          ascension: minRankForLevel(this.ctx.content.current.settings.progression, opponent.bot!.level),
        }));
    }
    const defender = this.ctx.arena.get(opponent.id);
    return defender ? this.gear.teamMembers(opponent.id, defender.defense) : [];
  }

  private toStatus(player: ArenaPlayer, seasonReward: ArenaStatusDTO['seasonReward']): ArenaStatusDTO {
    const { arena, content } = this.ctx;
    const index = content.current;
    const opponents: ArenaOpponentDTO[] = player.offers.flatMap((o) => {
      const members = this.defenderTeam(o);
      if (!members.length) return [];
      return [
        {
          id: o.id,
          name: o.name,
          rating: o.isBot ? o.rating : (arena.get(o.id)?.rating ?? o.rating),
          isBot: o.isBot,
          team: members.map((m) => ({ id: m.id, level: m.level })),
          power: teamPower(resolveTeam(index, members)),
        },
      ];
    });
    const history: ArenaHistoryDTO[] = arena.history(player.userId, 20).map((h) => {
      const attacked = h.attackerId === player.userId;
      return {
        id: h.id,
        opponentName: attacked ? h.defenderName : h.attackerName,
        youAttacked: attacked,
        youWon: attacked ? h.attackerWon : !h.attackerWon,
        delta: attacked ? h.attackerDelta : h.defenderDelta,
        createdAt: h.createdAt,
      };
    });
    const defense = this.gear.teamMembers(player.userId, player.defense);
    return {
      rating: player.rating,
      rank: arena.rank(player.rating),
      wins: player.wins,
      losses: player.losses,
      tickets: Math.max(0, index.settings.arenaTicketsPerDay - player.ticketsUsed),
      maxTickets: index.settings.arenaTicketsPerDay,
      defense: defense.map((m) => m.id),
      defensePower: teamPower(resolveTeam(index, defense)),
      opponents,
      history,
      week: player.week ?? weekKey(this.ctx.now()),
      seasonReward,
    };
  }
}
