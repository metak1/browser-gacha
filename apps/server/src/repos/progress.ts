import type { BattleSetup } from '@gacha/shared';
import type { Database } from '../db/database';

export type BattleMode = 'campaign' | 'arena' | 'dungeon' | 'event' | 'guild' | 'tower';

export interface BattleRecord {
  id: string;
  userId: string;
  /** Stage id for campaign battles; '' for arena. */
  stageId: string;
  mode: BattleMode;
  /** Mode-specific details (the arena opponent). */
  meta: unknown;
  setup: BattleSetup;
  status: 'active' | 'won' | 'lost';
  createdAt: number;
}

interface BattleRow {
  id: string;
  user_id: string;
  stage_id: string;
  setup: string;
  status: BattleRecord['status'];
  mode: BattleMode;
  meta: string | null;
  created_at: number;
}

export class ProgressRepo {
  constructor(private readonly db: Database) {}

  /** Players by highest tower floor (ties: who got there first). */
  towerBoard(): { userId: string; floor: number }[] {
    return this.db
      .all<{ user_id: string; floor: number }>(
        `SELECT user_id, floor FROM (
         SELECT user_id, CAST(substr(stage_id, 7) AS INTEGER) AS floor, first_cleared_at,
                ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY CAST(substr(stage_id, 7) AS INTEGER) DESC) AS n
         FROM stage_clears WHERE stage_id LIKE 'tower:%'
       ) WHERE n = 1 ORDER BY floor DESC, first_cleared_at ASC`,
      )
      .map((r) => ({ userId: r.user_id, floor: r.floor }));
  }

  clearedStages(userId: string): string[] {
    return this.db.all<{ stage_id: string }>('SELECT stage_id FROM stage_clears WHERE user_id = ?', userId).map((r) => r.stage_id);
  }

  /** Best stars per cleared stage. */
  stageStars(userId: string): Record<string, number> {
    const rows = this.db.all<{ stage_id: string; stars: number }>('SELECT stage_id, stars FROM stage_clears WHERE user_id = ?', userId);
    return Object.fromEntries(rows.map((r) => [r.stage_id, r.stars]));
  }

  /**
   * Records a clear, keeping the best star count. Returns whether it was the
   * first clear and the previous best (0 if none).
   */
  recordClear(userId: string, stageId: string, now: number, stars = 1): { firstClear: boolean; previousStars: number } {
    const prev = this.db.get<{ stars: number }>('SELECT stars FROM stage_clears WHERE user_id = ? AND stage_id = ?', userId, stageId);
    if (!prev) {
      this.db.run('INSERT INTO stage_clears (user_id, stage_id, clears, first_cleared_at, stars) VALUES (?, ?, 1, ?, ?)', userId, stageId, now, stars);
      return { firstClear: true, previousStars: 0 };
    }
    this.db.run('UPDATE stage_clears SET clears = clears + 1, stars = MAX(stars, ?) WHERE user_id = ? AND stage_id = ?', stars, userId, stageId);
    return { firstClear: false, previousStars: prev.stars };
  }

  claimedChests(userId: string): string[] {
    return this.db
      .all<{ chapter_id: number; stars: number }>('SELECT chapter_id, stars FROM chapter_chests WHERE user_id = ?', userId)
      .map((r) => `${r.chapter_id}:${r.stars}`);
  }

  /** Marks a chest claimed. Returns false if it already was. */
  claimChest(userId: string, chapterId: number, stars: number, now: number): boolean {
    const { changes } = this.db.run(
      'INSERT OR IGNORE INTO chapter_chests (user_id, chapter_id, stars, claimed_at) VALUES (?, ?, ?, ?)',
      userId,
      chapterId,
      stars,
      now,
    );
    return changes === 1;
  }

  createBattle(b: Omit<BattleRecord, 'status'>) {
    this.db.run(
      "INSERT INTO battles (id, user_id, stage_id, setup, status, created_at, mode, meta) VALUES (?, ?, ?, ?, 'active', ?, ?, ?)",
      b.id,
      b.userId,
      b.stageId,
      JSON.stringify(b.setup),
      b.createdAt,
      b.mode,
      b.meta === undefined ? null : JSON.stringify(b.meta),
    );
  }

  findBattle(id: string): BattleRecord | undefined {
    const row = this.db.get<BattleRow>('SELECT * FROM battles WHERE id = ?', id);
    return (
      row && {
        id: row.id,
        userId: row.user_id,
        stageId: row.stage_id,
        mode: row.mode,
        meta: row.meta ? (JSON.parse(row.meta) as unknown) : null,
        setup: JSON.parse(row.setup) as BattleSetup,
        status: row.status,
        createdAt: row.created_at,
      }
    );
  }

  /** Moves an active battle to a final status. Returns false if it was already finished. */
  finishBattle(id: string, status: 'won' | 'lost', now: number): boolean {
    const { changes } = this.db.run("UPDATE battles SET status = ?, finished_at = ? WHERE id = ? AND status = 'active'", status, now, id);
    return changes === 1;
  }
}
