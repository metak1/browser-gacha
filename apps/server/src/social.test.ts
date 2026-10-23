import { autoBattle, seededRandom, type CompleteBattleResponse, type GuildDTO, type ProfileDTO, type SocialDTO, type StartBattleResponse } from '@gacha/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import type { ServiceContext } from './services/context';

const baseConfig = { cookieSecure: false, clientDist: null, logger: false, rateLimit: false };
let app: FastifyInstance;
// Inside the default Harvest Moon event (2026-10-15 .. 2026-11-15).
let clock = Date.UTC(2026, 9, 20, 12);

beforeEach(async () => {
  clock = Date.UTC(2026, 9, 20, 12);
  app = await buildApp({ ...baseConfig, dbPath: ':memory:' }, { overrides: { random: seededRandom(4), now: () => clock } });
});
afterEach(async () => app.close());

const ctx = () => (app.services.player as unknown as { ctx: ServiceContext }).ctx;

async function player(strong = true) {
  let sid: string | undefined;
  const call = async <T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) => {
    const res = await app.inject({ method, url: `/api${url}`, payload, cookies: sid ? { sid } : {} });
    const cookie = res.cookies.find((c) => c.name === 'sid');
    if (cookie) sid = cookie.value || undefined;
    return { status: res.statusCode, body: res.json() as T };
  };
  const { body: profile } = await call<ProfileDTO>('POST', '/auth/guest');
  if (strong) {
    for (const id of profile.team) ctx().db.run('UPDATE characters SET level = 60, ascension = 4 WHERE user_id = ? AND char_id = ?', profile.user.id, id);
  }
  return { call, profile, id: profile.user.id };
}

async function play(call: Awaited<ReturnType<typeof player>>['call'], start: { status: number; body: StartBattleResponse }) {
  expect(start.status).toBe(200);
  const { actions } = autoBattle(start.body.setup);
  return (await call<CompleteBattleResponse>('POST', `/battles/${start.body.battleId}/complete`, { actions })).body;
}

describe('player level and titles', () => {
  it('earns XP from wins, levels up with rewards, and unlocks titles', async () => {
    const { call, profile } = await player();
    expect(profile.account).toMatchObject({ level: 1, xp: 0, title: null, titles: [] });
    const result = await play(call, await call<StartBattleResponse>('POST', '/battles', { stageId: '1-1' }));
    expect(result.xp).toMatchObject({ gained: 60, level: 1, levelsGained: 0 });

    ctx().users.setXp(profile.user.id, 2000);
    const me = (await call<ProfileDTO>('GET', '/me')).body;
    expect(me.account.level).toBeGreaterThanOrEqual(5);
    expect(me.account.titles).toContain('Adventurer');
    expect((await call<ProfileDTO>('PUT', '/me/title', { title: 'Adventurer' })).body.account.title).toBe('Adventurer');
    expect((await call('PUT', '/me/title', { title: 'Mythic' })).status).toBe(400);
  });
});

describe('friends', () => {
  it('adds friends by code and borrows a support hero once a day', async () => {
    const a = await player();
    const b = await player();
    expect((await a.call('POST', '/social/requests', { code: 'NOPE000000' })).status).toBe(404);
    expect((await a.call('POST', '/social/requests', { code: a.profile.account.friendCode })).status).toBe(400);
    await a.call('POST', '/social/requests', { code: b.profile.account.friendCode });
    const bView = (await b.call<SocialDTO>('GET', '/social')).body;
    expect(bView.requests).toEqual([expect.objectContaining({ id: a.id, incoming: true })]);
    const accepted = (await b.call<SocialDTO>('POST', `/social/requests/${a.id}/accept`)).body;
    expect(accepted.friends.map((f) => f.id)).toEqual([a.id]);

    const aView = (await a.call<SocialDTO>('GET', '/social')).body;
    expect(aView.friends[0]!.support?.charId).toBe(b.profile.team[0]);
    const goldBefore = ctx().users.findById(b.id)!.wallet.gold;
    const start = await a.call<StartBattleResponse>('POST', '/battles', { stageId: '1-1', friendId: b.id });
    expect(start.status).toBe(200);
    expect(start.body.setup.allies).toHaveLength(a.profile.team.length + 1);
    expect(start.body.setup.allies.at(-1)!.friend).toMatch(/^Guest-/);
    expect(ctx().users.findById(b.id)!.wallet.gold).toBe(goldBefore + 200);
    expect((await a.call('POST', '/battles', { stageId: '1-1', friendId: b.id })).status).toBe(400);
    expect((await a.call<SocialDTO>('GET', '/social')).body.friends[0]!.usedToday).toBe(true);

    await a.call('DELETE', `/social/${b.id}`);
    expect((await b.call<SocialDTO>('GET', '/social')).body.friends).toEqual([]);
  });
});

