import { autoBattle, hardKey, seededRandom, type CompleteBattleResponse, type ProfileDTO, type StartBattleResponse } from '@gacha/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import type { ServiceContext } from './services/context';

const baseConfig = { cookieSecure: false, clientDist: null, logger: false, rateLimit: false };
let app: FastifyInstance;
// A Tuesday (UTC): the Tidal Grotto is open, the Ember Forge is not.
let clock = Date.UTC(2026, 9, 20, 12);

beforeEach(async () => {
  clock = Date.UTC(2026, 9, 20, 12);
  app = await buildApp({ ...baseConfig, dbPath: ':memory:' }, { overrides: { random: seededRandom(3), now: () => clock } });
});
afterEach(async () => app.close());

async function strongGuest() {
  let sid: string | undefined;
  const call = async <T>(method: 'GET' | 'POST', url: string, payload?: object) => {
    const res = await app.inject({ method, url: `/api${url}`, payload, cookies: sid ? { sid } : {} });
    const cookie = res.cookies.find((c) => c.name === 'sid');
    if (cookie) sid = cookie.value || undefined;
    return { status: res.statusCode, body: res.json() as T };
  };
  const { body: profile } = await call<ProfileDTO>('POST', '/auth/guest');
  const ctx = (app.services.player as unknown as { ctx: ServiceContext }).ctx;
  for (const id of profile.team) {
    ctx.roster.setLevel(profile.user.id, id, 60);
    ctx.db.run('UPDATE characters SET ascension = 4 WHERE user_id = ? AND char_id = ?', profile.user.id, id);
  }
  return { call, profile, ctx };
}

async function play(call: Awaited<ReturnType<typeof strongGuest>>['call'], start: { status: number; body: StartBattleResponse }) {
  expect(start.status).toBe(200);
  const { actions, state } = autoBattle(start.body.setup);
  const done = await call<CompleteBattleResponse>('POST', `/battles/${start.body.battleId}/complete`, { actions });
  expect(done.status).toBe(200);
  return { state, result: done.body };
}

describe('hard mode', () => {
  it('opens after the chapter is cleared, pays more and tracks its own clears', async () => {
    const { call, profile, ctx } = await strongGuest();
    expect((await call('POST', '/battles', { stageId: '1-1', hard: true })).status).toBe(400);
    for (const id of ['1-1', '1-2', '1-3', '1-4']) ctx.progress.recordClear(profile.user.id, id, clock);
    expect((await call('POST', '/battles', { stageId: '1-2', hard: true })).status).toBe(400);

    const start = await call<StartBattleResponse>('POST', '/battles', { stageId: '1-1', hard: true });
    expect(start.body.setup.enemies[0]!.level).toBe(1 + 10);
    const { state, result } = await play(call, start);
    expect(state.outcome).toBe('victory');
    expect(result.hard).toBe(true);
    expect(result.firstClear).toBe(true);
    expect(result.rewards.gems).toBe(100);
    expect(result.rewards.gold).toBe(app.services.content.current.stagesById['1-1']!.gold * 2);
    expect(result.objectives).toEqual([]);
    expect(result.profile.clearedStages).toContain(hardKey('1-1'));
    // Normal stars are untouched by the hard clear.
    expect(result.profile.stageStars['1-1']).toBe(1);
    expect((await call('POST', '/battles', { stageId: '1-2', hard: true })).status).toBe(200);
  });
});

describe('dungeons', () => {
  it('respects open days, tier order and the daily run limit', async () => {
    const { call, profile, ctx } = await strongGuest();
    expect((await call('POST', '/dungeons/tidal-grotto/battles', { tier: 0 })).status).toBe(400); // locked until 2-1
    ctx.progress.recordClear(profile.user.id, '2-1', clock);
    expect((await call('POST', '/dungeons/ember-forge/battles', { tier: 0 })).status).toBe(400);
    expect((await call('POST', '/dungeons/tidal-grotto/battles', { tier: 1 })).status).toBe(400);
    expect((await call('POST', '/dungeons/nope/battles', { tier: 0 })).status).toBe(404);

    let last: CompleteBattleResponse | undefined;
    for (let i = 0; i < 3; i++) {
      const { state, result } = await play(call, await call<StartBattleResponse>('POST', '/dungeons/tidal-grotto/battles', { tier: 0 }));
      expect(state.outcome).toBe('victory');
      expect(result.dungeon).toEqual({ id: 'tidal-grotto', tier: 0, runsLeft: 2 - i });
      expect(result.materials.some((m) => m.id === 'tide-essence')).toBe(true);
      last = result;
    }
    expect(last!.profile.dungeonRuns['tidal-grotto']).toBe(3);
    expect((await call('POST', '/dungeons/tidal-grotto/battles', { tier: 0 })).status).toBe(400);

    // Tier 2 unlocked by the clear; runs reset the next day.
    clock += 24 * 3600 * 1000; // Wednesday: Sky Nest instead
    expect((await call('POST', '/dungeons/tidal-grotto/battles', { tier: 0 })).status).toBe(400);
    expect((await call('POST', '/dungeons/sky-nest/battles', { tier: 0 })).status).toBe(200);
    const missions = await call<{ id: string; progress: number }[]>('GET', '/missions');
    expect(missions.body.find((m) => m.id === 'dungeon-regular')?.progress).toBe(3);
  });
});
