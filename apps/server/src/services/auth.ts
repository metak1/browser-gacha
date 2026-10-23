import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { conflict, HttpError, unauthorized } from '../errors';
import type { ServiceContext } from './context';
import type { GuildService } from './guild';
import { DUMMY_HASH, hashPassword, verifyPassword } from './password';

export const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export class AuthService {
  constructor(
    private readonly ctx: ServiceContext,
    private readonly guild: GuildService,
  ) {}

  /** Creates a new guest player with starter characters and returns a session token. */
  createGuest(): { userId: string; token: string } {
    const userId = randomUUID();
    this.ctx.db.transaction(() => this.createPlayer(userId));
    return { userId, token: this.createSession(userId) };
  }

  /**
   * Wipes all of a player's progress and starts them over as a new player,
   * keeping their id, login and role. Signs out every device; returns a new session token.
   */
  resetAccount(userId: string): string {
    const { db, users, guilds, arena } = this.ctx;
    const user = users.findById(userId);
    if (!user) throw unauthorized();
    db.transaction(() => {
      if (guilds.membership(userId)) this.guild.leave(userId); // hands over or disbands their guild
      arena.forgetPlayer(userId);
      users.delete(userId);
      this.createPlayer(userId);
      if (user.username && user.passwordHash) users.setCredentials(userId, user.username, user.passwordHash);
      if (user.role !== 'player') users.setRole(userId, user.role);
    });
    return this.createSession(userId);
  }

  private createPlayer(userId: string) {
    const { users, roster, now, content } = this.ctx;
    const { settings, charactersById } = content.current;
    const starters = settings.starterCharacters.filter((id) => charactersById[id]);
    const t = now();
    users.create(userId, { gems: settings.startingGems, gold: settings.startingGold, stardust: 0 }, t);
    for (const id of starters) roster.addCopy(userId, id, t);
    roster.setTeam(userId, starters);
  }

  /** Returns the user id for a session token, or null if it's unknown or expired. */
  resolveSession(token: string): string | null {
    return this.ctx.sessions.findUserId(hashToken(token), this.ctx.now()) ?? null;
  }

  /** Turns a guest into a registered account so it can be used on other devices. */
  async linkAccount(userId: string, username: string, password: string) {
    const { users, db } = this.ctx;
    const user = users.findById(userId);
    if (!user) throw unauthorized();
    if (user.username) throw conflict('already_linked', 'This account already has a username');
    const passwordHash = await hashPassword(password);
    db.transaction(() => {
      if (users.findByUsername(username)) throw conflict('username_taken', 'That username is taken');
      users.setCredentials(userId, username, passwordHash);
    });
  }

  async login(username: string, password: string): Promise<{ userId: string; token: string }> {
    const user = this.ctx.users.findByUsername(username);
    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw new HttpError(401, 'invalid_credentials', 'Wrong username or password');
    return { userId: user.id, token: this.createSession(user.id) };
  }

  logout(token: string) {
    this.ctx.sessions.delete(hashToken(token));
  }

  private createSession(userId: string): string {
    const token = randomBytes(32).toString('base64url');
    const t = this.ctx.now();
    this.ctx.sessions.create(hashToken(token), userId, t, t + SESSION_TTL_MS);
    return token;
  }
}
