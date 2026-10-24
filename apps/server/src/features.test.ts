import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  autoBattle,
  createDefaultContent,
  seededRandom,
  towerFloor,
  towerKey,
  type ArenaLeaderboardEntryDTO,
  type ArenaStatusDTO,
  type CompleteBattleResponse,
  type GearActionResponse,
  type GearSlot,
  type ProfileDTO,
  type StartBattleResponse,
} from '@gacha/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, makeGear, newGuest, serviceContext, TEST_CONFIG, type Client } from './testing';

let app: FastifyInstance;
let clock = Date.UTC(2026, 9, 20, 12);

beforeEach(async () => {
  clock = Date.UTC(2026, 9, 20, 12);
  app = await buildTestApp(TEST_CONFIG, { overrides: { random: seededRandom(11), now: () => clock } });
});
afterEach(async () => app.close());

// Arena and dungeons open with campaign progress.
const guest = () => newGuest(app, { cleared: ['1-4', '2-1'], at: clock });

/** Plays a campaign stage on auto until it's won (or gives up). */
async function winStage(call: Client, stageId: string) {
  for (let i = 0; i < 10; i++) {
    const start = await call<StartBattleResponse>('POST', '/battles', { stageId });
    const { actions, state } = autoBattle(start.body.setup);
    const done = await call<CompleteBattleResponse>('POST', `/battles/${start.body.battleId}/complete`, { actions });
    if (state.outcome === 'victory') return done.body;
  }
  throw new Error('could not win');
}

describe('gear', () => {
  it('drops from stages, equips, boosts battle stats, upgrades and salvages', async () => {
    const { call, profile } = await guest();
    app.services.admin.grant(profile.user.id, { gold: 100_000 });

    let drops = 0;
    let result: CompleteBattleResponse | null = null;
    for (let i = 0; i < 12 && drops === 0; i++) {
      result = await winStage(call, '1-1');
      drops += result.drops.length;
    }
    expect(drops).toBeGreaterThan(0);
    const item = result!.profile.gear[0]!;
    expect(item.equippedTo).toBeNull();
    expect(createDefaultContent().gearSets.map((x) => x.id)).toContain(item.set); // every drop belongs to a set

    const before = await call<StartBattleResponse>('POST', '/battles', { stageId: '1-1' });
    const equip = await call<GearActionResponse>('POST', `/gear/${item.id}/equip`, { charId: 'torch' });
    expect(equip.body.item!.equippedTo).toBe('torch');
    const after = await call<StartBattleResponse>('POST', '/battles', { stageId: '1-1' });
    const torch = (s: StartBattleResponse) => s.setup.allies.find((a) => a.id === 'torch')!.stats;
    expect(JSON.stringify(torch(after.body))).not.toBe(JSON.stringify(torch(before.body)));

    const up = await call<GearActionResponse>('POST', `/gear/${item.id}/upgrade`);
    expect(up.body.item!.level).toBe(1);
    expect(up.body.profile.wallet.gold).toBeLessThan(equip.body.profile.wallet.gold);

    const salvage = await call<GearActionResponse>('POST', `/gear/${item.id}/salvage`);
    expect(salvage.body.profile.gear.find((g) => g.id === item.id)).toBeUndefined();
    expect(salvage.body.profile.wallet.gold).toBeGreaterThan(up.body.profile.wallet.gold);
  });

  it("can't touch someone else's gear or equip unowned heroes", async () => {
    const a = await guest();
    const b = await guest();
    let gear = a.profile.gear;
    for (let i = 0; i < 12 && !gear.length; i++) gear = (await winStage(a.call, '1-1')).profile.gear;
    const id = gear[0]!.id;
    expect((await b.call('POST', `/gear/${id}/upgrade`)).status).toBe(404);
    expect((await a.call('POST', `/gear/${id}/equip`, { charId: 'ignis' })).status).toBe(400);
  });
});

