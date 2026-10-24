import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  autoBattle,
  createDefaultContent,
  seededRandom,
  type ClaimMissionResponse,
  type CompleteBattleResponse,
  type ProfileDTO,
  type StartBattleResponse,
} from '@gacha/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, newGuest, TEST_CONFIG } from './testing';

const prog = createDefaultContent().settings.progression;
let app: FastifyInstance;

beforeEach(async () => {
  app = await buildTestApp(TEST_CONFIG, { overrides: { random: seededRandom(21) } });
});
afterEach(async () => app.close());

const guest = () => newGuest(app);

const hero = (p: ProfileDTO, id: string) => p.roster.find((c) => c.id === id)!;

describe('ascension', () => {
  it('caps levels until the hero is ascended with gold and essence', async () => {
    const { call, profile } = await guest();
    app.services.admin.grant(profile.user.id, { gold: 1_000_000, level: prog.baseCap });
    // Granting a level never needs ascension at the base cap.
    let me = (await call<ProfileDTO>('GET', '/me')).body;
    expect(hero(me, 'torch').ascension).toBe(0);

    const capped = await call<{ error: string; message: string }>('POST', '/roster/torch/level-up');
    expect(capped.status).toBe(409);
    expect(capped.body.message).toMatch(/Ascend/);

    const broke = await call<{ error: string; message: string }>('POST', '/roster/torch/ascend');
    expect(broke.body.error).toBe('insufficient_materials');
    expect(broke.body.message).toMatch(/Ember Essence/);

    app.services.admin.grant(profile.user.id, { materialsEach: 50 });
    me = (await call<ProfileDTO>('POST', '/roster/torch/ascend')).body;
    expect(hero(me, 'torch').ascension).toBe(1);
    expect(me.materials['flame-essence']).toBe(50 - prog.ascension[0]!.essence);
    expect((await call('POST', '/roster/torch/level-up')).status).toBe(200);

    // Ascension makes the hero stronger in battle.
    const plain = (await call<StartBattleResponse>('POST', '/battles', { stageId: '1-1' })).body.setup;
    const torch = plain.allies.find((a) => a.id === 'torch')!;
    const pebble = plain.allies.find((a) => a.id === 'pebble')!;
    expect(torch.level).toBe(prog.baseCap + 1);
    expect(pebble.level).toBe(prog.baseCap);
  });

  it('stops at the last rank', async () => {
    const { call, profile } = await guest();
    app.services.admin.grant(profile.user.id, { gold: 10_000_000, materialsEach: 1000 });
    for (let i = 0; i < prog.ascension.length; i++) expect((await call('POST', '/roster/torch/ascend')).status).toBe(200);
    expect((await call('POST', '/roster/torch/ascend')).status).toBe(409);
  });
});

describe('skill levels', () => {
  it('cost gold and tomes, scale the skill, and stop at max', async () => {
    const { call, profile } = await guest();
    app.services.admin.grant(profile.user.id, { gold: 10_000_000, materialsEach: 100 });
    const before = (await call<StartBattleResponse>('POST', '/battles', { stageId: '1-1' })).body.setup;
    const mult = (s: StartBattleResponse['setup']) =>
      (s.allies.find((a) => a.id === 'torch')!.skill!.effects.find((e) => e.kind === 'damage') as { mult: number }).mult;

    const me = (await call<ProfileDTO>('POST', '/roster/torch/skill-up', { slot: 'skill' })).body;
    expect(hero(me, 'torch').skillLevel).toBe(2);
    expect(me.materials['skill-tome']).toBe(100 - prog.skillLevels[0]!.tomes);
    const after = (await call<StartBattleResponse>('POST', '/battles', { stageId: '1-1' })).body.setup;
    expect(mult(after)).toBeCloseTo(mult(before) * (1 + prog.skillLevelBonus), 2);

    for (let l = 2; l < prog.skillLevels.length + 1; l++) await call('POST', '/roster/torch/skill-up', { slot: 'skill' });
    expect((await call('POST', '/roster/torch/skill-up', { slot: 'skill' })).status).toBe(409);
    expect((await call<ProfileDTO>('POST', '/roster/torch/skill-up', { slot: 'ultimate' })).body.roster.find((c) => c.id === 'torch')!.ultLevel).toBe(2);
  });
});

