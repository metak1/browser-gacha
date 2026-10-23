import type { Database } from '../db/database';

export interface ContentRow {
  kind: string;
  id: string;
  data: unknown;
}

/** Raw storage for content documents. Validation and indexing live in ContentService. */
export class ContentRepo {
  constructor(private readonly db: Database) {}

  /** All documents in creation order (upserts keep their original position). */
  all(): ContentRow[] {
    return this.db
      .all<{ kind: string; id: string; data: string }>('SELECT kind, id, data FROM content ORDER BY rowid')
      .map((r) => ({ kind: r.kind, id: r.id, data: JSON.parse(r.data) as unknown }));
  }

  upsert(kind: string, id: string, data: unknown, now: number) {
    this.db.run(
      `INSERT INTO content (kind, id, data, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (kind, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      kind, id, JSON.stringify(data), now,
    );
  }

  delete(kind: string, id: string) {
    this.db.run('DELETE FROM content WHERE kind = ? AND id = ?', kind, id);
  }

  deleteAll() {
    this.db.run('DELETE FROM content');
  }

  version(): number {
    return this.meta('content_version');
  }

  setVersion(version: number) {
    this.setMeta('content_version', version);
  }

  /** Which content upgrades (see upgradeContent) have been applied. */
  schemaVersion(): number {
    return this.meta('content_schema');
  }

  setSchemaVersion(version: number) {
    this.setMeta('content_schema', version);
  }

  private meta(key: string): number {
    return Number(this.db.get<{ value: string }>('SELECT value FROM meta WHERE key = ?', key)?.value ?? 0);
  }

  private setMeta(key: string, value: number) {
    this.db.run(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      key, String(value),
    );
  }
}
