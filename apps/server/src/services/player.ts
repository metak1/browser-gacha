import {
  bulkLevelUp,
  chapterStars,
  friendCode,
  levelCap,
  levelUpCost,
  playerLevel,
  type PlayerPrefs,
  type ProfileDTO,
  TEAM_PRESETS,
  type TeamPresetDTO,
} from '@gacha/shared';
import { activeTitle, titlesFor } from './account';
import type { SocialService } from './social';
import { badRequest, conflict, notFound, unauthorized } from '../errors';
import type { ServiceContext } from './context';
import { grantReward } from './rewards';
import { readStamina, refillStamina } from './stamina';
import { utcDay, type MissionService } from './missions';

export class PlayerService {
  constructor(
    private readonly ctx: ServiceContext,
    private readonly missions: MissionService,
    private readonly social: SocialService,
  ) {}

  profile(userId: string): ProfileDTO {
    const { users, roster, progress, gacha, now, content } = this.ctx;
    const user = users.findById(userId);
    if (!user) throw unauthorized();
    // Characters removed from content stay in the DB but are hidden from the player.
    const known = content.current.charactersById;
    return {
      user: { id: user.id, username: user.username, role: user.role },
      wallet: user.wallet,
      dailyAvailable: user.lastDaily !== utcDay(now()),
      missionsReady: this.missions.readyCount(userId),
      activity: this.missions.activity(userId),
      roster: roster.list(userId).filter((c) => known[c.id]),
      team: roster.getTeam(userId).filter((id) => known[id]),
      teams: this.teams(userId),
      activeTeam: roster.activePreset(userId),
      clearedStages: progress.clearedStages(userId),
      stageStars: progress.stageStars(userId),
      claimedChests: progress.claimedChests(userId),
      stamina: readStamina(this.ctx, userId),
      flags: users.flags(userId),
      prefs: this.prefs(userId),
      account: this.account(userId),
      events: this.ctx.events.all(userId),
      guildId: this.ctx.guilds.membership(userId)?.guildId ?? null,
      notices: {
        friendRequests: this.ctx.social.pending(userId).filter((p) => p.incoming).length,
        guildAttacksLeft: this.ctx.guilds.membership(userId)
          ? Math.max(0, this.ctx.content.current.settings.guild.attemptsPerDay - this.ctx.guilds.attemptsOn(userId, utcDay(now())))
          : 0,
      },
      banners: gacha.allBannerStates(userId),
      gear: this.ctx.gear.list(userId),
      materials: this.ctx.materials.all(userId),
    };
  }

  /** Opens a chapter's star chest once the chapter's stages have enough stars. */
  claimChest(userId: string, chapterId: number, stars: number) {
    const { db, progress, content, now } = this.ctx;
    const chapter = content.current.bundle.chapters.find((c) => c.id === chapterId);
    const chest = chapter?.starRewards.find((r) => r.stars === stars);
    if (!chapter || !chest) throw notFound('Chest not found');
    const { earned } = chapterStars(content.current.bundle.stages, chapterId, progress.stageStars(userId));
    if (earned < stars) throw badRequest('not_enough_stars', `Earn ${stars} stars in this chapter first (you have ${earned})`);
    db.transaction(() => {
      if (!progress.claimChest(userId, chapterId, stars, now())) throw conflict('already_claimed', 'Chest already opened');
      grantReward(this.ctx, userId, chest.reward);
    });
  }

  private account(userId: string): ProfileDTO['account'] {
    const a = this.ctx.users.account(userId);
    const lv = playerLevel(this.ctx.content.current.settings.playerLevel, a.xp);
    return {
      level: lv.level,
      xp: a.xp,
      xpInto: lv.into,
      xpNeed: lv.need,
      title: activeTitle(this.ctx, userId),
      titles: titlesFor(this.ctx, userId),
      friendCode: friendCode(userId),
      supportChar: this.social.supportChar(userId),
      loginDays: a.loginDays,
    };
  }

  setTitle(userId: string, title: string | null) {
    if (title !== null && !titlesFor(this.ctx, userId).includes(title)) throw badRequest('locked_title', "You haven't unlocked that title");
    this.ctx.users.setTitle(userId, title);
  }

  prefs(userId: string): PlayerPrefs {
    const raw = this.ctx.users.prefs(userId);
    const auto = raw.autoSalvage;
    return { autoSalvage: auto === 3 || auto === 4 ? auto : 0 };
  }

  setPrefs(userId: string, patch: Partial<PlayerPrefs>) {
    this.ctx.users.setPrefs(userId, { ...this.ctx.users.prefs(userId), ...patch });
  }

  refillStamina(userId: string) {
    refillStamina(this.ctx, userId);
  }