describe('arena', () => {
  it('offers bots when alone, spends tickets and moves the rating', async () => {
    const { call } = await guest();
    const status = (await call<ArenaStatusDTO>('GET', '/arena')).body;
    expect(status.rating).toBe(1000);
    expect(status.opponents).toHaveLength(3);
    expect(status.opponents.every((o) => o.isBot)).toBe(true);
    expect(status.defense.length).toBeGreaterThan(0);

    const opp = status.opponents[0]!;
    const start = await call<StartBattleResponse>('POST', '/arena/battles', { opponentId: opp.id });
    expect(start.body.mode).toBe('arena');
    expect(start.body.setup.enemies.map((e) => e.id).sort()).toEqual(opp.team.map((t) => t.id).sort());
    const { actions, state } = autoBattle(start.body.setup);
    const done = await call<CompleteBattleResponse>('POST', `/battles/${start.body.battleId}/complete`, { actions });
    expect(done.body.arena!.ratingAfter - done.body.arena!.ratingBefore).toBe(done.body.arena!.delta);
    expect(done.body.arena!.delta > 0).toBe(state.outcome === 'victory');

    const next = (await call<ArenaStatusDTO>('GET', '/arena')).body;
    expect(next.tickets).toBe(status.tickets - 1);
    expect(next.history[0]!.youAttacked).toBe(true);
    // The same opponent can't be fought twice from one list.
    expect((await call('POST', '/arena/battles', { opponentId: opp.id })).status).toBe(404);
  });

  it('rejects made-up opponents and runs out of tickets', async () => {
    const { call } = await guest();
    await call('GET', '/arena');
    expect((await call('POST', '/arena/battles', { opponentId: 'bot-fake' })).status).toBe(404);
    const max = createDefaultContent().settings.arenaTicketsPerDay;
    for (let i = 0; i < max; i++) {
      const status = (await call<ArenaStatusDTO>('POST', '/arena/refresh')).body;
      expect((await call('POST', '/arena/battles', { opponentId: status.opponents[0]!.id })).status).toBe(200);
    }
    const status = (await call<ArenaStatusDTO>('POST', '/arena/refresh')).body;
    const res = await call<{ error: string }>('POST', '/arena/battles', { opponentId: status.opponents[0]!.id });
    expect(res.body.error).toBe('no_tickets');
  });

  it('matches real players and updates both ratings', async () => {
    const defender = await guest();
    await defender.call('PUT', '/arena/defense', { team: ['pebble', 'puddle'] });
    const attacker = await guest();
    const status = (await attacker.call<ArenaStatusDTO>('GET', '/arena')).body;
    const real = status.opponents.find((o) => !o.isBot)!;
    expect(real.id).toBe(defender.profile.user.id);

    const start = await attacker.call<StartBattleResponse>('POST', '/arena/battles', { opponentId: real.id });
    const { actions } = autoBattle(start.body.setup);
    const done = await attacker.call<CompleteBattleResponse>('POST', `/battles/${start.body.battleId}/complete`, { actions });
    const def = (await defender.call<ArenaStatusDTO>('GET', '/arena')).body;
    expect(def.rating).not.toBe(1000);
    expect(Math.sign(def.rating - 1000)).toBe(-Math.sign(done.body.arena!.delta));
    expect(def.history[0]!.youAttacked).toBe(false);

    const board = (await attacker.call<ArenaLeaderboardEntryDTO[]>('GET', '/arena/leaderboard')).body;
    expect(board.some((e) => e.isYou)).toBe(true);
  });

  it('pays the weekly tier reward and soft-resets the rating', async () => {
    const { call, profile } = await guest();
    await call('GET', '/arena');
    // Test-only: reach the arena repository behind the service to set up a Gold-tier rating.
    const repo = serviceContext(app).arena;
    repo.save({ ...repo.get(profile.user.id)!, rating: 1300 });

    clock += 7 * 24 * 3600 * 1000;
    const before = (await call<ProfileDTO>('GET', '/me')).body.wallet.gems;
    const status = (await call<ArenaStatusDTO>('GET', '/arena')).body;
    expect(status.seasonReward?.tier).toBe('Gold');
    expect(status.rating).toBe(1150);
    expect((await call<ProfileDTO>('GET', '/me')).body.wallet.gems).toBe(before + status.seasonReward!.reward.gems);
    expect((await call<ArenaStatusDTO>('GET', '/arena')).body.seasonReward).toBeNull();
  });
});

