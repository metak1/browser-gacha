import { hardKey, seededRandom, type ProfileDTO, type StartBattleResponse } from '@gacha/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { autoPlay, buildTestApp, newGuest, TEST_CONFIG } from './testing';

let app: FastifyInstance;
// A Tuesday (UTC): the Tidal Grotto is open, the Ember Forge is not.
let clock = Date.UTC(2026, 9, 20, 12);

beforeEach(async () => {
  clock = Date.UTC(2026, 9, 20, 12);
  app = await buildTestApp(TEST_CONFIG, { overrides: { random: seededRandom(3), now: () => clock } });
});
afterEach(async () => app.close());

const strongGuest = () => newGuest(app, { strong: true });
const play = autoPlay;

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
  it('respects open days and tier order, and costs stamina per run with no daily limit', async () => {
    const { call, profile, ctx } = await strongGuest();
    expect((await call('POST', '/dungeons/tidal-grotto/battles', { tier: 0 })).status).toBe(400); // locked until 2-1
    ctx.progress.recordClear(profile.user.id, '2-1', clock);
    expect((await call('POST', '/dungeons/ember-forge/battles', { tier: 0 })).status).toBe(400);
    expect((await call('POST', '/dungeons/tidal-grotto/battles', { tier: 1 })).status).toBe(400);
    expect((await call('POST', '/dungeons/nope/battles', { tier: 0 })).status).toBe(404);

    // At max level, so no level-up refunds stamina mid-test.
    ctx.users.setXp(profile.user.id, 10_000_000);
    const cost = app.services.content.current.dungeonsById['tidal-grotto']!.tiers[0]!.stamina;
    expect(cost).toBe(10);
    // More wins than the old limit of 3 a day.
    for (let i = 0; i < 4; i++) {
      const before = (await call<ProfileDTO>('GET', '/me')).body.stamina.current;
      const { state, result } = await play(call, await call<StartBattleResponse>('POST', '/dungeons/tidal-grotto/battles', { tier: 0 }));
      expect(state.outcome).toBe('victory');
      expect(result.dungeon).toEqual({ id: 'tidal-grotto', tier: 0 });
      expect(result.materials.some((m) => m.id === 'tide-essence')).toBe(true);
      expect(result.profile.stamina.current).toBe(before - cost);
    }
    ctx.users.setStamina(profile.user.id, cost - 1, clock);
    const broke = await call<{ error: string }>('POST', '/dungeons/tidal-grotto/battles', { tier: 0 });
    expect(broke.status).toBe(400);
    expect(broke.body.error).toBe('no_stamina');
    ctx.users.setStamina(profile.user.id, 120, clock);

    // Tier 2 unlocked by the clear; the next day another dungeon is open.
    clock += 24 * 3600 * 1000; // Wednesday: Sky Nest instead
    expect((await call('POST', '/dungeons/tidal-grotto/battles', { tier: 0 })).status).toBe(400);
    expect((await call('POST', '/dungeons/sky-nest/battles', { tier: 0 })).status).toBe(200);
    const missions = await call<{ id: string; progress: number }[]>('GET', '/missions');
    expect(missions.body.find((m) => m.id === 'dungeon-regular')?.progress).toBe(4);
  });
});
