import type { Database } from '../db/database';

export interface GuildRow {
  id: string;
  name: string;
  description: string;
  open: boolean;
  createdAt: number;
}

interface Row {
  id: string;
  name: string;
  description: string;
  open: number;
  created_at: number;
}

const toGuild = (r: Row): GuildRow => ({ id: r.id, name: r.name, description: r.description, open: r.open === 1, createdAt: r.created_at });

export class GuildRepo {
  constructor(private readonly db: Database) {}

  create(g: GuildRow) {
    this.db.run('INSERT INTO guilds (id, name, description, open, created_at) VALUES (?, ?, ?, ?, ?)', g.id, g.name, g.description, g.open ? 1 : 0, g.createdAt);
  }

  get(id: string): GuildRow | undefined {
    const r = this.db.get<Row>('SELECT * FROM guilds WHERE id = ?', id);
    return r && toGuild(r);
  }

  byName(name: string): GuildRow | undefined {
    const r = this.db.get<Row>('SELECT * FROM guilds WHERE name = ?', name);
    return r && toGuild(r);
  }

  update(id: string, patch: { description: string; open: boolean }) {
    this.db.run('UPDATE guilds SET description = ?, open = ? WHERE id = ?', patch.description, patch.open ? 1 : 0, id);
  }

  delete(id: string) {
    this.db.run('DELETE FROM guilds WHERE id = ?', id);
  }

  /** Guilds by name match (or all), most members first, with their size. */
  search(query: string, limit: number): (GuildRow & { members: number })[] {
    const q = query.trim();
    return this.db
      .all<Row & { members: number }>(
        `SELECT g.*, (SELECT count(*) FROM guild_members m WHERE m.guild_id = g.id) AS members
         FROM guilds g WHERE ? = '' OR instr(lower(g.name), lower(?)) > 0
         ORDER BY members DESC, g.created_at LIMIT ?`,
        q, q, limit,
      )
      .map((r) => ({ ...toGuild(r), members: r.members }));
  }

  membership(userId: string): { guildId: string; role: 'leader' | 'member' } | undefined {
    const r = this.db.get<{ guild_id: string; role: 'leader' | 'member' }>('SELECT guild_id, role FROM guild_members WHERE user_id = ?', userId);
    return r && { guildId: r.guild_id, role: r.role };
  }

  members(guildId: string): { userId: string; role: 'leader' | 'member'; joinedAt: number }[] {
    return this.db
      .all<{ user_id: string; role: 'leader' | 'member'; joined_at: number }>('SELECT user_id, role, joined_at FROM guild_members WHERE guild_id = ? ORDER BY joined_at', guildId)
      .map((r) => ({ userId: r.user_id, role: r.role, joinedAt: r.joined_at }));
  }

  addMember(guildId: string, userId: string, role: 'leader' | 'member', now: number) {
    this.db.run('INSERT INTO guild_members (user_id, guild_id, role, joined_at) VALUES (?, ?, ?, ?)', userId, guildId, role, now);
  }

  removeMember(userId: string) {
    this.db.run('DELETE FROM guild_members WHERE user_id = ?', userId);
  }

  setRole(userId: string, role: 'leader' | 'member') {
    this.db.run('UPDATE guild_members SET role = ? WHERE user_id = ?', role, userId);
  }

  // ---------- weekly boss ----------

  damage(guildId: string, week: string): { userId: string; damage: number; attacks: number }[] {
    return this.db
      .all<{ user_id: string; damage: number; attacks: number }>('SELECT user_id, damage, attacks FROM guild_damage WHERE guild_id = ? AND week = ?', guildId, week)
      .map((r) => ({ userId: r.user_id, damage: r.damage, attacks: r.attacks }));
  }

  addDamage(guildId: string, week: string, userId: string, damage: number) {
    this.db.run(
      `INSERT INTO guild_damage (guild_id, week, user_id, damage, attacks) VALUES (?, ?, ?, ?, 1)
       ON CONFLICT (guild_id, week, user_id) DO UPDATE SET damage = damage + excluded.damage, attacks = attacks + 1`,
      guildId, week, userId, damage,
    );
  }

  attemptsOn(userId: string, day: string): number {
    return this.db.get<{ count: number }>('SELECT count FROM guild_attempts WHERE user_id = ? AND day = ?', userId, day)?.count ?? 0;
  }

  addAttempt(userId: string, day: string) {
    this.db.run(
      `INSERT INTO guild_attempts (user_id, day, count) VALUES (?, ?, 1)
       ON CONFLICT (user_id, day) DO UPDATE SET count = count + 1`,
      userId, day,
    );
  }

  claimedChests(userId: string, week: string): number[] {
    return this.db.all<{ percent: number }>('SELECT percent FROM guild_chests WHERE user_id = ? AND week = ?', userId, week).map((r) => r.percent);
  }

  claimChest(userId: string, week: string, percent: number): boolean {
    return this.db.run('INSERT OR IGNORE INTO guild_chests (user_id, week, percent) VALUES (?, ?, ?)', userId, week, percent).changes === 1;
  }
}