describe('content upgrade', () => {
  it('adds ultimates, gear and drops to content saved by the previous version', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gacha-upgrade-'));
    const dbPath = join(dir, 'game.db');
    const first = await buildTestApp({ ...TEST_CONFIG, dbPath });
    await first.close();

    // Make the stored content look like it came from before ultimates/gear existed.
    const raw = new DatabaseSync(dbPath);
    for (const row of raw.prepare("SELECT kind, id, data FROM content WHERE kind IN ('characters', 'enemies', 'stages')").all() as {
      kind: string;
      id: string;
      data: string;
    }[]) {
      const doc = JSON.parse(row.data) as Record<string, unknown>;
      delete doc.ultimate;
      delete doc.drops;
      raw.prepare('UPDATE content SET data = ? WHERE kind = ? AND id = ?').run(JSON.stringify(doc), row.kind, row.id);
    }
    raw.exec(
      "DELETE FROM content WHERE kind = 'gear' OR id LIKE '%-ult'; UPDATE meta SET value = '1' WHERE key = 'content_schema'; DELETE FROM meta WHERE key = 'content_upgrades';",
    );
    raw.close();

    const second = await buildTestApp({ ...TEST_CONFIG, dbPath });
    const c = second.services.content.current;
    expect(c.charactersById.ignis!.ultimate).toBe('ignis-ult');
    expect(c.bundle.gear.length).toBeGreaterThan(0);
    expect(c.stagesById['1-1']!.drops.length).toBeGreaterThan(0);
    await second.close();
    await rm(dir, { recursive: true, force: true });
  });
});

describe('art upgrade', () => {
  it('adds icons, sprite units and their stages to content from before art existed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gacha-art-'));
    const dbPath = join(dir, 'game.db');
    const first = await buildTestApp({ ...TEST_CONFIG, dbPath });
    await first.close();

    // Roll the stored content back to how v2 saved it.
    const raw = new DatabaseSync(dbPath);
    for (const row of raw.prepare("SELECT kind, id, data FROM content WHERE kind IN ('skills', 'gear', 'stages', 'characters', 'enemies')").all() as {
      kind: string;
      id: string;
      data: string;
    }[]) {
      const doc = JSON.parse(row.data) as Record<string, unknown>;
      delete doc.icon;
      delete doc.sprite;
      if (row.kind === 'stages' && row.id === '2-1')
        doc.enemies = [
          { id: 'imp', level: 7 },
          { id: 'wolf', level: 7 },
          { id: 'imp', level: 7 },
        ];
      if (row.kind === 'stages' && row.id === '2-2') doc.enemies = [{ id: 'golem', level: 30 }]; // customised by an admin
      raw.prepare('UPDATE content SET data = ? WHERE kind = ? AND id = ?').run(JSON.stringify(doc), row.kind, row.id);
    }
    raw.exec(`DELETE FROM content WHERE (kind = 'characters' AND id = 'aldric') OR (kind = 'enemies' AND id IN ('orc', 'demon', 'blood-fiend'));
              UPDATE meta SET value = '2' WHERE key = 'content_schema'; DELETE FROM meta WHERE key = 'content_upgrades';`);
    raw.close();

    const second = await buildTestApp({ ...TEST_CONFIG, dbPath });
    const c = second.services.content.current;
    expect(c.skillsById['ignis-basic']!.icon).toBeGreaterThan(0);
    expect(c.gearById['runed-saber']!.icon).toBeGreaterThan(0);
    expect(c.charactersById.aldric!.sprite).toBe('soldier');
    expect(c.enemiesById.demon!.sprite).toBe('demon');
    // v3 swapped the demon in; v8 then swaps the hellhound in, since the lineup was still the default.
    expect(c.stagesById['2-1']!.enemies.map((e) => e.id)).toEqual(['imp', 'hellhound', 'imp']);
    // Admin edits are left alone.
    expect(c.stagesById['2-2']!.enemies.map((e) => e.id)).toEqual(['golem']);
    // Battles carry the sprite through to the client.
    const setup = (await import('@gacha/shared')).buildBattleSetup(c, 1, [{ id: 'aldric', level: 5, constellation: 0 }], c.stagesById['2-1']!);
    expect(setup.allies[0]!.sprite).toBe('soldier');
    expect(setup.allies[0]!.basic.icon).toBeGreaterThan(0);
    await second.close();
    await rm(dir, { recursive: true, force: true });
  });
});

