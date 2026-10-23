import type { BulkSalvageResponse, GuildDTO, GuildSummaryDTO, PlayerPrefs, SocialDTO, SweepRequest, SweepResponse } from '@gacha/shared';
import type {
  AdminGrantRequest,
  AdminPlayerDTO,
  ApiErrorBody,
  ArenaLeaderboardEntryDTO,
  ArenaStatusDTO,
  BattleAction,
  ClaimMissionResponse,
  CompleteBattleResponse,
  ContentBundle,
  ContentDocs,
  ContentKind,
  GameSettings,
  GearActionResponse,
  MissionDTO,
  ProfileDTO,
  PullHistoryEntryDTO,
  StartBattleResponse,
  TowerDTO,
  SimulateRequest,
  SimulateResponse,
  SummonResponse,
  UserRole,
} from '@gacha/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const err = data as Partial<ApiErrorBody> | null;
    throw new ApiError(res.status, err?.error ?? 'error', err?.message ?? res.statusText);
  }
  return data as T;
}

const enc = encodeURIComponent;

export const api = {
  content: () => request<ContentBundle>('GET', '/content'),
  me: () => request<ProfileDTO>('GET', '/me'),
  guest: () => request<ProfileDTO>('POST', '/auth/guest'),
  link: (username: string, password: string) => request<ProfileDTO>('POST', '/auth/link', { username, password }),
  login: (username: string, password: string) => request<ProfileDTO>('POST', '/auth/login', { username, password }),
  logout: () => request<{ ok: true }>('POST', '/auth/logout'),
  resetAccount: () => request<ProfileDTO>('POST', '/auth/reset'),

  claimDaily: () => request<ProfileDTO>('POST', '/daily'),
  setTeam: (team: string[]) => request<ProfileDTO>('PUT', '/team', { team }),
  activateTeam: (slot: number) => request<ProfileDTO>('POST', `/teams/${slot}/activate`),
  renameTeam: (slot: number, name: string) => request<ProfileDTO>('PUT', `/teams/${slot}`, { name }),
  levelUp: (charId: string, count = 1) => request<ProfileDTO>('POST', `/roster/${encodeURIComponent(charId)}/level-up`, { count }),
  autoEquip: (charId: string) => request<ProfileDTO>('POST', `/roster/${encodeURIComponent(charId)}/auto-equip`),
  setGearSet: (charId: string, set: string | null) => request<ProfileDTO>('PUT', `/roster/${encodeURIComponent(charId)}/gear-set`, { set }),
  tower: () => request<TowerDTO>('GET', '/tower'),
  startTower: (floor: number) => request<StartBattleResponse>('POST', '/tower/battles', { floor }),
  ascend: (charId: string) => request<ProfileDTO>('POST', `/roster/${encodeURIComponent(charId)}/ascend`),
  skillUp: (charId: string, slot: 'skill' | 'ultimate') =>
    request<ProfileDTO>('POST', `/roster/${encodeURIComponent(charId)}/skill-up`, { slot }),
  buy: (material: string, quantity: number) => request<ProfileDTO>('POST', '/shop/buy', { material, quantity }),

  summon: (bannerId: string, count: 1 | 10) => request<SummonResponse>('POST', '/gacha/summon', { bannerId, count }),
  exchange: () => request<ProfileDTO>('POST', '/gacha/exchange'),
  history: () => request<PullHistoryEntryDTO[]>('GET', '/gacha/history'),

  startBattle: (stageId: string, hard = false, friendId?: string) =>
    request<StartBattleResponse>('POST', '/battles', { stageId, ...(hard ? { hard } : {}), ...(friendId ? { friendId } : {}) }),
  startEvent: (eventId: string, stage: number, friendId?: string) =>
    request<StartBattleResponse>('POST', `/events/${enc(eventId)}/stages/${stage}/battles`, friendId ? { friendId } : {}),
  buyEvent: (eventId: string, itemId: string, count: number) =>
    request<ProfileDTO>('POST', `/events/${enc(eventId)}/shop/${enc(itemId)}/buy`, { count }),
  setTitle: (title: string | null) => request<ProfileDTO>('PUT', '/me/title', { title }),
  setSupport: (charId: string) => request<ProfileDTO>('PUT', '/me/support', { charId }),
  social: {
    get: () => request<SocialDTO>('GET', '/social'),
    add: (code: string) => request<SocialDTO>('POST', '/social/requests', { code }),
    accept: (userId: string) => request<SocialDTO>('POST', `/social/requests/${enc(userId)}/accept`),
    remove: (userId: string) => request<SocialDTO>('DELETE', `/social/${enc(userId)}`),
  },
  guild: {
    get: () => request<GuildDTO | null>('GET', '/guild'),
    search: (q: string) => request<GuildSummaryDTO[]>('GET', `/guilds?q=${enc(q)}`),
    create: (name: string, description: string) => request<GuildDTO | null>('POST', '/guilds', { name, description }),
    join: (id: string) => request<GuildDTO | null>('POST', `/guilds/${enc(id)}/join`),
    leave: () => request<{ ok: true }>('POST', '/guild/leave'),
    update: (description: string, open: boolean) => request<GuildDTO | null>('PUT', '/guild', { description, open }),
    claim: (percent: number) => request<{ guild: GuildDTO | null; profile: ProfileDTO }>('POST', `/guild/chests/${percent}/claim`),
    attack: () => request<StartBattleResponse>('POST', '/guild/battles'),
  },
  startDungeon: (dungeonId: string, tier: number) => request<StartBattleResponse>('POST', `/dungeons/${encodeURIComponent(dungeonId)}/battles`, { tier }),
  completeBattle: (battleId: string, actions: BattleAction[]) =>
    request<CompleteBattleResponse>('POST', `/battles/${battleId}/complete`, { actions }),

  gear: {
    equip: (id: string, charId: string | null) => request<GearActionResponse>('POST', `/gear/${enc(id)}/equip`, { charId }),
    upgrade: (id: string) => request<GearActionResponse>('POST', `/gear/${enc(id)}/upgrade`),
    salvage: (id: string) => request<GearActionResponse>('POST', `/gear/${enc(id)}/salvage`),
    lock: (id: string, locked: boolean) => request<GearActionResponse>('POST', `/gear/${enc(id)}/lock`, { locked }),
    reforge: (id: string, sub: number) => request<GearActionResponse>('POST', `/gear/${enc(id)}/reforge`, { sub }),
  },

  arena: {
    status: () => request<ArenaStatusDTO>('GET', '/arena'),
    refresh: () => request<ArenaStatusDTO>('POST', '/arena/refresh'),
    setDefense: (team: string[]) => request<ArenaStatusDTO>('PUT', '/arena/defense', { team }),
    leaderboard: () => request<ArenaLeaderboardEntryDTO[]>('GET', '/arena/leaderboard'),
    start: (opponentId: string) => request<StartBattleResponse>('POST', '/arena/battles', { opponentId }),
  },

  missions: () => request<MissionDTO[]>('GET', '/missions'),
  setPrefs: (prefs: Partial<PlayerPrefs>) => request<ProfileDTO>('PUT', '/me/prefs', prefs),
  salvageBulk: (maxRarity: 3 | 4) => request<BulkSalvageResponse>('POST', '/gear/salvage-bulk', { maxRarity }),
  refillStamina: () => request<ProfileDTO>('POST', '/stamina/refill'),
  addFlag: (flag: string) => request<ProfileDTO>('POST', '/me/flags', { flag }),
  sweep: (req: SweepRequest) => request<SweepResponse>('POST', '/sweep', req),
  claimChest: (chapterId: number, stars: number) => request<ProfileDTO>('POST', `/chapters/${chapterId}/chests/${stars}/claim`),
  claimMission: (id: string) => request<ClaimMissionResponse>('POST', `/missions/${enc(id)}/claim`),
  claimActivity: (points: number) => request<ProfileDTO>('POST', `/activity/${points}/claim`),

  admin: {
    save: <K extends ContentKind>(kind: K, doc: ContentDocs[K]) =>
      request<ContentBundle>('PUT', `/admin/content/${kind}/${enc(String(doc.id))}`, doc),
    remove: (kind: ContentKind, id: string | number) =>
      request<ContentBundle>('DELETE', `/admin/content/${kind}/${enc(String(id))}`),
    saveSettings: (settings: GameSettings) => request<ContentBundle>('PUT', '/admin/content/settings', settings),
    importBundle: (bundle: unknown) => request<ContentBundle>('POST', '/admin/content/import', bundle),
    reset: () => request<ContentBundle>('POST', '/admin/content/reset'),
    players: (q: string) => request<AdminPlayerDTO[]>('GET', `/admin/players?q=${enc(q)}`),
    grant: (id: string, body: AdminGrantRequest) => request<AdminPlayerDTO>('POST', `/admin/players/${enc(id)}/grant`, body),
    setRole: (id: string, role: UserRole) => request<AdminPlayerDTO>('PUT', `/admin/players/${enc(id)}/role`, { role }),
    simulate: (body: SimulateRequest) => request<SimulateResponse>('POST', '/admin/simulate', body),
  },
};

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong');
