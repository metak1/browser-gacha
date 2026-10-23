import type { GearItem, GearRoll, GearSlot, Rarity } from '@gacha/shared';
import type { Database } from '../db/database';

interface GearRow {
  id: string;
  template_id: string;
  slot: GearSlot;
  rarity: Rarity;
  level: number;
  main_base: number;
  main: string;
  subs: string;
  equipped_to: string | null;
}

const toItem = (r: GearRow): GearItem => ({
  id: r.id,
  templateId: r.template_id,
  slot: r.slot,
  rarity: r.rarity,
  level: r.level,
  mainBase: r.main_base,
  main: JSON.parse(r.main) as GearRoll,
  subs: JSON.parse(r.subs) as GearRoll[],
  equippedTo: r.equipped_to,
});

export class GearRepo {
  constructor(private readonly db: Database) {}

  list(userId: string): GearItem[] {
    return this.db.all<GearRow>('SELECT * FROM gear WHERE user_id = ? ORDER BY created_at DESC, id', userId).map(toItem);
  }

  get(userId: string, id: string): GearItem | undefined {
    const row = this.db.get<GearRow>('SELECT * FROM gear WHERE user_id = ? AND id = ?', userId, id);
    return row && toItem(row);
  }

  count(userId: string): number {
    return this.db.get<{ n: number }>('SELECT count(*) AS n FROM gear WHERE user_id = ?', userId)!.n;
  }

  equippedOn(userId: string, charId: string): GearItem[] {
    return this.db.all<GearRow>('SELECT * FROM gear WHERE user_id = ? AND equipped_to = ?', userId, charId).map(toItem);
  }

  insert(userId: string, item: GearItem, now: number) {
    this.db.run(
      `INSERT INTO gear (id, user_id, template_id, slot, rarity, level, main_base, main, subs, equipped_to, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      item.id, userId, item.templateId, item.slot, item.rarity, item.level, item.mainBase,
      JSON.stringify(item.main), JSON.stringify(item.subs), item.equippedTo, now,
    );
  }

  saveRolls(userId: string, item: GearItem) {
    this.db.run(
      'UPDATE gear SET level = ?, main = ?, subs = ? WHERE user_id = ? AND id = ?',
      item.level, JSON.stringify(item.main), JSON.stringify(item.subs), userId, item.id,
    );
  }

  setEquipped(userId: string, id: string, charId: string | null) {
    this.db.run('UPDATE gear SET equipped_to = ? WHERE user_id = ? AND id = ?', charId, userId, id);
  }

  unequipSlot(userId: string, charId: string, slot: GearSlot) {
    this.db.run('UPDATE gear SET equipped_to = NULL WHERE user_id = ? AND equipped_to = ? AND slot = ?', userId, charId, slot);
  }

  delete(userId: string, id: string) {
    this.db.run('DELETE FROM gear WHERE user_id = ? AND id = ?', userId, id);
  }
}
