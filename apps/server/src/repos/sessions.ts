import type { Database } from '../db/database';

export class SessionRepo {
  constructor(private readonly db: Database) {}

  create(tokenHash: string, userId: string, now: number, expiresAt: number) {
    this.db.run(
      'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
      tokenHash, userId, now, expiresAt,
    );
  }

  findUserId(tokenHash: string, now: number): string | undefined {
    return this.db.get<{ user_id: string }>(
      'SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?',
      tokenHash, now,
    )?.user_id;
  }

  delete(tokenHash: string) {
    this.db.run('DELETE FROM sessions WHERE token_hash = ?', tokenHash);
  }

  deleteExpired(now: number) {
    this.db.run('DELETE FROM sessions WHERE expires_at <= ?', now);
  }
}
