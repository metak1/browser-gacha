import type { Database } from '../db/database';

/**
 * Friendships. A request is one 'pending' row from the asker to the target;
 * accepting turns it into a pair of 'accepted' rows, one each way.
 */
export class SocialRepo {
  constructor(private readonly db: Database) {}

  friendIds(userId: string): string[] {
    return this.db
      .all<{ friend_id: string }>("SELECT friend_id FROM friends WHERE user_id = ? AND status = 'accepted' ORDER BY created_at", userId)
      .map((r) => r.friend_id);
  }

  /** Pending requests involving the player: asked of them (incoming) or by them. */
  pending(userId: string): { otherId: string; incoming: boolean }[] {
    return [
      ...this.db
        .all<{ user_id: string }>("SELECT user_id FROM friends WHERE friend_id = ? AND status = 'pending'", userId)
        .map((r) => ({ otherId: r.user_id, incoming: true })),
      ...this.db
        .all<{ friend_id: string }>("SELECT friend_id FROM friends WHERE user_id = ? AND status = 'pending'", userId)
        .map((r) => ({ otherId: r.friend_id, incoming: false })),
    ];
  }

  status(userId: string, otherId: string): 'pending' | 'accepted' | null {
    return this.db.get<{ status: 'pending' | 'accepted' }>('SELECT status FROM friends WHERE user_id = ? AND friend_id = ?', userId, otherId)?.status ?? null;
  }

  request(userId: string, otherId: string, now: number) {
    this.db.run("INSERT OR IGNORE INTO friends (user_id, friend_id, status, created_at) VALUES (?, ?, 'pending', ?)", userId, otherId, now);
  }

  accept(userId: string, fromId: string, now: number) {
    this.db.run("UPDATE friends SET status = 'accepted', created_at = ? WHERE user_id = ? AND friend_id = ?", now, fromId, userId);
    this.db.run(
      `INSERT INTO friends (user_id, friend_id, status, created_at) VALUES (?, ?, 'accepted', ?)
       ON CONFLICT (user_id, friend_id) DO UPDATE SET status = 'accepted'`,
      userId, fromId, now,
    );
  }

  /** Removes a friendship or request in both directions. */
  remove(userId: string, otherId: string) {
    this.db.run('DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)', userId, otherId, otherId, userId);
  }

  supportUsedOn(userId: string, day: string): string[] {
    return this.db.all<{ friend_id: string }>('SELECT friend_id FROM support_uses WHERE user_id = ? AND day = ?', userId, day).map((r) => r.friend_id);
  }

  /** Records a borrow. Returns false if this friend was already borrowed today. */
  useSupport(userId: string, friendId: string, day: string): boolean {
    return this.db.run('INSERT OR IGNORE INTO support_uses (user_id, friend_id, day) VALUES (?, ?, ?)', userId, friendId, day).changes === 1;
  }
}
