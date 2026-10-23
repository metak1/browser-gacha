import {
  autoBattle,
  createDefaultContent,
  REFERENCE_TEAM,
  type CompleteBattleResponse,
  type ProfileDTO,
  type StartBattleResponse,
  type SummonResponse,
} from '@gacha/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp } from './testing';
import { DEFAULT_ACTIVITY_CHESTS, DEFAULT_LOGIN_CALENDAR, seededRandom, type ClaimMissionResponse } from '@gacha/shared';

let app: FastifyInstance;

// Default content values (the test DB is seeded with defaults).
const { pullCost: PULL_COST, startingGems: STARTING_GEMS, dailyGems: DAILY_GEMS } = createDefaultContent().settings;
// buildTestApp gives new players the reference team as starters.
const STARTER_CHARACTERS = REFERENCE_TEAM;

beforeEach(async () => {
  app = await buildTestApp(
    { dbPath: ':memory:', cookieSecure: false, clientDist: null, logger: false, rateLimit: false },
    { overrides: { random: seededRandom(1) } },
  );
});

afterEach(async () => {
  await app.close();
});

/** A cookie-carrying client, like one browser. */
function device() {
  let sid: string | undefined;
  return async function call<T>(method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) {
    const res = await app.inject({ method, url: `/api${url}`, payload, cookies: sid ? { sid } : {} });
    const cookie = res.cookies.find((c) => c.name === 'sid');
    if (cookie) sid = cookie.value || undefined;
    return { status: res.statusCode, body: res.json() as T };
  };
}

async function newGuest() {
  const call = device();
  const { body } = await call<ProfileDTO>('POST', '/auth/guest');
  return { call, profile: body };
}

describe('auth', () => {
  it('rejects anonymous requests', async () => {
    const { status, body } = await device()('GET', '/me');
    expect(status).toBe(401);
    expect(body).toMatchObject({ error: 'unauthenticated' });
  });

  it('creates a guest with starter characters', async () => {
    const { call, profile } = await newGuest();
    expect(profile.user.username).toBeNull();
    expect(profile.wallet.gems).toBe(STARTING_GEMS);
    expect(profile.team).toEqual(STARTER_CHARACTERS);
    expect((await call<ProfileDTO>('GET', '/me')).body.user.id).toBe(profile.user.id);
  });

  it('by default starts players without heroes and builds their team from the first summon', async () => {
    app.services.content.saveSettings(createDefaultContent().settings);
    const { call, profile } = await newGuest();
    expect(profile.roster).toEqual([]);
    expect(profile.team).toEqual([]);

    const { body } = await call<SummonResponse>('POST', '/gacha/summon', { bannerId: 'standard', count: 10 });
    expect(body.profile.wallet.gems).toBe(STARTING_GEMS);
    expect(body.profile.team).toHaveLength(4);
    const rarity = (id: string) => body.results.find((r) => r.id === id)!.rarity;
    expect(rarity(body.profile.team[0]!)).toBe(5);
    expect(body.profile.team.map(rarity)).toEqual(body.profile.team.map(rarity).sort((a, b) => b - a));

    // Later summons leave the team alone.
    const again = await call<SummonResponse>('POST', '/gacha/summon', { bannerId: 'standard', count: 1 });
    expect(again.body.profile.team).toEqual(body.profile.team);
  });

  it('links a guest so another device can log in to the same progress', async () => {
    const { call, profile } = await newGuest();
    await call('POST', '/gacha/summon', { bannerId: 'standard', count: 1 });
    const linked = await call<ProfileDTO>('POST', '/auth/link', { username: 'Hero_1', password: 'correct horse' });
    expect(linked.status).toBe(200);
    expect(linked.body.user.username).toBe('Hero_1');

    const other = device();
    await other('POST', '/auth/guest');
    expect((await other('POST', '/auth/login', { username: 'hero_1', password: 'wrong password' })).status).toBe(401);
    const login = await other<ProfileDTO>('POST', '/auth/login', { username: 'hero_1', password: 'correct horse' });
    expect(login.status).toBe(200);
    expect(login.body.user.id).toBe(profile.user.id);
    expect(login.body.wallet.gems).toBe(STARTING_GEMS - PULL_COST);
  });

  it('refuses taken usernames and double linking', async () => {
    const a = await newGuest();
    const b = await newGuest();
    await a.call('POST', '/auth/link', { username: 'taken', password: 'password123' });
    expect((await b.call('POST', '/auth/link', { username: 'TAKEN', password: 'password123' })).status).toBe(409);
    expect((await a.call('POST', '/auth/link', { username: 'other', password: 'password123' })).status).toBe(409);
    expect((await b.call('POST', '/auth/link', { username: 'x', password: 'short' })).status).toBe(400);
  });

  it('logout ends the session', async () => {
    const { call } = await newGuest();
    await call('POST', '/auth/logout');
    expect((await call('GET', '/me')).status).toBe(401);
  });
});

