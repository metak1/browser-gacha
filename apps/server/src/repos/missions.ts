import type { Database } from '../db/database';

export interface MissionProgressRow {
  missionId: string;
  period: string;
  progress: number;
  claimed: boolean;
}

export class MissionRepo {
  constructor(private readonly db: Database) {}

  forUser(userId: string): MissionProgressRow[] {
    return this.db
      .all<{ mission_id: string; period: string; progress: number; claimed: number }>(
        'SELECT mission_id, period, progress, claimed FROM mission_progress WHERE user_id = ?',
        userId,
      )
      .map((r) => ({ missionId: r.mission_id, period: r.period, progress: r.progress, claimed: r.claimed === 1 }));
  }

  increment(userId: string, missionId: string, period: string, amount: number) {
    this.db.run(
      `INSERT INTO mission_progress (user_id, mission_id, period, progress) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, mission_id, period) DO UPDATE SET progress = progress + excluded.progress`,
      userId, missionId, period, amount,
    );
  }

  /** Marks a mission claimed. Returns false if it already was. */
  markClaimed(userId: string, missionId: string, period: string): boolean {
    this.db.run(
      'INSERT OR IGNORE INTO mission_progress (user_id, mission_id, period) VALUES (?, ?, ?)',
      userId, missionId, period,
    );
    const { changes } = this.db.run(
      'UPDATE mission_progress SET claimed = 1 WHERE user_id = ? AND mission_id = ? AND period = ? AND claimed = 0',
      userId, missionId, period,
    );
    return changes === 1;
  }
}
