import type { Database } from '../db/database';

/** An opponent the server offered; arena battles can only target these. */
export interface ArenaOffer {
  id: string;
  name: string;
  rating: number;
  isBot: boolean;
  /** Bots carry their whole team; real players are looked up when fighting. */
  bot?: { level: number; team: string[] };
}

export interface ArenaPlayer {
  userId: string;
  rating: number;
  wins: number;
  losses: number;
  defense: string[];
  ticketDay: string | null;
  ticketsUsed: number;
  week: string | null;
  offers: ArenaOffer[];
}

interface Row {
  user_id: string;
  rating: number;
  wins: number;
  losses: number;
  defense: string;
  ticket_day: string | null;
  tickets_used: number;
  week: string | null;
  offers: string;
}

const toPlayer = (r: Row): ArenaPlayer => ({
  userId: r.user_id,
  rating: r.rating,
  wins: r.wins,
  losses: r.losses,
  defense: JSON.parse(r.defense) as string[],
  ticketDay: r.ticket_day,
  ticketsUsed: r.tickets_used,
  week: r.week,
  offers: JSON.parse(r.offers) as ArenaOffer[],
});

export interface ArenaHistoryRow {
  id: number;
  attackerId: string;
  defenderId: string | null;
  attackerName: string;
  defenderName: string;
  attackerWon: boolean;
  attackerDelta: number;
  defenderDelta: number;
  createdAt: number;
}

export class ArenaRepo {
  constructor(private readonly db: Database) {}

  get(userId: string): ArenaPlayer | undefined {
    const row = this.db.get<Row>('SELECT * FROM arena_players WHERE user_id = ?', userId);
    return row && toPlayer(row);
  }

  create(userId: string, rating: number, defense: string[], week: string) {
    this.db.run(
      'INSERT OR IGNORE INTO arena_players (user_id, rating, defense, week) VALUES (?, ?, ?, ?)',
      userId, rating, JSON.stringify(defense), week,
    );
  }

  save(p: ArenaPlayer) {
    this.db.run(
      `UPDATE arena_players SET rating = ?, wins = ?, losses = ?, defense = ?, ticket_day = ?, tickets_used = ?, week = ?, offers = ?
       WHERE user_id = ?`,
      p.rating, p.wins, p.losses, JSON.stringify(p.defense), p.ticketDay, p.ticketsUsed, p.week, JSON.stringify(p.offers), p.userId,
    );
  }

  /** Real players with a defense team, closest in rating first. */
  nearby(userId: string, rating: number, limit: number): ArenaPlayer[] {
    return this.db
      .all<Row>(
        `SELECT * FROM arena_players WHERE user_id != ? AND defense != '[]'
         ORDER BY abs(rating - ?) LIMIT ?`,
        userId, rating, limit,
      )
      .map(toPlayer);
  }

  rank(rating: number): number {
    return this.db.get<{ n: number }>('SELECT count(*) AS n FROM arena_players WHERE rating > ?', rating)!.n + 1;
  }

  top(limit: number): { userId: string; username: string | null; rating: number }[] {
    return this.db.all<{ userId: string; username: string | null; rating: number }>(
      `SELECT a.user_id AS userId, u.username AS username, a.rating AS rating
       FROM arena_players a JOIN users u ON u.id = a.user_id
       ORDER BY a.rating DESC, a.wins DESC LIMIT ?`,
      limit,
    );
  }

  addHistory(h: Omit<ArenaHistoryRow, 'id'>) {
    this.db.run(
      `INSERT INTO arena_history (attacker_id, defender_id, attacker_name, defender_name, attacker_won, attacker_delta, defender_delta, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      h.attackerId, h.defenderId, h.attackerName, h.defenderName, h.attackerWon ? 1 : 0, h.attackerDelta, h.defenderDelta, h.createdAt,
    );
  }

  /** Drops a player's own fights; in their opponents' history they become a nameless past opponent. */
  forgetPlayer(userId: string) {
    this.db.run('DELETE FROM arena_history WHERE attacker_id = ?', userId);
    this.db.run('UPDATE arena_history SET defender_id = NULL WHERE defender_id = ?', userId);
  }

  history(userId: string, limit: number): ArenaHistoryRow[] {
    return this.db
      .all<{
        id: number;
        attacker_id: string;
        defender_id: string | null;
        attacker_name: string;
        defender_name: string;
        attacker_won: number;
        attacker_delta: number;
        defender_delta: number;
        created_at: number;
      }>(
        'SELECT * FROM arena_history WHERE attacker_id = ? OR defender_id = ? ORDER BY id DESC LIMIT ?',
        userId, userId, limit,
      )
      .map((r) => ({
        id: r.id,
        attackerId: r.attacker_id,
        defenderId: r.defender_id,
        attackerName: r.attacker_name,
        defenderName: r.defender_name,
        attackerWon: r.attacker_won === 1,
        attackerDelta: r.attacker_delta,
        defenderDelta: r.defender_delta,
        createdAt: r.created_at,
      }));
  }
}
