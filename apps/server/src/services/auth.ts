import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { conflict, HttpError, unauthorized } from '../errors';
import type { ServiceContext } from './context';
import { DUMMY_HASH, hashPassword, verifyPassword } from './password';

export const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export class AuthService {
  constructor(private readonly ctx: ServiceContext) {}

  /** Creates a new guest player with starter characters and returns a session token. */
  createGuest(): { userId: string; token: string } {
    const { db, users, roster, now, content } = this.ctx;
    const { settings, charactersById } = content.current;
    const starters = settings.starterCharacters.filter((id) => charactersById[id]);
    const userId = randomUUID();
    const t = now();
    db.transaction(() => {
      users.create(userId, { gems: settings.startingGems, gold: settings.startingGold, stardust: 0 }, t);
      for (const id of starters) roster.addCopy(userId, id, t);
      roster.setTeam(userId, starters);
    });
    return { userId, token: this.createSession(userId) };
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
