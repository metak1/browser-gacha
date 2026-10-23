import {
  bundleSchema,
  CONTENT_KINDS,
  CONTENT_SCHEMA_VERSION,
  CONTENT_SCHEMAS,
  createDefaultContent,
  indexContent,
  settingsSchema,
  upgradeContent,
  validateBundle,
  type ContentBundle,
  type ContentDocs,
  type ContentIndex,
  type ContentKind,
} from '@gacha/shared';
import type { Database } from '../db/database';
import { badRequest, notFound } from '../errors';
import type { ContentRepo } from '../repos/content';

const SETTINGS_KIND = 'settings';
const SETTINGS_ID = 'game';

export const isContentKind = (k: string): k is ContentKind => (CONTENT_KINDS as readonly string[]).includes(k);

/**
 * Owns the game's editable content. The database is the source of truth; an
 * indexed copy is kept in memory and swapped atomically after each change.
 * Every write validates the *whole* resulting bundle, so a change that would
 * leave a dangling reference (e.g. deleting a spell a unit still uses) is
 * rejected with a list of problems.
 */
export class ContentService {
  private index: ContentIndex;

  constructor(
    private readonly db: Database,
    private readonly repo: ContentRepo,
    private readonly now: () => number,
  ) {
    this.index = this.load();
  }

  /** The live, indexed content. Don't hold on to it across requests. */
  get current(): ContentIndex {
    return this.index;
  }

  bundle(): ContentBundle {
    return this.index.bundle;
  }

  save<K extends ContentKind>(kind: K, doc: unknown): ContentBundle {
    const parsed = CONTENT_SCHEMAS[kind].parse(doc) as ContentDocs[K];
    const list = this.index.bundle[kind] as ContentDocs[K][];
    const existing = list.findIndex((d) => d.id === parsed.id);
    const next = existing >= 0 ? list.map((d, i) => (i === existing ? parsed : d)) : [...list, parsed];
    return this.commit({ ...this.index.bundle, [kind]: next }, () => this.repo.upsert(kind, String(parsed.id), parsed, this.now()));
  }

  remove(kind: ContentKind, id: string): ContentBundle {
    const list = this.index.bundle[kind] as { id: string | number }[];
    if (!list.some((d) => String(d.id) === id)) throw notFound(`No ${kind} with id "${id}"`);
    const next = list.filter((d) => String(d.id) !== id);
    return this.commit({ ...this.index.bundle, [kind]: next }, () => this.repo.delete(kind, id));
  }

  saveSettings(settings: unknown): ContentBundle {
    const parsed = settingsSchema.parse(settings);
    return this.commit({ ...this.index.bundle, settings: parsed }, () =>
      this.repo.upsert(SETTINGS_KIND, SETTINGS_ID, parsed, this.now()),
    );
  }

  /** Replaces all content (import, or reset to defaults). */
  replaceAll(bundle: unknown): ContentBundle {
    // Fields added since an older export was made are filled in by the schema defaults.
    const parsed = bundleSchema.parse(bundle);
    return this.commit(parsed, () => this.writeAll(parsed));
  }

  reset(): ContentBundle {
    return this.replaceAll(createDefaultContent());
  }

  private commit(candidate: ContentBundle, write: () => void): ContentBundle {
    const errors = validateBundle(candidate);
    if (errors.length) throw badRequest('invalid_content', errors.join('\n'));
    const version = this.index.bundle.version + 1;
    this.db.transaction(() => {
      write();
      this.repo.setVersion(version);
    });
    this.index = indexContent({ ...candidate, version });
    return this.index.bundle;
  }

  private writeAll(bundle: ContentBundle) {
    const t = this.now();
    this.repo.deleteAll();
    this.repo.upsert(SETTINGS_KIND, SETTINGS_ID, bundle.settings, t);
    for (const kind of CONTENT_KINDS) {
      for (const doc of bundle[kind] as { id: string | number }[]) this.repo.upsert(kind, String(doc.id), doc, t);
    }
  }

  private load(): ContentIndex {
    const rows = this.repo.all();
    if (!rows.length) {
      // First run: seed the database with the built-in content.
      const defaults = createDefaultContent();
      this.db.transaction(() => {
        this.writeAll(defaults);
        this.repo.setVersion(defaults.version);
        this.repo.setSchemaVersion(CONTENT_SCHEMA_VERSION);
      });
      return indexContent(defaults);
    }
    const raw: Record<string, unknown> = {
      version: this.repo.version(),
      settings: rows.find((r) => r.kind === SETTINGS_KIND)?.data,
    };
    for (const kind of CONTENT_KINDS) raw[kind] = [];
    for (const row of rows) {
      if (isContentKind(row.kind)) (raw[row.kind] as unknown[]).push(row.data);
    }
    // Parsing fills in defaults for fields added since the content was saved.
    const parsed = bundleSchema.safeParse(raw);
    if (!parsed.success) throw new Error(`Stored content is invalid: ${parsed.error.message}`);

    const fromSchema = this.repo.schemaVersion();
    let bundle = parsed.data;
    if (fromSchema < CONTENT_SCHEMA_VERSION) {
      const upgraded = upgradeContent(bundle, fromSchema);
      bundle = upgraded.changed ? { ...upgraded.bundle, version: bundle.version + 1 } : bundle;
      const errors = validateBundle(bundle);
      if (errors.length) throw new Error(`Content upgrade produced invalid content:\n${errors.join('\n')}`);
      this.db.transaction(() => {
        // Rewrite everything so stored documents include the new fields too.
        this.writeAll(bundle);
        this.repo.setVersion(bundle.version);
        this.repo.setSchemaVersion(CONTENT_SCHEMA_VERSION);
      });
    }
    const errors = validateBundle(bundle);
    if (errors.length) {
      // Content is validated on every write, so this means the DB was edited by hand.
      throw new Error(`Stored content is invalid:\n${errors.join('\n')}`);
    }
    return indexContent(bundle);
  }
}
