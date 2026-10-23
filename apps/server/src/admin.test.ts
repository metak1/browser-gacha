import {
  autoBattle,
  createDefaultContent,
  type ClaimMissionResponse,
  type ContentBundle,
  type MissionDTO,
  type ProfileDTO,
  type SimulateResponse,
  type StartBattleResponse,
} from '@gacha/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seededRandom } from '@gacha/shared';
import { buildTestApp } from './testing';

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildTestApp(
    { dbPath: ':memory:', cookieSecure: false, clientDist: null, logger: false, rateLimit: false },
    { overrides: { random: seededRandom(3) } },
  );
});

afterEach(async () => {
  await app.close();
});

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

function device() {
  let sid: string | undefined;
  return async function call<T>(method: Method, url: string, payload?: object) {
    const res = await app.inject({ method, url: `/api${url}`, payload, cookies: sid ? { sid } : {} });
    const cookie = res.cookies.find((c) => c.name === 'sid');
    if (cookie) sid = cookie.value || undefined;
    return { status: res.statusCode, body: (res.body ? res.json() : null) as T };
  };
}

async function guest() {
  const call = device();
  const { body } = await call<ProfileDTO>('POST', '/auth/guest');
  return { call, profile: body };
}

async function adminUser() {
  const g = await guest();
  app.services.admin.setRole(g.profile.user.id, 'admin');
  return g;
}

describe('content API', () => {
  it('serves the seeded content with an ETag', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/content' });
    const bundle = res.json() as ContentBundle;
    expect(bundle.characters.length).toBe(createDefaultContent().characters.length);
    const again = await app.inject({ method: 'GET', url: '/api/content', headers: { 'if-none-match': res.headers.etag as string } });
    expect(again.statusCode).toBe(304);
  });

  it('is admin-only', async () => {
    const { call } = await guest();
    const res = await call('PUT', '/admin/content/settings', createDefaultContent().settings);
    expect(res.status).toBe(403);
    expect((await device()('GET', '/admin/players')).status).toBe(401);
  });

  it('creates a spell and a unit, then puts the unit on a banner', async () => {
    const { call } = await adminUser();
    const spell = {
      id: 'meteor',
      name: 'Meteor',
      targeting: 'none',
      cooldown: 4,
      effects: [{ kind: 'damage', to: 'allEnemies', mult: 2 }],
    };
    let res = await call<ContentBundle>('PUT', '/admin/content/skills/meteor', spell);
    expect(res.status).toBe(200);
    const unit = {
      id: 'astra', name: 'Astra', rarity: 5, element: 'volt', role: 'striker', emoji: '🌟', limited: true,
      base: { hp: 1100, atk: 150, def: 60, spd: 110 }, basic: 'ignis-basic', skill: 'meteor',
    };
    res = await call<ContentBundle>('PUT', '/admin/content/characters/astra', unit);
    expect(res.status).toBe(200);
    const banner = { ...createDefaultContent().banners[0]!, featured5: 'astra' };
    res = await call<ContentBundle>('PUT', '/admin/content/banners/thunder', banner);
    expect(res.body.banners.find((b) => b.id === 'thunder')!.featured5).toBe('astra');
    expect(res.body.version).toBeGreaterThan(1);

    // The public content reflects the change immediately.
    const pub = (await app.inject({ method: 'GET', url: '/api/content' })).json() as ContentBundle;
    expect(pub.characters.some((c) => c.id === 'astra')).toBe(true);
  });

  it('rejects broken references and in-use deletes', async () => {
    const { call } = await adminUser();
    const bad = { ...createDefaultContent().characters[0]!, skill: 'does-not-exist' };
    const res = await call<{ error: string; message: string }>('PUT', '/admin/content/characters/ignis', bad);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/unknown spell "does-not-exist"/);

    const del = await call<{ message: string }>('DELETE', '/admin/content/skills/ignis-basic');
    expect(del.status).toBe(400);
    expect(del.body.message).toMatch(/ignis/);

    const shape = await call('PUT', '/admin/content/skills/x', { id: 'x', name: '', targeting: 'none', cooldown: 1, effects: [] });
    expect(shape.status).toBe(400);
    const mismatch = await call('PUT', '/admin/content/skills/y', { ...createDefaultContent().skills[0] });
    expect(mismatch.status).toBe(400);
  });

  it('stage edits change new battles but not ones in progress', async () => {
    const { call } = await adminUser();
    const before = await call<StartBattleResponse>('POST', '/battles', { stageId: '1-1' });

    const stage = { ...createDefaultContent().stages[0]!, enemies: [{ id: 'lich', level: 50 }] };
    expect((await call('PUT', '/admin/content/stages/1-1', stage)).status).toBe(200);

    const after = await call<StartBattleResponse>('POST', '/battles', { stageId: '1-1' });
    expect(after.body.setup.enemies.map((e) => e.id)).toEqual(['lich']);

    // The old battle still replays against its original snapshot.
    const { actions, state } = autoBattle(before.body.setup);
    const done = await call<{ outcome: string }>('POST', `/battles/${before.body.battleId}/complete`, { actions });
    expect(done.body.outcome).toBe(state.outcome);
  });

  it('updates settings used by new players', async () => {
    const { call } = await adminUser();
    const settings = { ...createDefaultContent().settings, startingGems: 9999 };
    expect((await call('PUT', '/admin/content/settings', settings)).status).toBe(200);
    expect((await guest()).profile.wallet.gems).toBe(9999);
  });

  it('imports, and resets to defaults', async () => {
    const { call } = await adminUser();
    const bundle = createDefaultContent();
    bundle.chapters[0]!.name = 'Imported Meadow';
    const imported = await call<ContentBundle>('POST', '/admin/content/import', bundle);
    expect(imported.body.chapters[0]!.name).toBe('Imported Meadow');
    const reset = await call<ContentBundle>('POST', '/admin/content/reset');
    expect(reset.body.chapters[0]!.name).toBe('Whispering Meadow');
  });

  it('content survives a restart', async () => {
    // A file DB so a second app instance sees the same data.
    const dir = await import('node:fs/promises').then((fs) => fs.mkdtemp(`${process.env.TEMP ?? '/tmp'}/gacha-`));
    const config = { dbPath: `${dir}/game.db`, cookieSecure: false, clientDist: null, logger: false, rateLimit: false };
    const first = await buildTestApp(config);
    first.services.content.save('chapters', { id: 9, name: 'Persisted', theme: 'cosmos' });
    await first.close();
    const second = await buildTestApp(config);
    expect(second.services.content.current.chaptersById[9]?.name).toBe('Persisted');
    await second.close();
    await import('node:fs/promises').then((fs) => fs.rm(dir, { recursive: true, force: true }));
  });
});