describe('gear dungeons', () => {
  it("drop only gear from the dungeon's two sets at random, in fights and sweeps, and the loot can be sold", async () => {
    const { call, profile } = await guest();
    const ctx = serviceContext(app);
    for (const id of profile.team) ctx.roster.setLevel(profile.user.id, id, 40);
    const tier = createDefaultContent().dungeons.find((d) => d.id === 'armory')!.tiers[0]!;

    const start = await call<StartBattleResponse>('POST', '/dungeons/armory/battles', { tier: 0 });
    expect(start.status).toBe(200);
    const { actions, state } = autoBattle(start.body.setup);
    expect(state.outcome).toBe('victory');
    const done = await call<CompleteBattleResponse>('POST', `/battles/${start.body.battleId}/complete`, { actions });
    expect(done.body.materials).toEqual([]);
    expect(done.body.drops.length + done.body.salvaged.count).toBe(tier.gearRolls!.count);
    expect(done.body.drops.length).toBeGreaterThan(0);
    for (const g of done.body.drops) expect(['precision', 'ruin']).toContain(g.set);
    // Selling a drop from the result screen is a salvage: the item goes and gold comes in.
    const drop = done.body.drops[0]!;
    const goldBefore = ctx.users.findById(profile.user.id)!.wallet.gold;
    const sold = await call<GearActionResponse>('POST', `/gear/${drop.id}/salvage`);
    expect(sold.body.profile.wallet.gold).toBeGreaterThan(goldBefore);
    expect(sold.body.profile.gear.some((g) => g.id === drop.id)).toBe(false);
    // The Armory's mechanic (Ironhide) was in the fight: enemies carry 2.5x DEF.
    const plain = createDefaultContent().enemies.find((e) => e.id === start.body.setup.enemies[0]!.id)!;
    expect(start.body.setup.enemies[0]!.stats.def).toBeGreaterThan(plain.base.def * 2);

    // Sweeps roll the same way: each drop is one of the Armory's two sets, never another dungeon's.
    const sweep = await call<{ runs: number; drops: { set: string | null }[] }>('POST', '/sweep', { kind: 'dungeon', dungeonId: 'armory', tier: 0, count: 2 });
    expect(sweep.body.runs).toBe(2);
    expect(sweep.body.drops.length).toBeGreaterThan(0);
    for (const g of sweep.body.drops) expect(['precision', 'ruin']).toContain(g.set);
  });
});

