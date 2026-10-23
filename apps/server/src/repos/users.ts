import type { UserRole, WalletDTO } from '@gacha/shared';
import type { Database } from '../db/database';

export interface User {
  id: string;
  username: string | null;
  passwordHash: string | null;
  role: UserRole;
  wallet: WalletDTO;
  lastDaily: string | null;
  createdAt: number;
}

interface UserRow {
  id: string;
  username: string | null;
  password_hash: string | null;
  role: UserRole;
  gems: number;
  gold: number;
  stardust: number;
  last_daily: string | null;
  created_at: number;
}

const toUser = (r: UserRow): User => ({
  id: r.id,
  username: r.username,
  passwordHash: r.password_hash,
  role: r.role,
  wallet: { gems: r.gems, gold: r.gold, stardust: r.stardust },
  lastDaily: r.last_daily,
  createdAt: r.created_at,
});

export class UserRepo {
  constructor(private readonly db: Database) {}

  create(id: string, wallet: WalletDTO, now: number) {
    this.db.run(
      'INSERT INTO users (id, gems, gold, stardust, created_at) VALUES (?, ?, ?, ?, ?)',
      id, wallet.gems, wallet.gold, wallet.stardust, now,
    );
  }

  findById(id: string): User | undefined {
    const row = this.db.get<UserRow>('SELECT * FROM users WHERE id = ?', id);
    return row && toUser(row);
  }

  findByUsername(username: string): User | undefined {
    const row = this.db.get<UserRow>('SELECT * FROM users WHERE username = ?', username);
    return row && toUser(row);
  }

  setCredentials(id: string, username: string, passwordHash: string) {
    this.db.run('UPDATE users SET username = ?, password_hash = ? WHERE id = ?', username, passwordHash, id);
  }

  /** Adds (or subtracts) currency. Callers check balances first inside a transaction. */
  adjustWallet(id: string, delta: Partial<WalletDTO>) {
    this.db.run(
      'UPDATE users SET gems = gems + ?, gold = gold + ?, stardust = stardust + ? WHERE id = ?',
      delta.gems ?? 0, delta.gold ?? 0, delta.stardust ?? 0, id,
    );
  }

  setRole(id: string, role: UserRole) {
    this.db.run('UPDATE users SET role = ? WHERE id = ?', role, id);
  }

  /** Most recently created players, optionally filtered by username or id prefix. */
  search(query: string, limit: number): User[] {
    const q = query.trim();
    // instr/substr instead of LIKE, so user input needs no wildcard escaping.
    const rows = q
      ? this.db.all<UserRow>(
          `SELECT * FROM users
           WHERE instr(lower(coalesce(username, '')), lower(?)) > 0 OR substr(id, 1, length(?)) = ?
           ORDER BY created_at DESC LIMIT ?`,
          q, q, q, limit,
        )
      : this.db.all<UserRow>('SELECT * FROM users ORDER BY created_at DESC LIMIT ?', limit);
    return rows.map(toUser);
  }

  stamina(id: string): { value: number | null; at: number } {
    const row = this.db.get<{ stamina: number | null; stamina_at: number }>('SELECT stamina, stamina_at FROM users WHERE id = ?', id);
    return { value: row?.stamina ?? null, at: row?.stamina_at ?? 0 };
  }

  setStamina(id: string, value: number, at: number) {
    this.db.run('UPDATE users SET stamina = ?, stamina_at = ? WHERE id = ?', value, at, id);
  }

  account(id: string): { xp: number; title: string | null; supportChar: string | null; loginDays: number } {
    const r = this.db.get<{ xp: number; title: string | null; support_char: string | null; login_days: number }>(
      'SELECT xp, title, support_char, login_days FROM users WHERE id = ?',
      id,
    );
    return { xp: r?.xp ?? 0, title: r?.title ?? null, supportChar: r?.support_char ?? null, loginDays: r?.login_days ?? 0 };
  }

  setXp(id: string, xp: number) {
    this.db.run('UPDATE users SET xp = ? WHERE id = ?', xp, id);
  }

  setTitle(id: string, title: string | null) {
    this.db.run('UPDATE users SET title = ? WHERE id = ?', title, id);
  }

  setSupportChar(id: string, charId: string | null) {
    this.db.run('UPDATE users SET support_char = ? WHERE id = ?', charId, id);
  }

  incLoginDays(id: string) {
    this.db.run('UPDATE users SET login_days = login_days + 1 WHERE id = ?', id);
  }

  /** Looks a player up by friend code (the first 10 hex digits of their id). */
  findByFriendCode(code: string): string | undefined {
    if (!/^[0-9A-F]{10}$/.test(code)) return undefined;
    return this.db.get<{ id: string }>("SELECT id FROM users WHERE upper(substr(replace(id, '-', ''), 1, 10)) = ?", code)?.id;
  }

  prefs(id: string): Record<string, unknown> {
    const row = this.db.get<{ prefs: string }>('SELECT prefs FROM users WHERE id = ?', id);
    return row ? (JSON.parse(row.prefs) as Record<string, unknown>) : {};
  }

  setPrefs(id: string, prefs: Record<string, unknown>) {
    this.db.run('UPDATE users SET prefs = ? WHERE id = ?', JSON.stringify(prefs), id);
  }

  flags(id: string): string[] {
    const row = this.db.get<{ flags: string }>('SELECT flags FROM users WHERE id = ?', id);
    return row ? (JSON.parse(row.flags) as string[]) : [];
  }

  setFlags(id: string, flags: string[]) {
    this.db.run('UPDATE users SET flags = ? WHERE id = ?', JSON.stringify(flags), id);
  }

  setLastDaily(id: string, day: string) {
    this.db.run('UPDATE users SET last_daily = ? WHERE id = ?', day, id);
  }
}
