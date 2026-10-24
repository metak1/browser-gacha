import type { Database } from '../db/database';

/** Per-player material counts (essences, crystals, tomes...). */
export class MaterialRepo {
  constructor(private readonly db: Database) {}

  all(userId: string): Record<string, number> {
    const rows = this.db.all<{ material_id: string; count: number }>('SELECT material_id, count FROM materials WHERE user_id = ? AND count > 0', userId);
    return Object.fromEntries(rows.map((r) => [r.material_id, r.count]));
  }

  count(userId: string, materialId: string): number {
    return this.db.get<{ count: number }>('SELECT count FROM materials WHERE user_id = ? AND material_id = ?', userId, materialId)?.count ?? 0;
  }

  add(userId: string, materialId: string, amount: number) {
    if (amount <= 0) return;
    this.db.run(
      `INSERT INTO materials (user_id, material_id, count) VALUES (?, ?, ?)
       ON CONFLICT (user_id, material_id) DO UPDATE SET count = count + excluded.count`,
      userId,
      materialId,
      amount,
    );
  }

  /** Removes materials; returns false (changing nothing) if there aren't enough. */
  spend(userId: string, materialId: string, amount: number): boolean {
    if (amount <= 0) return true;
    const { changes } = this.db.run(
      'UPDATE materials SET count = count - ? WHERE user_id = ? AND material_id = ? AND count >= ?',
      amount,
      userId,
      materialId,
      amount,
    );
    return changes === 1;
  }
}