describe('economy', () => {
  it('summons spend gems and add characters', async () => {
    const { call } = await newGuest();
    await call('POST', '/me/flags', { flag: 'first-summon' }); // skip the free first 10×
    const { status, body } = await call<SummonResponse>('POST', '/gacha/summon', { bannerId: 'thunder', count: 10 });
    expect(status).toBe(200);
    expect(body.results).toHaveLength(10);
    expect(body.results.some((r) => r.rarity >= 4)).toBe(true);
    expect(body.profile.wallet.gems).toBe(STARTING_GEMS - PULL_COST * 10);
    expect(body.profile.banners.thunder!.pity5).toBeGreaterThan(0);

    const broke = await call('POST', '/gacha/summon', { bannerId: 'thunder', count: 10 });
    expect(broke.status).toBe(400);
    expect(broke.body).toMatchObject({ error: 'insufficient_funds' });
  });

  it('makes the first 10× summon free with a guaranteed ★5', async () => {
    const { call } = await newGuest();
    // A single pull doesn't use up the free 10×.
    const single = await call<SummonResponse>('POST', '/gacha/summon', { bannerId: 'standard', count: 1 });
    expect(single.body.profile.wallet.gems).toBe(STARTING_GEMS - PULL_COST);

    const free = await call<SummonResponse>('POST', '/gacha/summon', { bannerId: 'standard', count: 10 });
    expect(free.status).toBe(200);
    expect(free.body.results.filter((r) => r.rarity === 5).length).toBeGreaterThanOrEqual(1);
    expect(free.body.profile.wallet.gems).toBe(STARTING_GEMS - PULL_COST);
    expect(free.body.profile.flags).toContain('first-summon');

    // The next 10× costs gems again.
    const paid = await call<SummonResponse>('POST', '/gacha/summon', { bannerId: 'standard', count: 10 });
    expect(paid.status).toBe(400);
    expect(paid.body).toMatchObject({ error: 'insufficient_funds' });
  });

  it('keeps named team presets and switches between them', async () => {
    const { call, profile } = await newGuest();
    expect(profile.teams).toHaveLength(5);
    expect(profile.activeTeam).toBe(0);
    expect(profile.teams[0]).toMatchObject({ name: 'Main team', members: STARTER_CHARACTERS });

    // A fresh preset starts as a copy of the current team; then it can be edited on its own.
    const second = await call<ProfileDTO>('POST', '/teams/1/activate');
    expect(second.body.activeTeam).toBe(1);
    expect(second.body.team).toEqual(STARTER_CHARACTERS);
    const solo = await call<ProfileDTO>('PUT', '/team', { team: [STARTER_CHARACTERS[0]] });
    expect(solo.body.teams[1]!.members).toEqual([STARTER_CHARACTERS[0]]);
    const renamed = await call<ProfileDTO>('PUT', '/teams/1', { name: '  Boss rush  ' });
    expect(renamed.body.teams[1]!.name).toBe('Boss rush');

    // Back to the main team: its members are untouched, and the solo team is remembered.
    const back = await call<ProfileDTO>('POST', '/teams/0/activate');
    expect(back.body.team).toEqual(STARTER_CHARACTERS);
    expect(back.body.teams[1]).toMatchObject({ name: 'Boss rush', members: [STARTER_CHARACTERS[0]] });
    expect((await call('POST', '/teams/9/activate')).status).toBe(400);
  });

  it('daily missions pay activity points that open daily chests', async () => {
    const { call } = await newGuest();
    await call('POST', '/daily');
    const checkin = await call<ClaimMissionResponse>('POST', '/missions/daily-checkin/claim');
    expect(checkin.body.profile.activity).toEqual({ points: 10, claimed: [] });
    const early = await call('POST', '/activity/30/claim');
    expect(early.status).toBe(400);
    expect(early.body).toMatchObject({ error: 'not_enough_points' });

    // Win three battles for the daily skirmish mission (+20 points).
    for (let i = 0; i < 3; i++) {
      const start = await call<StartBattleResponse>('POST', '/battles', { stageId: '1-1' });
      const { actions } = autoBattle(start.body.setup);
      await call('POST', `/battles/${start.body.battleId}/complete`, { actions });
    }
    const battles = await call<ClaimMissionResponse>('POST', '/missions/daily-battles/claim');
    expect(battles.body.profile.activity.points).toBe(30);
    const before = battles.body.profile;
    expect(before.missionsReady).toBeGreaterThanOrEqual(1); // the chest counts as ready

    const chest = await call<ProfileDTO>('POST', '/activity/30/claim');
    expect(chest.status).toBe(200);
    expect(chest.body.activity.claimed).toEqual([30]);
    expect(chest.body.wallet.gold).toBe(before.wallet.gold + DEFAULT_ACTIVITY_CHESTS[0]!.reward.gold);
    expect((await call('POST', '/activity/30/claim')).status).toBe(409);
    expect((await call('POST', '/activity/45/claim')).status).toBe(404);
  });

  it('daily reward can be claimed once', async () => {
    const { call } = await newGuest();
    const first = await call<ProfileDTO>('POST', '/daily');
    // Day 1 of the login calendar adds its own reward on top of the daily supplies.
    expect(first.body.wallet.gems).toBe(STARTING_GEMS + DAILY_GEMS + DEFAULT_LOGIN_CALENDAR[0]!.gems);
    expect(first.body.account.loginDays).toBe(1);
    expect(first.body.dailyAvailable).toBe(false);
    expect((await call('POST', '/daily')).status).toBe(409);
  });

  it('validates team changes and levels characters up', async () => {
    const { call, profile } = await newGuest();
    expect((await call('PUT', '/team', { team: ['ignis'] })).status).toBe(400);
    expect((await call('PUT', '/team', { team: ['torch', 'torch'] })).status).toBe(400);
    expect((await call<ProfileDTO>('PUT', '/team', { team: ['torch'] })).body.team).toEqual(['torch']);

    const leveled = await call<ProfileDTO>('POST', '/roster/torch/level-up');
    expect(leveled.body.roster.find((c) => c.id === 'torch')!.level).toBe(2);
    expect(leveled.body.wallet.gold).toBeLessThan(profile.wallet.gold);
  });
});

