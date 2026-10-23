import type { Database } from '../db/database';

/** Winning dungeon runs per player, dungeon and UTC day. */
export class DungeonRepo {
  constructor(private readonly db: Database) {}

  runsOn(userId: string, day: string): Record<string, number> {
    const rows = this.db.all<{ dungeon_id: string; runs: number }>(
      'SELECT dungeon_id, runs FROM dungeon_runs WHERE user_id = ? AND day = ?',
      userId, day,
    );
    return Object.fromEntries(rows.map((r) => [r.dungeon_id, r.runs]));
  }

  addRun(userId: string, dungeonId: string, day: string) {
    this.db.run(
      `INSERT INTO dungeon_runs (user_id, dungeon_id, day, runs) VALUES (?, ?, ?, 1)
       ON CONFLICT (user_id, dungeon_id, day) DO UPDATE SET runs = runs + 1`,
      userId, dungeonId, day,
    );
  }
}