describe('materials', () => {
  it('drop from stages, can be bought, and come from mission rewards', async () => {
    const { call, profile } = await guest();
    let gained: CompleteBattleResponse | null = null;
    for (let i = 0; i < 5 && !gained?.materials.length; i++) {
      const start = await call<StartBattleResponse>('POST', '/battles', { stageId: '1-1' });
      const { actions } = autoBattle(start.body.setup);
      gained = (await call<CompleteBattleResponse>('POST', `/battles/${start.body.battleId}/complete`, { actions })).body;
    }
    expect(gained!.materials[0]!.id).toBe('tide-essence');
    expect(gained!.profile.materials['tide-essence']).toBe(gained!.materials[0]!.count);

    app.services.admin.grant(profile.user.id, { gold: 100_000, stardust: 1000 });
    const bought = (await call<ProfileDTO>('POST', '/shop/buy', { material: 'star-crystal', quantity: 2 })).body;
    expect(bought.materials['star-crystal']).toBe(2);
    expect((await call('POST', '/shop/buy', { material: 'not-for-sale', quantity: 1 })).status).toBe(404);

    // "Rising Star" pays a star crystal for the first ascension.
    app.services.admin.grant(profile.user.id, { materialsEach: 10 });
    await call('POST', '/roster/torch/ascend');
    const claim = await call<ClaimMissionResponse>('POST', '/missions/first-ascension/claim');
    expect(claim.status).toBe(200);
    expect(claim.body.profile.materials['star-crystal']).toBe(2 + 10 + 1);
  });
});

