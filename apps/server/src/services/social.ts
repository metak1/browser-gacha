import { friendCode, resolveUnit, type FriendDTO, type SocialDTO, type SupportHeroDTO, type TeamMember } from '@gacha/shared';
import { badRequest, conflict, notFound } from '../errors';
import { activeTitle, displayName, levelOf } from './account';
import type { ServiceContext } from './context';
import type { GearService } from './gear';
import { utcDay } from './missions';

/** Friends, friend codes and borrowing a friend's support hero. */
export class SocialService {
  constructor(
    private readonly ctx: ServiceContext,
    private readonly gear: GearService,
  ) {}

  /** The hero a player lends to friends: their chosen one, else their team leader. */
  supportChar(userId: string): string | null {
    const { users, roster, content } = this.ctx;
    const chosen = users.account(userId).supportChar;
    if (chosen && roster.get(userId, chosen) && content.current.charactersById[chosen]) return chosen;
    return roster.getTeam(userId).find((id) => content.current.charactersById[id]) ?? null;
  }

  setSupport(userId: string, charId: string) {
    if (!this.ctx.roster.get(userId, charId) || !this.ctx.content.current.charactersById[charId]) {
      throw badRequest('invalid_character', `You don't own ${charId}`);
    }
    this.ctx.users.setSupportChar(userId, charId);
  }

  /** A player's support hero as a friend would get it in battle. */
  supportHero(ownerId: string): SupportHeroDTO | null {
    const charId = this.supportChar(ownerId);
    const owned = charId ? this.ctx.roster.get(ownerId, charId) : undefined;
    const [member] = charId ? this.gear.teamMembers(ownerId, [charId]) : [];
    if (!charId || !owned || !member) return null;
    const spec = resolveUnit(this.ctx.content.current, 'character', charId, member.level, member.constellation, member.gear, member);
    return {
      charId,
      level: owned.level,
      constellation: member.constellation,
      ascension: owned.ascension,
      skillLevel: owned.skillLevel,
      ultLevel: owned.ultLevel,
      stats: spec.stats,
      gear: this.ctx.gear.equippedOn(ownerId, charId),
    };
  }

  private friend(userId: string, friendId: string, usedToday: Set<string>): FriendDTO {
    return {
      id: friendId,
      name: displayName(this.ctx, friendId),
      title: activeTitle(this.ctx, friendId),
      level: levelOf(this.ctx, friendId),
      code: friendCode(friendId),
      support: this.supportHero(friendId),
      usedToday: usedToday.has(friendId),
    };
  }

  list(userId: string): SocialDTO {
    const { social, now } = this.ctx;
    const used = new Set(social.supportUsedOn(userId, utcDay(now())));
    return {
      code: friendCode(userId),
      mySupport: this.supportHero(userId),
      maxFriends: this.ctx.content.current.settings.social.maxFriends,
      friends: social
        .friendIds(userId)
        .filter((id) => this.ctx.users.findById(id))
        .map((id) => this.friend(userId, id, used)),
      requests: social
        .pending(userId)
        .filter((r) => this.ctx.users.findById(r.otherId))
        .map((r) => ({
          id: r.otherId,
          name: displayName(this.ctx, r.otherId),
          level: levelOf(this.ctx, r.otherId),
          code: friendCode(r.otherId),
          incoming: r.incoming,
        })),
    };
  }

  /** Sends a request by friend code; if they already asked you, it becomes a friendship. */
  request(userId: string, code: string) {
    const { social, users, now, db } = this.ctx;
    const other = users.findByFriendCode(code.trim().toUpperCase());
    if (!other) throw notFound('No player has that friend code');
    if (other === userId) throw badRequest('self', "That's your own code");
    const max = this.ctx.content.current.settings.social.maxFriends;
    db.transaction(() => {
      if (social.status(userId, other) === 'accepted') throw conflict('already_friends', 'You are already friends');
      if (social.status(other, userId) === 'pending') {
        this.acceptInner(userId, other, max);
        return;
      }
      if (social.friendIds(userId).length >= max) throw badRequest('friends_full', `You can have up to ${max} friends`);
      social.request(userId, other, now());
    });
  }

  accept(userId: string, fromId: string) {
    const max = this.ctx.content.current.settings.social.maxFriends;
    this.ctx.db.transaction(() => {
      if (this.ctx.social.status(fromId, userId) !== 'pending') throw notFound('No request from that player');
      this.acceptInner(userId, fromId, max);
    });
  }

  private acceptInner(userId: string, fromId: string, max: number) {
    const { social, now } = this.ctx;
    if (social.friendIds(userId).length >= max || social.friendIds(fromId).length >= max) {
      throw badRequest('friends_full', `Friend lists hold up to ${max} friends`);
    }
    social.accept(userId, fromId, now());
  }

  /** Declines a request, cancels one you sent, or unfriends. */
  remove(userId: string, otherId: string) {
    this.ctx.social.remove(userId, otherId);
  }

  /**
   * Resolves a friend's support hero for a battle and records the borrow
   * (once per friend per day). The lender is paid. Call inside the battle's
   * start transaction.
   */
  borrow(userId: string, friendId: string): TeamMember {
    const { social, users, now } = this.ctx;
    if (social.status(userId, friendId) !== 'accepted') throw badRequest('not_friends', 'You can only borrow from friends');
    const charId = this.supportChar(friendId);
    if (!charId) throw badRequest('no_support', 'That friend has no support hero yet');
    if (!social.useSupport(userId, friendId, utcDay(now()))) throw badRequest('support_used', "You've already borrowed from this friend today");
    users.adjustWallet(friendId, { gold: this.ctx.content.current.settings.social.supportGold });
    const [member] = this.gear.teamMembers(friendId, [charId]);
    if (!member) throw badRequest('no_support', 'That friend has no support hero yet');
    return member;
  }
}