  /** Marks a one-time account flag (tutorial seen, ...). Idempotent. */
  addFlag(userId: string, flag: string) {
    const flags = this.ctx.users.flags(userId);
    if (flags.includes(flag)) return;
    if (flags.length >= 50) throw badRequest('too_many_flags', 'Too many flags');
    this.ctx.users.setFlags(userId, [...flags, flag]);
  }

  claimDaily(userId: string) {
    const { db, users, now } = this.ctx;
    const { dailyGems, dailyGold } = this.ctx.content.current.settings;
    db.transaction(() => {
      const user = users.findById(userId);
      if (!user) throw unauthorized();
      const today = utcDay(now());
      if (user.lastDaily === today) throw conflict('already_claimed', 'Daily reward already claimed today');
      users.setLastDaily(userId, today);
      users.adjustWallet(userId, { gems: dailyGems, gold: dailyGold });
      // The login calendar: each claim pays the next day's reward, cycling.
      const calendar = this.ctx.content.current.settings.loginCalendar;
      if (calendar.length) grantReward(this.ctx, userId, calendar[users.account(userId).loginDays % calendar.length]!);
      users.incLoginDays(userId);
      this.missions.record(userId, 'claimDaily');
    });
  }

  /** Every preset slot, filled in with defaults. */
  teams(userId: string): TeamPresetDTO[] {
    const { roster, content } = this.ctx;
    const known = content.current.charactersById;
    const active = roster.activePreset(userId);
    const saved = roster.presets(userId);
    return Array.from({ length: TEAM_PRESETS }, (_, slot) => {
      const p = saved.get(slot);
      const members = slot === active ? roster.getTeam(userId) : (p?.members ?? []);
      return { slot, name: p?.name ?? defaultTeamName(slot), members: members.filter((id) => known[id] && roster.get(userId, id)) };
    });
  }

  /** Makes a preset the active team. The current team is kept in its own preset first. */
  activateTeam(userId: string, slot: number) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= TEAM_PRESETS) throw badRequest('invalid_team', 'No such team');
    const { db, roster } = this.ctx;
    db.transaction(() => {
      const active = roster.activePreset(userId);
      if (slot === active) return;
      const teams = this.teams(userId);
      const current = teams[active]!;
      roster.savePreset(userId, active, { name: current.name, members: roster.getTeam(userId) });
      const next = teams[slot]!;
      // A preset never used yet starts as a copy of the current team.
      const members = next.members.length ? next.members.slice(0, this.ctx.content.current.settings.maxTeamSize) : roster.getTeam(userId);
      roster.savePreset(userId, slot, { name: next.name, members });
      roster.setTeam(userId, members);
      roster.setActivePreset(userId, slot);
    });
  }

  renameTeam(userId: string, slot: number, name: string) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= TEAM_PRESETS) throw badRequest('invalid_team', 'No such team');
    const clean = name.trim().slice(0, 20) || defaultTeamName(slot);
    const preset = this.teams(userId)[slot]!;
    this.ctx.roster.savePreset(userId, slot, { name: clean, members: preset.members });
  }

  setTeam(userId: string, team: string[]) {
    const { maxTeamSize } = this.ctx.content.current.settings;
    if (team.length < 1 || team.length > maxTeamSize) {
      throw badRequest('invalid_team', `A team needs 1 to ${maxTeamSize} characters`);
    }
    if (new Set(team).size !== team.length) throw badRequest('invalid_team', 'A character can only be in the team once');
    for (const id of team) {
      if (!this.ctx.roster.get(userId, id) || !this.ctx.content.current.charactersById[id]) {
        throw badRequest('invalid_team', `You don't own ${id}`);
      }
    }
    this.ctx.roster.setTeam(userId, team);
  }

  /** Levels a hero up `count` times, or as many of those as the gold and level cap allow (at least one). */
  levelUp(userId: string, charId: string, count = 1) {
    const { db, users, roster, content } = this.ctx;
    const { settings, charactersById } = content.current;
    if (!charactersById[charId]) throw notFound(`Unknown character ${charId}`);
    db.transaction(() => {
      const owned = roster.get(userId, charId);
      if (!owned) throw notFound(`You don't own ${charId}`);
      const cap = levelCap(settings.progression, owned.ascension, settings.maxLevel);
      if (owned.level >= cap) {
        throw conflict('level_cap', owned.level >= settings.maxLevel ? 'Already at max level' : `Level cap ${cap} reached. Ascend to raise it.`);
      }
      const { levels, cost } = bulkLevelUp(settings, owned.level, cap, users.findById(userId)!.wallet.gold, Math.max(1, count));
      if (levels === 0) throw badRequest('insufficient_funds', `Need ${levelUpCost(settings, owned.level)} gold`);
      users.adjustWallet(userId, { gold: -cost });
      roster.setLevel(userId, charId, owned.level + levels);
      this.missions.record(userId, 'levelUp', levels);
    });
  }
}

const defaultTeamName = (slot: number) => (slot === 0 ? 'Main team' : `Team ${slot + 1}`);
