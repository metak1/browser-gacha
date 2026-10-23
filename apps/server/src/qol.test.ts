import { autoBattle, seededRandom, type CompleteBattleResponse, type ProfileDTO, type StartBattleResponse, type SweepResponse } from '@gacha/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp } from './testing';
import type { ServiceContext } from './services/context';

const baseConfig = { cookieSecure: false, clientDist: null, logger: false, rateLimit: false };
let app: FastifyInstance;
let clock = Date.UTC(2026, 9, 20, 12); // a Tuesday

beforeEach(async () => {
  clock = Date.UTC(2026, 9, 20, 12);
  app = await buildTestApp({ ...baseConfig, dbPath: ':memory:' }, { overrides: { random: seededRandom(9), now: () => clock } });
});
afterEach(async () => app.close());

async function guest() {
  let sid: string | undefined;
  const call = async <T>(method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) => {
    const res = await app.inject({ method, url: `/api${url}`, payload, cookies: sid ? { sid } : {} });
    const cookie = res.cookies.find((c) => c.name === 'sid');
    if (cookie) sid = cookie.value || undefined;
    return { status: res.statusCode, body: res.json() as T };
  };
  const { body: profile } = await call<ProfileDTO>('POST', '/auth/guest');
  const ctx = (app.services.player as unknown as { ctx: ServiceContext }).ctx;
  return { call, profile, ctx };
}

describe('stamina', () => {
  it('starts full, is spent on battles, refunded on defeat and regenerates', async () => {
    const { call, profile, ctx } = await guest();
    expect(profile.stamina).toEqual({ current: 200, max: 200, nextAt: null });

    const start = await call<StartBattleResponse>('POST', '/battles', { stageId: '1-1' });
    expect((await call<ProfileDTO>('GET', '/me')).body.stamina.current).toBe(190);

    // Lose on purpose: level-1 heroes against the 1-4 boss.
    ctx.db.run("UPDATE characters SET level = 1 WHERE user_id = ?", profile.user.id);
    for (const id of ['1-1', '1-2', '1-3']) ctx.progress.recordClear(profile.user.id, id, clock);
    const hard = await call<StartBattleResponse>('POST', '/battles', { stageId: '1-4' });
    const played = autoBattle(hard.body.setup);
    expect(played.state.outcome).toBe('defeat');
    const lost = await call<CompleteBattleResponse>('POST', `/battles/${hard.body.battleId}/complete`, { actions: played.actions });
    expect(lost.body.profile.stamina.current).toBe(190); // refunded
    expect(lost.body.profile.stamina.nextAt).toBe(clock + 5 * 60_000);
    expect(start.status).toBe(200);

    clock += 12 * 60_000; // two points
    expect((await call<ProfileDTO>('GET', '/me')).body.stamina.current).toBe(192);
  });

  it('blocks battles without stamina and refills for gems', async () => {
    const { call, profile, ctx } = await guest();
    ctx.users.setStamina(profile.user.id, 3, clock);
    const res = await call<{ error: string }>('POST', '/battles', { stageId: '1-1' });
    expect(res.status).toBe(400);
    const refilled = await call<ProfileDTO>('POST', '/stamina/refill');
    expect(refilled.body.stamina.current).toBe(63);
    expect(refilled.body.wallet.gems).toBe(profile.wallet.gems - 50);
    expect((await call('POST', '/battles', { stageId: '1-1' })).status).toBe(200);
  });
});

