import type { DatabaseSync } from 'node:sqlite';

/** Append-only. Each entry runs once, tracked by PRAGMA user_version. */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id            TEXT PRIMARY KEY,
    username      TEXT UNIQUE COLLATE NOCASE,
    password_hash TEXT,
    gems          INTEGER NOT NULL,
    gold          INTEGER NOT NULL,
    stardust      INTEGER NOT NULL DEFAULT 0,
    last_daily    TEXT,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX sessions_user ON sessions(user_id);

  CREATE TABLE characters (
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    char_id     TEXT NOT NULL,
    copies      INTEGER NOT NULL,
    level       INTEGER NOT NULL DEFAULT 1,
    obtained_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, char_id)
  );

  CREATE TABLE teams (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    slots   TEXT NOT NULL
  );

  CREATE TABLE banner_states (
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    banner_id   TEXT NOT NULL,
    pity5       INTEGER NOT NULL,
    pity4       INTEGER NOT NULL,
    guaranteed5 INTEGER NOT NULL,
    guaranteed4 INTEGER NOT NULL,
    PRIMARY KEY (user_id, banner_id)
  );

  CREATE TABLE pulls (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    banner_id  TEXT NOT NULL,
    char_id    TEXT NOT NULL,
    rarity     INTEGER NOT NULL,
    pity       INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX pulls_user ON pulls(user_id, id);

  CREATE TABLE stage_clears (
    user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stage_id         TEXT NOT NULL,
    clears           INTEGER NOT NULL,
    first_cleared_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, stage_id)
  );

  CREATE TABLE battles (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stage_id    TEXT NOT NULL,
    setup       TEXT NOT NULL,
    status      TEXT NOT NULL CHECK (status IN ('active', 'won', 'lost')),
    created_at  INTEGER NOT NULL,
    finished_at INTEGER
  );
  CREATE INDEX battles_user ON battles(user_id, created_at);
  `,
  // v2: editable content, admin roles, missions.
  `
  CREATE TABLE content (
    kind       TEXT NOT NULL,
    id         TEXT NOT NULL,
    data       TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (kind, id)
  );

  CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'player';

  CREATE TABLE mission_progress (
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mission_id TEXT NOT NULL,
    period     TEXT NOT NULL,
    progress   INTEGER NOT NULL DEFAULT 0,
    claimed    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, mission_id, period)
  );

  -- Battles started before v2 store a setup format the engine no longer reads.
  UPDATE battles SET status = 'lost', finished_at = 0 WHERE status = 'active';
  `,
  // v3: gear, arena.
  `
  CREATE TABLE gear (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_id TEXT NOT NULL,
    slot        TEXT NOT NULL,
    rarity      INTEGER NOT NULL,
    level       INTEGER NOT NULL DEFAULT 0,
    main_base   REAL NOT NULL,
    main        TEXT NOT NULL,
    subs        TEXT NOT NULL,
    equipped_to TEXT,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX gear_user ON gear(user_id, created_at);
  -- One item per slot per character.
  CREATE UNIQUE INDEX gear_equipped ON gear(user_id, equipped_to, slot) WHERE equipped_to IS NOT NULL;

  CREATE TABLE arena_players (
    user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    rating       INTEGER NOT NULL,
    wins         INTEGER NOT NULL DEFAULT 0,
    losses       INTEGER NOT NULL DEFAULT 0,
    defense      TEXT NOT NULL DEFAULT '[]',
    ticket_day   TEXT,
    tickets_used INTEGER NOT NULL DEFAULT 0,
    week         TEXT,
    offers       TEXT NOT NULL DEFAULT '[]'
  );
  CREATE INDEX arena_rating ON arena_players(rating);

  CREATE TABLE arena_history (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    attacker_id    TEXT NOT NULL,
    defender_id    TEXT,
    attacker_name  TEXT NOT NULL,
    defender_name  TEXT NOT NULL,
    attacker_won   INTEGER NOT NULL,
    attacker_delta INTEGER NOT NULL,
    defender_delta INTEGER NOT NULL,
    created_at     INTEGER NOT NULL
  );
  CREATE INDEX arena_history_attacker ON arena_history(attacker_id, id);
  CREATE INDEX arena_history_defender ON arena_history(defender_id, id);

  ALTER TABLE battles ADD COLUMN mode TEXT NOT NULL DEFAULT 'campaign';
  ALTER TABLE battles ADD COLUMN meta TEXT;
  `,
  // v4: hero progression and materials.
  `
  ALTER TABLE characters ADD COLUMN ascension INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE characters ADD COLUMN skill_level INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE characters ADD COLUMN ult_level INTEGER NOT NULL DEFAULT 1;
  -- Heroes already above the new base cap keep their level: give them the ranks it needs
  -- (default caps 20/30/40/50/60).
  UPDATE characters SET ascension = CASE
    WHEN level > 50 THEN 4 WHEN level > 40 THEN 3 WHEN level > 30 THEN 2 WHEN level > 20 THEN 1 ELSE 0 END;

  CREATE TABLE materials (
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    material_id TEXT NOT NULL,
    count       INTEGER NOT NULL,
    PRIMARY KEY (user_id, material_id)
  );
  `,
  // v5: stage stars and chapter star chests. Existing clears count as one star.
  `
  ALTER TABLE stage_clears ADD COLUMN stars INTEGER NOT NULL DEFAULT 1;

  CREATE TABLE chapter_chests (
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    chapter_id INTEGER NOT NULL,
    stars      INTEGER NOT NULL,
    claimed_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, chapter_id, stars)
  );
  `,
  // v6: daily dungeon runs. Hard-mode and dungeon-tier clears live in stage_clears ("hard:1-1", "dungeon:id:0").
  `
  CREATE TABLE dungeon_runs (
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dungeon_id TEXT NOT NULL,
    day        TEXT NOT NULL,
    runs       INTEGER NOT NULL,
    PRIMARY KEY (user_id, dungeon_id, day)
  );
  `,
  // v7: stamina (NULL = full) and one-time account flags (tutorials).
  `
  ALTER TABLE users ADD COLUMN stamina INTEGER;
  ALTER TABLE users ADD COLUMN stamina_at INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN flags TEXT NOT NULL DEFAULT '[]';
  `,
  // v8: account preferences (auto-salvage).
  `
  ALTER TABLE users ADD COLUMN prefs TEXT NOT NULL DEFAULT '{}';
  `,
  // v9: account level, titles, login calendar, friends, guilds and events.
  `
  ALTER TABLE users ADD COLUMN xp INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN title TEXT;
  ALTER TABLE users ADD COLUMN support_char TEXT;
  ALTER TABLE users ADD COLUMN login_days INTEGER NOT NULL DEFAULT 0;

  CREATE TABLE friends (
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status     TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, friend_id)
  );
  CREATE INDEX friends_by_friend ON friends(friend_id);
  CREATE TABLE support_uses (
    user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id TEXT NOT NULL,
    day       TEXT NOT NULL,
    PRIMARY KEY (user_id, friend_id, day)
  );

  CREATE TABLE guilds (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
    description TEXT NOT NULL,
    open        INTEGER NOT NULL,
    created_at  INTEGER NOT NULL
  );
  CREATE TABLE guild_members (
    user_id   TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    guild_id  TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    role      TEXT NOT NULL,
    joined_at INTEGER NOT NULL
  );
  CREATE INDEX guild_members_by_guild ON guild_members(guild_id);
  CREATE TABLE guild_damage (
    guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    week     TEXT NOT NULL,
    user_id  TEXT NOT NULL,
    damage   INTEGER NOT NULL,
    attacks  INTEGER NOT NULL,
    PRIMARY KEY (guild_id, week, user_id)
  );
  CREATE TABLE guild_attempts (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day     TEXT NOT NULL,
    count   INTEGER NOT NULL,
    PRIMARY KEY (user_id, day)
  );
  CREATE TABLE guild_chests (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week    TEXT NOT NULL,
    percent INTEGER NOT NULL,
    PRIMARY KEY (user_id, week, percent)
  );

  CREATE TABLE event_wallets (
    user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,
    currency INTEGER NOT NULL,
    PRIMARY KEY (user_id, event_id)
  );
  CREATE TABLE event_purchases (
    user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,
    item_id  TEXT NOT NULL,
    count    INTEGER NOT NULL,
    PRIMARY KEY (user_id, event_id, item_id)
  );
  `,
  // v10: named team presets. The active preset's members live in `teams` as before.
  `
  CREATE TABLE team_presets (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slot    INTEGER NOT NULL,
    name    TEXT NOT NULL,
    members TEXT NOT NULL,
    PRIMARY KEY (user_id, slot)
  );
  ALTER TABLE teams ADD COLUMN active_preset INTEGER NOT NULL DEFAULT 0;
  `,
  // v11: forge points on gear (from an early version of reforging; no longer used).
  `
  ALTER TABLE gear ADD COLUMN forge INTEGER NOT NULL DEFAULT 0;
  `,
  // v12: the boots slot. Gear with SPD as its main stat is boots now (it used to be charms).
  `
  UPDATE gear SET slot = 'boots' WHERE json_extract(main, '$.stat') = 'spd';
  `,
  // v13: gear sets. Gear from before sets has none.
  `
  ALTER TABLE gear ADD COLUMN set_id TEXT;
  `,
];

export function migrate(db: DatabaseSync) {
  const { user_version: current } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]!);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}