describe('roster tools and the tower', () => {
  const ctxOf = () => serviceContext(app);

  it('levels up several times at once, stopping at the cap or when gold runs out', async () => {
    const { call, profile } = await guest();
    app.services.admin.grant(profile.user.id, { gold: 100_000 });
    const hero = profile.team[0]!;
    const five = await call<ProfileDTO>('POST', `/roster/${hero}/level-up`, { count: 5 });
    expect(five.body.roster.find((c) => c.id === hero)!.level).toBe(6);
    // Asking for more than the cap allows just stops at the cap.
    const max = await call<ProfileDTO>('POST', `/roster/${hero}/level-up`, { count: 100 });
    expect(max.body.roster.find((c) => c.id === hero)!.level).toBe(20);
    expect((await call('POST', `/roster/${hero}/level-up`, { count: 1 })).status).toBe(409);
    // A plain call still levels once.
    const other = profile.team[1]!;
    const one = await call<ProfileDTO>('POST', `/roster/${other}/level-up`);
    expect(one.body.roster.find((c) => c.id === other)!.level).toBe(2);
  });

  it('auto-equips the best free gear without taking it from other heroes', async () => {
    const { call, profile } = await guest();
    const ctx = ctxOf();
    const [a, b] = profile.team as [string, string];
    const weapon = (id: string, atk: number) => makeGear({ id, main: { stat: 'atk', value: atk } });
    ctx.gear.insert(profile.user.id, weapon('weak', 10), clock);
    ctx.gear.insert(profile.user.id, weapon('strong', 60), clock);
    ctx.gear.insert(profile.user.id, weapon('taken', 90), clock);
    ctx.gear.setEquipped(profile.user.id, 'taken', b);

    const res = await call<ProfileDTO>('POST', `/roster/${a}/auto-equip`);
    expect(res.status).toBe(200);
    const gear = ctx.gear.list(profile.user.id);
    expect(gear.find((g) => g.id === 'strong')!.equippedTo).toBe(a);
    expect(gear.find((g) => g.id === 'taken')!.equippedTo).toBe(b);
    expect(gear.find((g) => g.id === 'weak')!.equippedTo).toBeNull();
  });

  it("auto-equip completes the hero's target set before taking stronger pieces of other sets", async () => {
    const { call, profile } = await guest();
    const ctx = ctxOf();
    const hero = profile.team[0]!;
    const piece = (id: string, slot: GearSlot, set: string, atk: number) => makeGear({ id, slot, set, main: { stat: 'atk', value: atk } });
    for (const slot of ['weapon', 'armor', 'charm', 'boots'] as const) {
      ctx.gear.insert(profile.user.id, piece(`gale-${slot}`, slot, 'gale', 5), clock);
      ctx.gear.insert(profile.user.id, piece(`ruin-${slot}`, slot, 'ruin', 80), clock);
    }
    // Without a target, raw ATK wins.
    await call('POST', `/roster/${hero}/auto-equip`);
    expect(ctx.gear.equippedOn(profile.user.id, hero).every((g) => g.set === 'ruin')).toBe(true);

    expect((await call('PUT', `/roster/${hero}/gear-set`, { set: 'nope' })).status).toBe(400);
    const set = await call<ProfileDTO>('PUT', `/roster/${hero}/gear-set`, { set: 'gale' });
    expect(set.body.roster.find((c) => c.id === hero)!.gearSet).toBe('gale');
    await call('POST', `/roster/${hero}/auto-equip`);
    const worn = ctx.gear.equippedOn(profile.user.id, hero);
    expect(worn).toHaveLength(4);
    expect(worn.every((g) => g.set === 'gale')).toBe(true);

    // Back to "strongest".
    await call('PUT', `/roster/${hero}/gear-set`, { set: null });
    await call('POST', `/roster/${hero}/auto-equip`);
    expect(ctx.gear.equippedOn(profile.user.id, hero).every((g) => g.set === 'ruin')).toBe(true);
  });

  it('locked gear cannot be salvaged, singly or in bulk', async () => {
    const { call, profile } = await guest();
    const ctx = ctxOf();
    const ids = ['00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2'];
    for (const id of ids) {
      ctx.gear.insert(profile.user.id, makeGear({ id, rarity: 3 }), clock);
    }
    const lock = await call<GearActionResponse>('POST', `/gear/${ids[0]}/lock`, { locked: true });
    expect(lock.body.item!.locked).toBe(true);
    expect(lock.body.profile.gear.find((g) => g.id === ids[0])!.locked).toBe(true);
    expect((await call('POST', `/gear/${ids[0]}/salvage`)).status).toBe(409);

    const bulk = await call<{ salvaged: { count: number } }>('POST', '/gear/salvage-bulk', { maxRarity: 3 });
    expect(bulk.body.salvaged.count).toBe(1);
    expect(ctx.gear.list(profile.user.id).map((g) => g.id)).toEqual([ids[0]]);

    await call('POST', `/gear/${ids[0]}/lock`, { locked: false });
    expect((await call('POST', `/gear/${ids[0]}/salvage`)).status).toBe(200);
  });

  it('reforges gear randomly for stones and gold, and salvage pays stones', async () => {
    const BLADE = '00000000-0000-4000-8000-000000000001';
    const { call, profile } = await guest();
    const ctx = ctxOf();
    const r = createDefaultContent().settings.reforge;
    ctx.gear.insert(
      profile.user.id,
      makeGear({ id: BLADE, templateId: 'starforged-edge', rarity: 5, main: { stat: 'atk', value: 40 }, subs: [{ stat: 'hp', value: 100, rolls: 1 }] }),
      clock,
    );

    // Gold is checked first, then stones.
    expect((await call<{ error: string }>('POST', `/gear/${BLADE}/reforge`, { sub: 0 })).body).toMatchObject({ error: 'insufficient_funds' });
    app.services.admin.grant(profile.user.id, { gold: 100_000 });
    expect((await call<{ error: string }>('POST', `/gear/${BLADE}/reforge`, { sub: 0 })).body).toMatchObject({ error: 'insufficient_materials' });
    ctx.materials.add(profile.user.id, r.material, 20);

    let last = 'hp';
    let res!: { body: GearActionResponse };
    for (let i = 0; i < 5; i++) {
      res = await call<GearActionResponse>('POST', `/gear/${BLADE}/reforge`, { sub: 0 });
      const sub = res.body.item!.subs[0]!;
      // Always a different stat, never the main stat, and the roll count is kept.
      expect(sub.stat).not.toBe(last);
      expect(sub.stat).not.toBe('atk');
      expect(sub.rolls).toBe(1);
      last = sub.stat;
    }
    expect(res.body.profile.materials[r.material]).toBe(20 - 5 * r.stones);
    // There is no way to choose the result.
    expect((await call('POST', `/gear/${BLADE}/perfect`, { sub: 0, stat: 'atkPct' })).status).toBe(404);
    const perfect = res;

    // Salvaging a ★5 pays reforge stones.
    const before = perfect.body.profile.materials[r.material] ?? 0;
    const salvaged = await call<GearActionResponse>('POST', `/gear/${BLADE}/salvage`);
    expect(salvaged.body.profile.materials[r.material]).toBe(before + r.salvageStones.r5);
  });

  it('climbs the tower one floor at a time, paying each floor once, with a leaderboard', async () => {
    const { call, profile } = await guest();
    expect((await call<{ error: string }>('POST', '/tower/battles', { floor: 1 })).body).toMatchObject({ error: 'feature_locked' });
    const ctx = ctxOf();
    ctx.progress.recordClear(profile.user.id, '2-4', clock);
    for (const id of profile.team) ctx.roster.setLevel(profile.user.id, id, 30);
    expect((await call('POST', '/tower/battles', { floor: 2 })).status).toBe(400);

    const start = await call<StartBattleResponse>('POST', '/tower/battles', { floor: 1 });
    expect(start.body.mode).toBe('tower');
    const { actions, state } = autoBattle(start.body.setup);
    expect(state.outcome).toBe('victory');
    const done = await call<CompleteBattleResponse>('POST', `/battles/${start.body.battleId}/complete`, { actions });
    expect(done.body.tower).toEqual({ floor: 1, best: 1 });
    const t = createDefaultContent().settings.tower;
    expect(done.body.rewards).toEqual({ gems: t.floorGems, gold: t.floorGold + t.floorGoldPerFloor });

    // Floor 1 can't be farmed; floor 2 is next.
    expect((await call('POST', '/tower/battles', { floor: 1 })).status).toBe(400);
    const board = await call<{ best: number; myRank: number; leaders: { floor: number; me: boolean }[] }>('GET', '/tower');
    expect(board.body.best).toBe(1);
    expect(board.body.myRank).toBe(1);
    expect(board.body.leaders[0]).toMatchObject({ floor: 1, me: true });
  });

  it('brings the floor challenge into tower battles, with the whole team', async () => {
    const { call, profile } = await guest();
    const ctx = ctxOf();
    ctx.progress.recordClear(profile.user.id, '2-4', clock);
    for (const f of [1, 2]) ctx.progress.recordClear(profile.user.id, towerKey(f), clock);
    const challenge = towerFloor(ctx.content.current, 3).challenge;
    const start = await call<StartBattleResponse>('POST', '/tower/battles', { floor: 3 });
    expect(start.status).toBe(200);
    expect(start.body.setup.allies).toHaveLength(profile.team.length);
    if (challenge.mods.passive) for (const e of start.body.setup.enemies) expect(e.passive?.name).toContain(challenge.name);
  });
});
