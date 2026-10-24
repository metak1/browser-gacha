import { autoBattle, seededRandom, type CompleteBattleResponse, type ProfileDTO, type StartBattleResponse } from '@gacha/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, newGuest, serviceContext, TEST_CONFIG } from './testing';

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildTestApp(TEST_CONFIG, { overrides: { random: seededRandom(5), now: () => Date.UTC(2026, 9, 20, 12) } });
});
afterEach(async () => app.close());

const guest = () => newGuest(app);

describe('stage stars and chapter chests', () => {
  it('scores objectives, keeps the best stars and opens chests once', async () => {
    const { call, profile } = await guest();
    const content = app.services.content;
    const stage = content.current.stagesById['1-1']!;
    // Make the action limit impossible, so a clean win is exactly 2 stars.
    content.save('stages', { ...stage, objectives: [{ kind: 'win' }, { kind: 'noDeaths' }, { kind: 'maxActions', value: 1 }] });
    const chapter = content.current.chaptersById[1]!;
    content.save('chapters', {
      ...chapter,
      starRewards: [
        { stars: 2, reward: { gems: 77, gold: 0, stardust: 0, materials: [{ id: 'skill-tome', count: 2 }] } },
        { stars: 3, reward: { gems: 1, gold: 0, stardust: 0, materials: [] } },
      ],
    });

    // Can't open before earning the stars.
    expect((await call('POST', '/chapters/1/chests/2/claim')).status).toBe(400);

    const ctx = serviceContext(app);
    for (const id of profile.team) ctx.roster.setLevel(profile.user.id, id, 15);
    const start = await call<StartBattleResponse>('POST', '/battles', { stageId: '1-1' });
    const { actions, state } = autoBattle(start.body.setup);
    expect(state.outcome).toBe('victory');
    const done = await call<CompleteBattleResponse>('POST', `/battles/${start.body.battleId}/complete`, { actions });
    const clean = state.units.every((u) => u.side !== 'ally' || u.hp > 0);
    expect(done.body.objectives).toEqual([true, clean, false]);
    expect(done.body.stars).toBe(clean ? 2 : 1);
    expect(done.body.newBest).toBe(true);
    expect(done.body.profile.stageStars['1-1']).toBe(done.body.stars);

    // A worse run never lowers the best.
    ctx.progress.recordClear(profile.user.id, '1-1', 0, 1);
    ctx.progress.recordClear(profile.user.id, '1-1', 0, 2);
    const me = await call<ProfileDTO>('GET', '/me');
    expect(me.body.stageStars['1-1']).toBe(2);

    const gems = me.body.wallet.gems;
    const opened = await call<ProfileDTO>('POST', '/chapters/1/chests/2/claim');
    expect(opened.status).toBe(200);
    expect(opened.body.wallet.gems).toBe(gems + 77);
    expect(opened.body.materials['skill-tome']).toBe(2);
    expect(opened.body.claimedChests).toEqual(['1:2']);
    expect((await call('POST', '/chapters/1/chests/2/claim')).status).toBe(409);
    expect((await call('POST', '/chapters/1/chests/3/claim')).status).toBe(400);
    expect((await call('POST', '/chapters/1/chests/5/claim')).status).toBe(404);
  });

  it('rejects chests that need more stars than the chapter has', () => {
    const chapter = app.services.content.current.chaptersById[1]!;
    expect(() =>
      app.services.content.save('chapters', { ...chapter, starRewards: [{ stars: 99, reward: { gems: 1, gold: 0, stardust: 0, materials: [] } }] }),
    ).toThrow(/only has 12/);
  });
});
