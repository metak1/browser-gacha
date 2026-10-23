import type {
  ArenaLeaderboardEntryDTO,
  ArenaStatusDTO,
  BulkSalvageResponse,
  ClaimMissionResponse,
  CompleteBattleResponse,
  ContentBundle,
  GearActionResponse,
  GearItem,
  MissionDTO,
  GuildDTO,
  GuildSummaryDTO,
  ProfileDTO,
  PullHistoryEntryDTO,
  SocialDTO,
  SweepResponse,
  StartBattleResponse,
  TowerDTO,
  SummonResponse,
} from '@gacha/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppConfig } from '../config';
import { clearSessionCookie, requireUser, SESSION_COOKIE, setSessionCookie } from './session';

const credentials = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be at most 20 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username may only contain letters, numbers and underscores'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

const summonBody = z.object({ bannerId: z.string().max(40), count: z.union([z.literal(1), z.literal(10)]) });
// The real team-size limit comes from content settings; this only bounds the request.
const teamBody = z.object({ team: z.array(z.string().max(40)).max(10) });
const teamSlotParams = z.object({ slot: z.coerce.number().int().min(0).max(20) });
const teamNameBody = z.object({ name: z.string().max(40) });
const missionParams = z.object({ missionId: z.string().max(40) });
const levelUpBody = z.object({ count: z.number().int().min(1).max(100).default(1) });
const reforgeBody = z.object({ sub: z.number().int().min(0).max(3) });
const towerBody = z.object({ floor: z.number().int().min(1).max(100_000) });
const activityParams = z.object({ points: z.coerce.number().int().min(1).max(10_000) });
const skillUpBody = z.object({ slot: z.enum(['skill', 'ultimate']) });
const buyBody = z.object({ material: z.string().max(40), quantity: z.number().int().min(1).max(999) });
const gearParams = z.object({ gearId: z.string().uuid() });
const equipBody = z.object({ charId: z.string().max(40).nullable() });
const arenaStartBody = z.object({ opponentId: z.string().max(80) });
const charParams = z.object({ charId: z.string().max(40) });
const gearSetBody = z.object({ set: z.string().max(40).nullable() });
const lockBody = z.object({ locked: z.boolean() });
const prefsBody = z.object({ autoSalvage: z.union([z.literal(0), z.literal(3), z.literal(4)]).optional() });
const bulkSalvageBody = z.object({ maxRarity: z.union([z.literal(3), z.literal(4)]) });
const flagBody = z.object({ flag: z.string().regex(/^[a-z0-9-]{1,40}$/) });
const sweepBody = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('stage'), stageId: z.string().max(20), hard: z.boolean().optional(), count: z.number().int().min(1).max(100) }),
  z.object({ kind: z.literal('dungeon'), dungeonId: z.string().max(40), tier: z.number().int().min(0).max(10), count: z.number().int().min(1).max(100) }),
]);
const chestParams = z.object({ chapterId: z.coerce.number().int().min(1).max(999), stars: z.coerce.number().int().min(1).max(999) });
const startBattleBody = z.object({ stageId: z.string().max(20), hard: z.boolean().optional(), friendId: z.string().uuid().optional() });
const friendBody = z.object({ friendId: z.string().uuid().optional() });
const eventStageParams = z.object({ eventId: z.string().max(40), stage: z.coerce.number().int().min(0).max(20) });
const eventBuyParams = z.object({ eventId: z.string().max(40), itemId: z.string().max(40) });
const buyCountBody = z.object({ count: z.number().int().min(1).max(100) });
const userParams = z.object({ userId: z.string().uuid() });
const codeBody = z.object({ code: z.string().trim().min(4).max(20) });
const titleBody = z.object({ title: z.string().max(60).nullable() });
const supportBody = z.object({ charId: z.string().max(40) });
const guildCreateBody = z.object({
  name: z.string().trim().min(3, 'Guild names need at least 3 characters').max(24).regex(/^[\p{L}\p{N} _'-]+$/u, "Letters, numbers, spaces and _ - ' only"),
  description: z.string().trim().max(200).default(''),
});
const guildUpdateBody = z.object({ description: z.string().trim().max(200), open: z.boolean() });
const guildParams = z.object({ guildId: z.string().uuid() });
const guildQuery = z.object({ q: z.string().max(40).default('') });
const percentParams = z.object({ percent: z.coerce.number().int().min(1).max(100) });
const dungeonParams = z.object({ dungeonId: z.string().max(40) });
const dungeonBody = z.object({ tier: z.number().int().min(0).max(10) });
const battleParams = z.object({ battleId: z.string().uuid() });
const completeBattleBody = z.object({
  actions: z
    .array(z.object({ kind: z.enum(['basic', 'skill', 'ultimate']), target: z.string().max(8).optional() }))
    .max(1000),
});

/** Strict limits on credential endpoints to slow down password guessing. */
const authRateLimit = { rateLimit: { max: 10, timeWindow: '1 minute' } };

export async function apiRoutes(app: FastifyInstance, opts: { config: AppConfig }) {
  const { auth, player, gacha, battle, missions, content, gear, arena, progression, social, guild, events } = app.services;
  const secure = opts.config.cookieSecure;

  // ---------- auth ----------

  app.post('/auth/guest', async (request, reply): Promise<ProfileDTO> => {
    if (request.userId) return player.profile(request.userId);
    const { userId, token } = auth.createGuest();
    setSessionCookie(reply, token, secure);
    return player.profile(userId);
  });

  app.post('/auth/link', { config: authRateLimit }, async (request): Promise<ProfileDTO> => {
    const userId = requireUser(request);
    const { username, password } = credentials.parse(request.body);
    await auth.linkAccount(userId, username, password);
    return player.profile(userId);
  });

  app.post('/auth/login', { config: authRateLimit }, async (request, reply): Promise<ProfileDTO> => {
    const { username, password } = credentials.parse(request.body);
    const { userId, token } = await auth.login(username, password);
    const previous = request.cookies[SESSION_COOKIE];
    if (previous) auth.logout(previous);
    setSessionCookie(reply, token, secure);
    return player.profile(userId);
  });

  /** Starts the player over from scratch. Other devices are signed out. */
  app.post('/auth/reset', { config: authRateLimit }, async (request, reply): Promise<ProfileDTO> => {
    const userId = requireUser(request);
    setSessionCookie(reply, auth.resetAccount(userId), secure);
    return player.profile(userId);
  });

  app.post('/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) auth.logout(token);
    clearSessionCookie(reply);
    return { ok: true };
  });

  // ---------- content ----------

  /** All game content. The client builds its UI from this. */
  app.get('/content', async (request, reply): Promise<ContentBundle> => {
    const bundle = content.bundle();
    const etag = `"content-${bundle.version}"`;
    reply.header('etag', etag).header('cache-control', 'no-cache');
    if (request.headers['if-none-match'] === etag) return reply.status(304).send();
    return bundle;
  });

  // ---------- missions ----------

  app.get('/missions', async (request): Promise<MissionDTO[]> => missions.list(requireUser(request)));

  app.post('/missions/:missionId/claim', async (request): Promise<ClaimMissionResponse> => {
    const userId = requireUser(request);
    missions.claim(userId, missionParams.parse(request.params).missionId);
    return { missions: missions.list(userId), profile: player.profile(userId) };
  });

  app.post('/activity/:points/claim', async (request): Promise<ProfileDTO> => {
    const userId = requireUser(request);
    missions.claimChest(userId, activityParams.parse(request.params).points);
    return player.profile(userId);
  });

  // ---------- player ----------

  app.get('/me', async (request): Promise<ProfileDTO> => player.profile(requireUser(request)));

  app.post('/daily', async (request): Promise<ProfileDTO> => {
    const userId = requireUser(request);
    player.claimDaily(userId);
    return player.profile(userId);
  });

  app.post('/teams/:slot/activate', async (request): Promise<ProfileDTO> => {
    const userId = requireUser(request);
    player.activateTeam(userId, teamSlotParams.parse(request.params).slot);
    return player.profile(userId);
  });

  app.put('/teams/:slot', async (request): Promise<ProfileDTO> => {
    const userId = requireUser(request);
    player.renameTeam(userId, teamSlotParams.parse(request.params).slot, teamNameBody.parse(request.body).name);
    return player.profile(userId);
  });

  app.put('/team', async (request): Promise<ProfileDTO> => {
    const userId = requireUser(request);
    player.setTeam(userId, teamBody.parse(request.body).team);
    return player.profile(userId);
  });

  app.post('/roster/:charId/level-up', async (request): Promise<ProfileDTO> => {
    const userId = requireUser(request);
    player.levelUp(userId, charParams.parse(request.params).charId, levelUpBody.parse(request.body ?? {}).count);
    return player.profile(userId);
  });

  app.put('/roster/:charId/gear-set', async (request): Promise<ProfileDTO> => {
    const userId = requireUser(request);
    gear.setTargetSet(userId, charParams.parse(request.params).charId, gearSetBody.parse(request.body).set);
    return player.profile(userId);
  });

  app.post('/roster/:charId/auto-equip', async (request): Promise<ProfileDTO> => {
    const userId = requireUser(request);
    gear.autoEquip(userId, charParams.parse(request.params).charId);
    return player.profile(userId);
  });

  // ---------- account ----------

  app.put('/me/title', async (request): Promise<ProfileDTO> => {
    const userId = requireUser(request);
    player.setTitle(userId, titleBody.parse(request.body).title);
    return player.profile(userId);
  });

  app.put('/me/support', async (request): Promise<ProfileDTO> => {
    const userId = requireUser(request);
    social.setSupport(userId, supportBody.parse(request.body).charId);
    return player.profile(userId);
  });

  // ---------- events ----------

  app.post('/events/:eventId/stages/:stage/battles', async (request): Promise<StartBattleResponse> => {
    const userId = requireUser(request);
    const { eventId, stage } = eventStageParams.parse(request.params);
    const { battleId, setup } = battle.startEvent(userId, eventId, stage, friendBody.parse(request.body ?? {}).friendId);
    return { battleId, mode: 'event', stageId: null, setup };
  });

  app.post('/events/:eventId/shop/:itemId/buy', async (request): Promise<ProfileDTO> => {
    const userId = requireUser(request);
    const { eventId, itemId } = eventBuyParams.parse(request.params);
    events.buy(userId, eventId, itemId, buyCountBody.parse(request.body).count);
    return player.profile(userId);
  });

  // ---------- friends ----------

  app.get('/social', async (request): Promise<SocialDTO> => social.list(requireUser(request)));

  app.post('/social/requests', async (request): Promise<SocialDTO> => {
    const userId = requireUser(request);
    social.request(userId, codeBody.parse(request.body).code);
    return social.list(userId);
  });

  app.post('/social/requests/:userId/accept', async (request): Promise<SocialDTO> => {
    const userId = requireUser(request);
    social.accept(userId, userParams.parse(request.params).userId);
    return social.list(userId);
  });

  app.delete('/social/:userId', async (request): Promise<SocialDTO> => {
    const userId = requireUser(request);
    social.remove(userId, userParams.parse(request.params).userId);
    return social.list(userId);
  });

  // ---------- guilds ----------

  app.get('/guilds', async (request): Promise<GuildSummaryDTO[]> => {
    requireUser(request);
    return guild.list(guildQuery.parse(request.query).q);
  });

  app.get('/guild', async (request): Promise<GuildDTO | null> => guild.get(requireUser(request)));

  app.post('/guilds', async (request): Promise<GuildDTO | null> => {
    const userId = requireUser(request);
    const { name, description } = guildCreateBody.parse(request.body);
    guild.create(userId, name, description);
    return guild.get(userId);
  });

  app.post('/guilds/:guildId/join', async (request): Promise<GuildDTO | null> => {
    const userId = requireUser(request);
    guild.join(userId, guildParams.parse(request.params).guildId);
    return guild.get(userId);
  });

  app.post('/guild/leave', async (request): Promise<{ ok: true }> => {
    guild.leave(requireUser(request));
    return { ok: true };
  });

  app.put('/guild', async (request): Promise<GuildDTO | null> => {
    const userId = requireUser(request);
    guild.update(userId, guildUpdateBody.parse(request.body));
    return guild.get(userId);
  });

  app.post('/guild/chests/:percent/claim', async (request): Promise<{ guild: GuildDTO | null; profile: ProfileDTO }> => {
    const userId = requireUser(request);
    guild.claimChest(userId, percentParams.parse(request.params).percent);
    return { guild: guild.get(userId), profile: player.profile(userId) };
  });

  app.post('/guild/battles', async (request): Promise<StartBattleResponse> => {
    const userId = requireUser(request);
    const { battleId, setup } = battle.startGuild(userId);
    return { battleId, mode: 'guild', stageId: null, setup };
  });

  app.put('/me/prefs', async (request): Promise<ProfileDTO> => {
    const userId = requireUser(request);
    player.setPrefs(userId, prefsBody.parse(request.body));
    return player.profile(userId);
  });

  app.post('/gear/salvage-bulk', async (request): Promise<BulkSalvageResponse> => {
    const userId = requireUser(request);
    const salvaged = gear.salvageBulk(userId, bulkSalvageBody.parse(request.body).maxRarity);
    return { salvaged, profile: player.profile(userId) };
  });

  app.post('/me/flags', async (request): Promise<ProfileDTO> => {
    const userId = requireUser(request);
    player.addFlag(userId, flagBody.parse(request.body).flag);
    return player.profile(userId);
  });

  app.post('/stamina/refill', async (request): Promise<ProfileDTO> => {
    const userId = requireUser(request);
    player.refillStamina(userId);
    return player.profile(userId);
  });

  app.post('/sweep', async (request): Promise<SweepResponse> => {
    const userId = requireUser(request);
    const result = battle.sweep(userId, sweepBody.parse(request.body));
    return { ...result, profile: player.profile(userId) };
  });

  app.post('/chapters/:chapterId/chests/:stars/claim', async (request): Promise<ProfileDTO> => {
    const userId = requireUser(request);
    const { chapterId, stars } = chestParams.parse(request.params);
    player.claimChest(userId, chapterId, stars);
    return player.profile(userId);
  });

  app.post('/roster/:charId/ascend', async (request): Promise<ProfileDTO> => {
    const userId = requireUser(request);
    progression.ascend(userId, charParams.parse(request.params).charId);
    return player.profile(userId);
  });

  app.post('/roster/:charId/skill-up', async (request): Promise<ProfileDTO> => {
    const userId = requireUser(request);
    progression.skillUp(userId, charParams.parse(request.params).charId, skillUpBody.parse(request.body).slot);
    return player.profile(userId);
  });

  app.post('/shop/buy', async (request): Promise<ProfileDTO> => {
    const userId = requireUser(request);
    const { material, quantity } = buyBody.parse(request.body);
    progression.buy(userId, material, quantity);
    return player.profile(userId);
  });

  // ---------- gacha ----------

  app.post('/gacha/summon', async (request): Promise<SummonResponse> => {
    const userId = requireUser(request);
    const { bannerId, count } = summonBody.parse(request.body);
    const results = gacha.summon(userId, bannerId, count);
    return { results, profile: player.profile(userId) };
  });

  app.post('/gacha/exchange', async (request): Promise<ProfileDTO> => {
    const userId = requireUser(request);
    gacha.exchangeStardust(userId);
    return player.profile(userId);
  });

  app.get('/gacha/history', async (request): Promise<PullHistoryEntryDTO[]> => gacha.history(requireUser(request)));

  // ---------- battles ----------

  app.post('/battles', async (request): Promise<StartBattleResponse> => {
    const userId = requireUser(request);
    const { stageId, hard, friendId } = startBattleBody.parse(request.body);
    const { battleId, setup } = battle.start(userId, stageId, hard, friendId);
    return { battleId, mode: 'campaign', stageId, setup };
  });

  app.get('/tower', async (request): Promise<TowerDTO> => battle.towerBoard(requireUser(request)));

  app.post('/tower/battles', async (request): Promise<StartBattleResponse> => {
    const userId = requireUser(request);
    const { battleId, setup } = battle.startTower(userId, towerBody.parse(request.body).floor);
    return { battleId, mode: 'tower', stageId: null, setup };
  });

  app.post('/dungeons/:dungeonId/battles', async (request): Promise<StartBattleResponse> => {
    const userId = requireUser(request);
    const { dungeonId } = dungeonParams.parse(request.params);
    const body = dungeonBody.parse(request.body);
    const { battleId, setup } = battle.startDungeon(userId, dungeonId, body.tier);
    return { battleId, mode: 'dungeon', stageId: null, setup };
  });

  // ---------- gear ----------

  app.get('/gear', async (request): Promise<GearItem[]> => gear.list(requireUser(request)));

  app.post('/gear/:gearId/equip', async (request): Promise<GearActionResponse> => {
    const userId = requireUser(request);
    const { gearId } = gearParams.parse(request.params);
    gear.equip(userId, gearId, equipBody.parse(request.body).charId);
    return { item: app.services.gear.list(userId).find((g) => g.id === gearId) ?? null, profile: player.profile(userId) };
  });

  app.post('/gear/:gearId/reforge', async (request): Promise<GearActionResponse> => {
    const userId = requireUser(request);
    const item = gear.reforge(userId, gearParams.parse(request.params).gearId, reforgeBody.parse(request.body).sub);
    return { item, profile: player.profile(userId) };
  });

  app.post('/gear/:gearId/upgrade', async (request): Promise<GearActionResponse> => {
    const userId = requireUser(request);
    const item = gear.upgrade(userId, gearParams.parse(request.params).gearId);
    return { item, profile: player.profile(userId) };
  });

  app.post('/gear/:gearId/lock', async (request): Promise<GearActionResponse> => {
    const userId = requireUser(request);
    const item = gear.setLocked(userId, gearParams.parse(request.params).gearId, lockBody.parse(request.body).locked);
    return { item, profile: player.profile(userId) };
  });

  app.post('/gear/:gearId/salvage', async (request): Promise<GearActionResponse> => {
    const userId = requireUser(request);
    gear.salvage(userId, gearParams.parse(request.params).gearId);
    return { item: null, profile: player.profile(userId) };
  });

  // ---------- arena ----------

  app.get('/arena', async (request): Promise<ArenaStatusDTO> => arena.status(requireUser(request)));

  app.post('/arena/refresh', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request): Promise<ArenaStatusDTO> =>
    arena.refresh(requireUser(request)),
  );

  app.put('/arena/defense', async (request): Promise<ArenaStatusDTO> =>
    arena.setDefense(requireUser(request), teamBody.parse(request.body).team),
  );

  app.get('/arena/leaderboard', async (request): Promise<ArenaLeaderboardEntryDTO[]> => arena.leaderboard(requireUser(request)));

  app.post('/arena/battles', async (request): Promise<StartBattleResponse> => {
    const userId = requireUser(request);
    const { battleId, setup } = battle.startArena(userId, arenaStartBody.parse(request.body).opponentId);
    return { battleId, mode: 'arena', stageId: null, setup };
  });

  app.post('/battles/:battleId/complete', async (request): Promise<CompleteBattleResponse> => {
    const userId = requireUser(request);
    const { battleId } = battleParams.parse(request.params);
    const { actions } = completeBattleBody.parse(request.body);
    const result = battle.complete(userId, battleId, actions);
    return { ...result, profile: player.profile(userId) };
  });
}
