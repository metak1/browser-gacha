// Helpers shared by the dev command-line scripts.
import { loadConfig } from '../config';
import { Database } from '../db/database';
import type { User } from '../repos/users';
import { createContext, type ServiceContext } from '../services/context';

/** Opens the game database (DB_PATH, or the default) with the full service context. */
export function openContext(): ServiceContext {
  return createContext(new Database(loadConfig().dbPath));
}

/** Finds a player by username or id; with no argument, the most recently active player. */
export function findPlayer(ctx: ServiceContext, who: string | undefined): User {
  const user = who
    ? (ctx.users.findByUsername(who) ?? ctx.users.findById(who))
    : (() => {
        const row = ctx.db.get<{ user_id: string }>('SELECT user_id FROM sessions ORDER BY created_at DESC LIMIT 1');
        return row ? ctx.users.findById(row.user_id) : undefined;
      })();
  if (!user) throw new Error(who ? `No player with username or id "${who}"` : 'No players yet. Open the game once first.');
  return user;
}

export const playerName = (u: User) => u.username ?? `guest ${u.id}`;

/** Runs a script body, printing errors without a stack trace and closing the database. */
export function run(body: (ctx: ServiceContext) => void) {
  let ctx: ServiceContext | undefined;
  try {
    ctx = openContext();
    body(ctx);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    ctx?.db.close();
  }
}
