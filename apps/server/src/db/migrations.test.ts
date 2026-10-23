import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { migrate } from './migrations';

describe('migrations', () => {
  it('v12 moves gear with SPD as its main stat into the boots slot', () => {
    const db = new DatabaseSync(':memory:');
    migrate(db);
    // Back to v11, with an old SPD charm (equipped) and a normal charm.
    db.exec('ALTER TABLE gear DROP COLUMN set_id; ALTER TABLE gear DROP COLUMN locked; ALTER TABLE characters DROP COLUMN gear_set; PRAGMA user_version = 11');
    db.prepare("INSERT INTO users (id, gems, gold, created_at) VALUES ('u', 0, 0, 0)").run();
    const insert = db.prepare(
      "INSERT INTO gear (id, user_id, template_id, slot, rarity, level, main_base, main, subs, equipped_to, created_at) VALUES (?, 'u', ?, 'charm', 5, 0, 6, ?, '[]', 'aldric', 0)",
    );
    insert.run('feather', 'swift-feather', JSON.stringify({ stat: 'spd', value: 6 }));
    db.prepare(
      "INSERT INTO gear (id, user_id, template_id, slot, rarity, level, main_base, main, subs, equipped_to, created_at) VALUES ('locket', 'u', 'heart-locket', 'charm', 5, 0, 0.1, ?, '[]', NULL, 0)",
    ).run(JSON.stringify({ stat: 'hpPct', value: 0.1 }));

    migrate(db);
    const slots = Object.fromEntries(db.prepare('SELECT id, slot, equipped_to FROM gear').all().map((r) => [r.id, r]));
    // Still worn by the same hero, now in their boots slot.
    expect(slots.feather).toMatchObject({ slot: 'boots', equipped_to: 'aldric' });
    expect(slots.locket).toMatchObject({ slot: 'charm' });
    db.close();
  });
});
