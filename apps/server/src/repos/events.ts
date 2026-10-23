import type { Database } from '../db/database';

/** Per-player event currency and shop purchases. */
export class EventRepo {
  constructor(private readonly db: Database) {}

  all(userId: string): Record<string, { currency: number; purchases: Record<string, number> }> {
    const out: Record<string, { currency: number; purchases: Record<string, number> }> = {};
    for (const r of this.db.all<{ event_id: string; currency: number }>('SELECT event_id, currency FROM event_wallets WHERE user_id = ?', userId)) {
      out[r.event_id] = { currency: r.currency, purchases: {} };
    }
    for (const r of this.db.all<{ event_id: string; item_id: string; count: number }>('SELECT event_id, item_id, count FROM event_purchases WHERE user_id = ?', userId)) {
      (out[r.event_id] ??= { currency: 0, purchases: {} }).purchases[r.item_id] = r.count;
    }
    return out;
  }

  currency(userId: string, eventId: string): number {
    return this.db.get<{ currency: number }>('SELECT currency FROM event_wallets WHERE user_id = ? AND event_id = ?', userId, eventId)?.currency ?? 0;
  }

  addCurrency(userId: string, eventId: string, amount: number) {
    this.db.run(
      `INSERT INTO event_wallets (user_id, event_id, currency) VALUES (?, ?, ?)
       ON CONFLICT (user_id, event_id) DO UPDATE SET currency = currency + excluded.currency`,
      userId, eventId, amount,
    );
  }

  purchases(userId: string, eventId: string, itemId: string): number {
    return this.db.get<{ count: number }>('SELECT count FROM event_purchases WHERE user_id = ? AND event_id = ? AND item_id = ?', userId, eventId, itemId)?.count ?? 0;
  }

  addPurchases(userId: string, eventId: string, itemId: string, count: number) {
    this.db.run(
      `INSERT INTO event_purchases (user_id, event_id, item_id, count) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, event_id, item_id) DO UPDATE SET count = count + excluded.count`,
      userId, eventId, itemId, count,
    );
  }
}