describe('sweep', () => {
  it('needs all stars, spends stamina per run and pays loot', async () => {
    const { call, profile, ctx } = await guest();
    const sweep = (count: number) => call<SweepResponse & { error?: string }>('POST', '/sweep', { kind: 'stage', stageId: '1-1', count });
    expect((await sweep(1)).status).toBe(400); // never cleared
    ctx.progress.recordClear(profile.user.id, '1-1', clock, 2);
    expect((await sweep(1)).status).toBe(400); // 2 of 3 stars
    ctx.progress.recordClear(profile.user.id, '1-1', clock, 3);

    const gold = profile.wallet.gold;
    const res = await sweep(5);
    expect(res.status).toBe(200);
    expect(res.body.runs).toBe(5);
    expect(res.body.rewards.gold).toBe(5 * app.services.content.current.stagesById['1-1']!.gold);
    expect(res.body.profile.wallet.gold).toBe(gold + res.body.rewards.gold);
    // Sweeping earns XP; any level ups refund some stamina.
    expect(res.body.profile.stamina.current).toBe(200 - 50 + (res.body.xp?.reward.stamina ?? 0));
    expect(res.body.xp?.gained).toBe(5 * 10 * 6);
    expect(res.body.profile.stageStars['1-1']).toBe(3);

    // Capped by stamina (at max level, so no level-up refunds stamina mid-test).
    ctx.users.setXp(profile.user.id, 10_000_000);
    ctx.users.setStamina(profile.user.id, 25, clock);
    expect((await sweep(10)).body.runs).toBe(2);
    expect((await sweep(1)).status).toBe(400);
  });

  it('sweeps cleared dungeon tiers for stamina per run', async () => {
    const { call, profile, ctx } = await guest();
    const sweep = (count: number) => call<SweepResponse>('POST', '/sweep', { kind: 'dungeon', dungeonId: 'tidal-grotto', tier: 0, count });
    ctx.progress.recordClear(profile.user.id, 'dungeon:tidal-grotto:0', clock);
    expect((await sweep(1)).status).toBe(400); // dungeons still locked
    ctx.progress.recordClear(profile.user.id, '2-1', clock);
    // At max level, so no level-up refunds stamina mid-test. A run costs 10: 25 stamina pays for 2.
    ctx.users.setXp(profile.user.id, 10_000_000);
    ctx.users.setStamina(profile.user.id, 25, clock);
    const res = await sweep(10);
    expect(res.body.runs).toBe(2);
    expect(res.body.profile.stamina.current).toBe(5);
    expect(res.body.materials.find((m) => m.id === 'tide-essence')!.count).toBeGreaterThanOrEqual(4);
    expect((await sweep(1)).status).toBe(400);
  });
});

describe('onboarding', () => {
  it('locks the arena until 1-4 and stores tutorial flags', async () => {
    const { call, profile, ctx } = await guest();
    const status = (await call<{ opponents: { id: string }[] }>('GET', '/arena')).body;
    expect((await call('POST', '/arena/battles', { opponentId: status.opponents[0]!.id })).status).toBe(400);
    ctx.progress.recordClear(profile.user.id, '1-4', clock);
    expect((await call('POST', '/arena/battles', { opponentId: status.opponents[0]!.id })).status).toBe(200);

    expect(profile.flags).toEqual([]);
    expect((await call<ProfileDTO>('POST', '/me/flags', { flag: 'tutorial-battle' })).body.flags).toEqual(['tutorial-battle']);
    expect((await call<ProfileDTO>('POST', '/me/flags', { flag: 'tutorial-battle' })).body.flags).toEqual(['tutorial-battle']);
    expect((await call('POST', '/me/flags', { flag: 'Bad Flag!' })).status).toBe(400);
  });
});

describe('salvage', () => {
  it('auto-salvages low-rarity drops and bulk-salvages spares', async () => {
    const { call, profile, ctx } = await guest();
    ctx.progress.recordClear(profile.user.id, '1-1', clock, 3);
    // 1-1 only drops ★3 gear: with auto-salvage on, nothing reaches the bag.
    expect((await call<ProfileDTO>('PUT', '/me/prefs', { autoSalvage: 3 })).body.prefs.autoSalvage).toBe(3);
    const swept = await call<SweepResponse>('POST', '/sweep', { kind: 'stage', stageId: '1-1', count: 10 });
    expect(swept.body.salvaged.count).toBeGreaterThan(0);
    expect(swept.body.drops).toEqual([]);
    expect(swept.body.profile.gear).toHaveLength(0);
    expect(swept.body.profile.wallet.gold).toBe(profile.wallet.gold + swept.body.rewards.gold + swept.body.salvaged.gold);

    // Turn it off and collect some spares, then clear them out in one go (equipped gear is kept).
    await call('PUT', '/me/prefs', { autoSalvage: 0 });
    const kept = await call<SweepResponse>('POST', '/sweep', { kind: 'stage', stageId: '1-1', count: 10 });
    const bag = kept.body.profile.gear;
    expect(bag.length).toBeGreaterThan(1);
    await call('POST', `/gear/${bag[0]!.id}/equip`, { charId: profile.team[0] });
    const bulk = await call<{ salvaged: { count: number }; profile: ProfileDTO }>('POST', '/gear/salvage-bulk', { maxRarity: 3 });
    expect(bulk.body.salvaged.count).toBe(bag.length - 1);
    expect(bulk.body.profile.gear.map((g) => g.id)).toEqual([bag[0]!.id]);
    expect((await call('PUT', '/me/prefs', { autoSalvage: 5 })).status).toBe(400);
  });
});