describe('battles', () => {
  it('verifies a won battle and pays first-clear rewards once', async () => {
    const { call, profile } = await newGuest();
    const start = await call<StartBattleResponse>('POST', '/battles', { stageId: '1-1' });
    expect(start.status).toBe(200);

    const { actions, state } = autoBattle(start.body.setup);
    expect(state.outcome).toBe('victory');
    const done = await call<CompleteBattleResponse>('POST', `/battles/${start.body.battleId}/complete`, { actions });
    expect(done.body).toMatchObject({ outcome: 'victory', firstClear: true });
    expect(done.body.profile.clearedStages).toContain('1-1');
    expect(done.body.profile.wallet.gems).toBe(profile.wallet.gems + done.body.rewards.gems);

    // Can't claim the same battle twice.
    expect((await call('POST', `/battles/${start.body.battleId}/complete`, { actions })).status).toBe(409);

    // A second clear pays gold but no gems.
    const again = await call<StartBattleResponse>('POST', '/battles', { stageId: '1-1' });
    const replayed = autoBattle(again.body.setup);
    const second = await call<CompleteBattleResponse>('POST', `/battles/${again.body.battleId}/complete`, {
      actions: replayed.actions,
    });
    expect(second.body.firstClear).toBe(false);
    expect(second.body.rewards.gems).toBe(0);
  });

  it('rejects tampered or incomplete action logs', async () => {
    const { call } = await newGuest();
    const start = await call<StartBattleResponse>('POST', '/battles', { stageId: '1-1' });
    const forged = await call('POST', `/battles/${start.body.battleId}/complete`, {
      actions: [{ kind: 'basic', target: 'e9' }],
    });
    expect(forged.status).toBe(400);
    expect(forged.body).toMatchObject({ error: 'invalid_battle' });

    const quit = await call<CompleteBattleResponse>('POST', `/battles/${start.body.battleId}/complete`, { actions: [] });
    expect(quit.body.outcome).toBe('ongoing');
    expect(quit.body.rewards).toEqual({ gems: 0, gold: 0 });
  });

  it('locks stages until the previous one is cleared', async () => {
    const { call } = await newGuest();
    const res = await call('POST', '/battles', { stageId: '1-2' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'stage_locked' });
  });

  it("can't complete someone else's battle", async () => {
    const a = await newGuest();
    const b = await newGuest();
    const start = await a.call<StartBattleResponse>('POST', '/battles', { stageId: '1-1' });
    const { actions } = autoBattle(start.body.setup);
    expect((await b.call('POST', `/battles/${start.body.battleId}/complete`, { actions })).status).toBe(404);
  });
});
