import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import { migrate } from './migrations';

/** Thin typed wrapper over node:sqlite with statement caching and transactions. */
export class Database {
  private readonly db: DatabaseSync;
  private readonly statements = new Map<string, StatementSync>();
  private inTransaction = false;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    migrate(this.db);
  }

  private prepare(sql: string): StatementSync {
    let stmt = this.statements.get(sql);
    if (!stmt) {
      stmt = this.db.prepare(sql);
      this.statements.set(sql, stmt);
    }
    return stmt;
  }

  get<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
    return this.prepare(sql).get(...params) as T | undefined;
  }

  all<T>(sql: string, ...params: SQLInputValue[]): T[] {
    return this.prepare(sql).all(...params) as T[];
  }

  run(sql: string, ...params: SQLInputValue[]): { changes: number } {
    const result = this.prepare(sql).run(...params);
    return { changes: Number(result.changes) };
  }

  /** Runs fn atomically. Nested calls join the outer transaction. */
  transaction<T>(fn: () => T): T {
    if (this.inTransaction) return fn();
    this.db.exec('BEGIN IMMEDIATE');
    this.inTransaction = true;
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    } finally {
      this.inTransaction = false;
    }
  }

  close() {
    this.db.close();
  }
}
