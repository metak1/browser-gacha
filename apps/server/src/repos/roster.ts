import type { OwnedCharacterDTO } from '@gacha/shared';
import type { Database } from '../db/database';

const COLUMNS = 'char_id AS id, level, copies, ascension, skill_level AS skillLevel, ult_level AS ultLevel';

export class RosterRepo {
  constructor(private readonly db: Database) {}

  list(userId: string): OwnedCharacterDTO[] {
    return this.db.all<OwnedCharacterDTO>(
      `SELECT ${COLUMNS} FROM characters WHERE user_id = ? ORDER BY obtained_at, char_id`,
      userId,
    );
  }

  get(userId: string, charId: string): OwnedCharacterDTO | undefined {
    return this.db.get<OwnedCharacterDTO>(`SELECT ${COLUMNS} FROM characters WHERE user_id = ? AND char_id = ?`, userId, charId);
  }

  setAscension(userId: string, charId: string, rank: number) {
    this.db.run('UPDATE characters SET ascension = ? WHERE user_id = ? AND char_id = ?', rank, userId, charId);
  }

  setSkillLevel(userId: string, charId: string, slot: 'skill' | 'ultimate', level: number) {
    const column = slot === 'skill' ? 'skill_level' : 'ult_level';
    this.db.run(`UPDATE characters SET ${column} = ? WHERE user_id = ? AND char_id = ?`, level, userId, charId);
  }

  /** Adds one copy, creating the character at level 1 if new. Returns the new copy count. */
  addCopy(userId: string, charId: string, now: number): number {
    this.db.run(
      `INSERT INTO characters (user_id, char_id, copies, level, obtained_at) VALUES (?, ?, 1, 1, ?)
       ON CONFLICT (user_id, char_id) DO UPDATE SET copies = copies + 1`,
      userId, charId, now,
    );
    return this.get(userId, charId)!.copies;
  }

  setCopies(userId: string, charId: string, copies: number) {
    this.db.run('UPDATE characters SET copies = ? WHERE user_id = ? AND char_id = ?', copies, userId, charId);
  }

  setLevel(userId: string, charId: string, level: number) {
    this.db.run('UPDATE characters SET level = ? WHERE user_id = ? AND char_id = ?', level, userId, charId);
  }

  getTeam(userId: string): string[] {
    const row = this.db.get<{ slots: string }>('SELECT slots FROM teams WHERE user_id = ?', userId);
    return row ? (JSON.parse(row.slots) as string[]) : [];
  }

  setTeam(userId: string, team: string[]) {
    this.db.run(
      'INSERT INTO teams (user_id, slots) VALUES (?, ?) ON CONFLICT (user_id) DO UPDATE SET slots = excluded.slots',
      userId, JSON.stringify(team),
    );
  }

  activePreset(userId: string): number {
    return this.db.get<{ active_preset: number }>('SELECT active_preset FROM teams WHERE user_id = ?', userId)?.active_preset ?? 0;
  }

  setActivePreset(userId: string, slot: number) {
    this.db.run('UPDATE teams SET active_preset = ? WHERE user_id = ?', slot, userId);
  }

  /** Saved presets by slot. The active preset's row may be stale: its members are the current team. */
  presets(userId: string): Map<number, { name: string; members: string[] }> {
    const rows = this.db.all<{ slot: number; name: string; members: string }>('SELECT slot, name, members FROM team_presets WHERE user_id = ?', userId);
    return new Map(rows.map((r) => [r.slot, { name: r.name, members: JSON.parse(r.members) as string[] }]));
  }

  savePreset(userId: string, slot: number, preset: { name: string; members: string[] }) {
    this.db.run(
      `INSERT INTO team_presets (user_id, slot, name, members) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, slot) DO UPDATE SET name = excluded.name, members = excluded.members`,
      userId, slot, preset.name, JSON.stringify(preset.members),
    );
  }
}