describe('admin tools', () => {
  it('finds players, grants rewards and changes roles', async () => {
    const { call } = await adminUser();
    const target = await guest();
    const list = await call<{ id: string }[]>('GET', `/admin/players?q=${target.profile.user.id.slice(0, 8)}`);
    expect(list.body.map((p) => p.id)).toContain(target.profile.user.id);

    const granted = await call<{ wallet: { gems: number }; characters: number }>(
      'POST', `/admin/players/${target.profile.user.id}/grant`, { gems: 1000, allCharacters: true, level: 10 },
    );
    expect(granted.body.wallet.gems).toBe(target.profile.wallet.gems + 1000);
    expect(granted.body.characters).toBe(createDefaultContent().characters.length);

    const promoted = await call<{ role: string }>('PUT', `/admin/players/${target.profile.user.id}/role`, { role: 'admin' });
    expect(promoted.body.role).toBe('admin');
  });

  it('simulates a stage with live content', async () => {
    const { call } = await adminUser();
    const res = await call<SimulateResponse>('POST', '/admin/simulate', {
      stageId: '1-1', team: ['pebble', 'torch'], level: 5, runs: 20,
    });
    expect(res.body.runs).toBe(20);
    expect(res.body.winRate).toBeGreaterThan(0.5);
  });
});

describe('missions', () => {
  it('tracks progress and pays rewards once', async () => {
    const { call, profile } = await guest();
    let missions = (await call<MissionDTO[]>('GET', '/missions')).body;
    const first = missions.find((m) => m.id === 'first-steps')!;
    expect(first.complete).toBe(false);
    expect((await call('POST', '/missions/first-steps/claim')).status).toBe(400);

    const start = await call<StartBattleResponse>('POST', '/battles', { stageId: '1-1' });
    const { actions } = autoBattle(start.body.setup);
    const done = await call<{ profile: ProfileDTO }>('POST', `/battles/${start.body.battleId}/complete`, { actions });
    expect(done.body.profile.missionsReady).toBeGreaterThan(0);

    missions = (await call<MissionDTO[]>('GET', '/missions')).body;
    expect(missions.find((m) => m.id === 'first-steps')!.complete).toBe(true);
    expect(missions.find((m) => m.id === 'daily-battles')!.progress).toBe(1);

    const claim = await call<ClaimMissionResponse>('POST', '/missions/first-steps/claim');
    expect(claim.status).toBe(200);
    expect(claim.body.missions.find((m) => m.id === 'first-steps')!.claimed).toBe(true);
    const firstClearGems = createDefaultContent().stages[0]!.firstClearGems;
    expect(claim.body.profile.wallet.gems).toBe(profile.wallet.gems + firstClearGems + 300);
    expect((await call('POST', '/missions/first-steps/claim')).status).toBe(409);
  });

  it('counts summons and daily claims', async () => {
    const { call } = await guest();
    await call('POST', '/gacha/summon', { bannerId: 'standard', count: 10 });
    await call('POST', '/daily');
    const missions = (await call<MissionDTO[]>('GET', '/missions')).body;
    expect(missions.find((m) => m.id === 'daily-summon')!.complete).toBe(true);
    expect(missions.find((m) => m.id === 'daily-checkin')!.complete).toBe(true);
  });
});
