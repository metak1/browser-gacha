import { newBannerState, type BannerState, type PullHistoryEntryDTO, type PullResult } from '@gacha/shared';
import type { Database } from '../db/database';

interface BannerRow {
  banner_id: string;
  pity5: number;
  pity4: number;
  guaranteed5: number;
  guaranteed4: number;
}

const toState = (r: BannerRow): BannerState => ({
  pity5: r.pity5,
  pity4: r.pity4,
  guaranteed5: r.guaranteed5 === 1,
  guaranteed4: r.guaranteed4 === 1,
});

export class GachaRepo {
  constructor(private readonly db: Database) {}

  allBannerStates(userId: string): Record<string, BannerState> {
    const rows = this.db.all<BannerRow>('SELECT * FROM banner_states WHERE user_id = ?', userId);
    return Object.fromEntries(rows.map((r) => [r.banner_id, toState(r)]));
  }

  bannerState(userId: string, bannerId: string): BannerState {
    const row = this.db.get<BannerRow>('SELECT * FROM banner_states WHERE user_id = ? AND banner_id = ?', userId, bannerId);
    return row ? toState(row) : newBannerState();
  }

  saveBannerState(userId: string, bannerId: string, s: BannerState) {
    this.db.run(
      `INSERT INTO banner_states (user_id, banner_id, pity5, pity4, guaranteed5, guaranteed4) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, banner_id) DO UPDATE SET
         pity5 = excluded.pity5, pity4 = excluded.pity4,
         guaranteed5 = excluded.guaranteed5, guaranteed4 = excluded.guaranteed4`,
      userId,
      bannerId,
      s.pity5,
      s.pity4,
      s.guaranteed5 ? 1 : 0,
      s.guaranteed4 ? 1 : 0,
    );
  }

  recordPull(userId: string, bannerId: string, pull: PullResult, now: number) {
    this.db.run(
      'INSERT INTO pulls (user_id, banner_id, char_id, rarity, pity, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      userId,
      bannerId,
      pull.id,
      pull.rarity,
      pull.pity,
      now,
    );
  }

  recentPulls(userId: string, limit: number): PullHistoryEntryDTO[] {
    return this.db.all<PullHistoryEntryDTO>(
      `SELECT char_id AS charId, rarity, banner_id AS bannerId, pity, created_at AS createdAt
       FROM pulls WHERE user_id = ? ORDER BY id DESC LIMIT ?`,
      userId,
      limit,
    );
  }
}