describe('progression upgrade', () => {
  it('keeps high-level heroes above the new base cap and adds materials and lore', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gacha-prog-'));
    const dbPath = join(dir, 'game.db');
    const first = await buildTestApp({ ...TEST_CONFIG, dbPath });
    const userId = first.services.auth.createGuest().userId;
    await first.close();

    // Rewind to a v3 database: no progression columns/tables, level-35 heroes, old content.
    const raw = new DatabaseSync(dbPath);
    raw.exec(`
      CREATE TABLE characters_old AS SELECT user_id, char_id, copies, level, obtained_at FROM characters;
      DROP TABLE characters;
      CREATE TABLE characters (user_id TEXT NOT NULL, char_id TEXT NOT NULL, copies INTEGER NOT NULL, level INTEGER NOT NULL DEFAULT 1, obtained_at INTEGER NOT NULL, PRIMARY KEY (user_id, char_id));
      INSERT INTO characters SELECT * FROM characters_old; DROP TABLE characters_old;
      UPDATE characters SET level = 35;
      DROP TABLE materials;
      DROP TABLE chapter_chests;
      ALTER TABLE users DROP COLUMN stamina;
      ALTER TABLE users DROP COLUMN stamina_at;
      ALTER TABLE users DROP COLUMN flags;
      ALTER TABLE users DROP COLUMN prefs;
      ALTER TABLE users DROP COLUMN xp;
      ALTER TABLE users DROP COLUMN title;
      ALTER TABLE users DROP COLUMN support_char;
      ALTER TABLE users DROP COLUMN login_days;
      DROP TABLE friends; DROP TABLE support_uses; DROP TABLE guild_chests; DROP TABLE guild_attempts; DROP TABLE guild_damage; DROP TABLE guild_members; DROP TABLE guilds; DROP TABLE event_purchases; DROP TABLE event_wallets;
      ALTER TABLE stage_clears DROP COLUMN stars;
      DROP TABLE team_presets; ALTER TABLE teams DROP COLUMN active_preset; ALTER TABLE gear DROP COLUMN set_id; ALTER TABLE gear DROP COLUMN locked;
      DELETE FROM content WHERE kind = 'materials';
      DELETE FROM content WHERE kind = 'dungeons';
      DELETE FROM content WHERE kind = 'characters' AND id = 'elara';
      DELETE FROM content WHERE kind = 'banners' AND id = 'templar';
      UPDATE content SET data = json_set(data, '$.sprite', json('null')) WHERE kind = 'enemies' AND id = 'blob';
      DELETE FROM content WHERE kind = 'chapters' AND CAST(id AS INTEGER) > 3;
      DELETE FROM content WHERE kind = 'stages' AND (id LIKE '4-%' OR id LIKE '5-%' OR id LIKE '6-%');
      DELETE FROM content WHERE kind = 'enemies' AND id IN ('harpy', 'thunderbird', 'warlord', 'demon-lord');
      DELETE FROM content WHERE kind = 'missions' AND id IN ('daily-dungeon', 'storm-breaker');
      UPDATE meta SET value = '3' WHERE key = 'content_schema'; DELETE FROM meta WHERE key = 'content_upgrades';
      PRAGMA user_version = 3;
    `);
    for (const row of raw.prepare("SELECT id, data FROM content WHERE kind IN ('characters', 'stages', 'chapters')").all() as { id: string; data: string }[]) {
      const doc = JSON.parse(row.data) as Record<string, unknown>;
      delete doc.lore;
      delete doc.title;
      delete doc.materialDrops;
      delete doc.passive;
      delete doc.objectives;
      delete doc.starRewards;
      raw.prepare('UPDATE content SET data = ? WHERE id = ? AND data = ?').run(JSON.stringify(doc), row.id, row.data);
    }
    const settings = JSON.parse((raw.prepare("SELECT data FROM content WHERE kind = 'settings'").get() as { data: string }).data);
    delete settings.progression;
    settings.maxLevel = 40;
    raw.prepare("UPDATE content SET data = ? WHERE kind = 'settings'").run(JSON.stringify(settings));
    raw.close();

    const second = await buildTestApp({ ...TEST_CONFIG, dbPath });
    const profile = second.services.player.profile(userId);
    expect(profile.roster.every((c) => c.level === 35 && c.ascension === 2)).toBe(true);
    const c = second.services.content.current;
    expect(c.bundle.materials.length).toBeGreaterThan(0);
    expect(c.charactersById.ignis!.lore.length).toBeGreaterThan(0);
    expect(c.stagesById['1-1']!.materialDrops.length).toBeGreaterThan(0);
    expect(c.settings.maxLevel).toBe(60);
    // v5: passives, objectives and chests come back.
    expect(c.charactersById.ignis!.passive?.name).toBe('Inferno Heart');
    expect(c.stagesById['1-4']!.objectives).toHaveLength(3);
    expect(c.bundle.chapters[0]!.starRewards).toHaveLength(3);
    expect(profile.stageStars).toEqual({});
    // v6: new chapters, enemies, dungeons and missions come back.
    expect(c.chapters.map((x) => x.id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(c.stagesById['6-4']!.waves).toHaveLength(1);
    expect(c.enemiesById['thunderbird']).toBeDefined();
    // Six elemental dungeons (v6) and three gear dungeons (v20, v22).
    expect(c.bundle.dungeons).toHaveLength(9);
    expect(c.missionsById['daily-dungeon']).toBeDefined();
    expect(c.missionsById['storm-breaker']).toBeDefined();
    // v7: sprite heroes, their banner, and sprites for enemies.
    expect(c.charactersById['elara']?.sprite).toBe('wizard');
    expect(c.bannersById['templar']?.featured5).toBe('varek');
    expect(c.enemiesById['blob']?.sprite).toBe('slime');
    await second.close();
    await rm(dir, { recursive: true, force: true });
  });
});