describe('guilds', () => {
  it('founds and joins guilds, attacks the weekly boss and opens chests', async () => {
    const a = await player();
    const b = await player();
    expect((await a.call('POST', '/guilds', { name: 'Starlit Order' })).status).toBe(400); // not enough gold
    ctx().users.adjustWallet(a.id, { gold: 10_000 });
    const created = await a.call<GuildDTO>('POST', '/guilds', { name: 'Starlit Order', description: 'Hi!' });
    expect(created.body).toMatchObject({ name: 'Starlit Order', role: 'leader', memberCount: 1 });
    const found = (await b.call<{ id: string }[]>('GET', '/guilds?q=starlit')).body;
    expect((await b.call<GuildDTO>('POST', `/guilds/${found[0]!.id}/join`)).body.memberCount).toBe(2);

    const start = await a.call<StartBattleResponse>('POST', '/guild/battles');
    expect(start.body.setup.turnLimit).toBe(40);
    expect(start.body.setup.enemies[0]!.stats.hp).toBe(created.body.boss.pool);
    const done = await play(a.call, start);
    expect(done.guild!.damage).toBeGreaterThan(0);
    expect(done.guild!.attemptsLeft).toBe(2);
    expect(done.xp?.gained).toBe(40);

    let g = (await a.call<GuildDTO>('GET', '/guild')).body;
    expect(g.boss.damage).toBe(done.guild!.damage);
    expect(g.members[0]!.weeklyAttacks).toBe(1);
    // Push the guild to 25% and open that chest (B never attacked, so it's locked for them).
    ctx().guilds.addDamage(g.id, g.boss.week, a.id, Math.ceil(g.boss.pool / 4));
    g = (await a.call<GuildDTO>('GET', '/guild')).body;
    expect(g.chests[0]).toMatchObject({ percent: 25, unlocked: true, claimed: false });
    expect((await a.call('POST', '/guild/chests/25/claim')).status).toBe(200);
    expect((await a.call('POST', '/guild/chests/25/claim')).status).toBe(409);
    expect((await a.call('POST', '/guild/chests/50/claim')).status).toBe(400);
    expect((await b.call('POST', '/guild/chests/25/claim')).status).toBe(400);

    // The leader leaving hands the guild over.
    await a.call('POST', '/guild/leave');
    expect((await b.call<GuildDTO>('GET', '/guild')).body).toMatchObject({ role: 'leader', memberCount: 1 });
  });
});

describe('events', () => {
  it('pays event currency, unlocks stages in order and sells the event hero', async () => {
    const { call, id } = await player();
    expect((await call('POST', '/events/harvest-moon/stages/1/battles')).status).toBe(400);
    const won = await play(call, await call<StartBattleResponse>('POST', '/events/harvest-moon/stages/0/battles'));
    expect(won.outcome).toBe('victory');
    expect(won.event!.currency).toBeGreaterThanOrEqual(8);
    expect(won.rewards.gems).toBe(100);
    expect(won.profile.events['harvest-moon']!.currency).toBe(won.event!.currency);
    expect((await call('POST', '/events/harvest-moon/stages/1/battles')).status).toBe(200);

    expect((await call('POST', '/events/harvest-moon/shop/hollow/buy', { count: 1 })).status).toBe(400);
    ctx().events.addCurrency(id, 'harvest-moon', 1000);
    const bought = await call<ProfileDTO>('POST', '/events/harvest-moon/shop/hollow/buy', { count: 2 });
    expect(bought.status).toBe(200);
    expect(bought.body.roster.find((c) => c.id === 'hollow')?.copies).toBe(2);
    expect(bought.body.events['harvest-moon']!.purchases.hollow).toBe(2);
    expect((await call('POST', '/events/harvest-moon/shop/hollow/buy', { count: 4 })).status).toBe(400); // limit 5

    clock = Date.UTC(2026, 11, 1);
    expect((await call('POST', '/events/harvest-moon/stages/0/battles')).status).toBe(400);
  });
});
