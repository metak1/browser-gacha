import { autoBattle, REFERENCE_TEAM, type CompleteBattleResponse, type GearItem, type ProfileDTO, type StartBattleResponse } from '@gacha/shared';
import { buildApp, type BuildOptions } from './app';
import type { AppConfig } from './config';
import type { ServiceContext } from './services/context';

/** Config for an in-memory test app. */
export const TEST_CONFIG: AppConfig = { dbPath: ':memory:', cookieSecure: false, clientDist: null, logger: false, rateLimit: false };

/**
 * Builds the app for tests, with new players starting on the reference team
 * so tests can battle without summoning first. (By default they start with no heroes.)
 */
export async function buildTestApp(config: AppConfig, options: BuildOptions = {}) {
  const app = await buildApp(config, options);
  const { content } = app.services;
  content.saveSettings({ ...content.bundle().settings, starterCharacters: REFERENCE_TEAM });
  return app;
}

export type TestApp = Awaited<ReturnType<typeof buildTestApp>>;
export type Client = <T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) => Promise<{ status: number; body: T }>;

/** A cookie-carrying API client, like one browser. */
export function client(app: TestApp): Client {
  let sid: string | undefined;
  return async <T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) => {
    const res = await app.inject({ method, url: `/api${url}`, payload, cookies: sid ? { sid } : {} });
    const cookie = res.cookies.find((c) => c.name === 'sid');
    if (cookie) sid = cookie.value || undefined;
    return { status: res.statusCode, body: (res.body ? res.json() : null) as T };
  };
}

/** The services' shared context, for setting up state directly (levels, clears, gear...). */
export const serviceContext = (app: TestApp) => (app.services.player as unknown as { ctx: ServiceContext }).ctx;

/**
 * Signs up a guest. `strong` puts their team at level 60 and full ascension; `cleared` marks
 * campaign stages cleared (at time `at`), which also opens features like the arena and dungeons.
 */
export async function newGuest(app: TestApp, options: { strong?: boolean; cleared?: string[]; at?: number } = {}) {
  const call = client(app);
  const { body: profile } = await call<ProfileDTO>('POST', '/auth/guest');
  const ctx = serviceContext(app);
  if (options.strong) {
    for (const id of profile.team) ctx.db.run('UPDATE characters SET level = 60, ascension = 4 WHERE user_id = ? AND char_id = ?', profile.user.id, id);
  }
  for (const id of options.cleared ?? []) ctx.progress.recordClear(profile.user.id, id, options.at ?? Date.now());
  return { call, profile, ctx, id: profile.user.id };
}

/** Auto-plays a started battle and completes it; throws if either request failed. */
export async function autoPlay(call: Client, start: { status: number; body: StartBattleResponse }) {
  if (start.status !== 200) throw new Error(`battle didn't start: ${start.status} ${JSON.stringify(start.body)}`);
  const { actions, state } = autoBattle(start.body.setup);
  const done = await call<CompleteBattleResponse>('POST', `/battles/${start.body.battleId}/complete`, { actions });
  if (done.status !== 200) throw new Error(`battle didn't complete: ${done.status} ${JSON.stringify(done.body)}`);
  return { state, result: done.body };
}

/** A ★4 weapon with only a flat ATK main stat; override any field. */
export function makeGear(overrides: Partial<GearItem> & Pick<GearItem, 'id'>): GearItem {
  const atk = overrides.main?.value ?? 10;
  return {
    templateId: 'runed-saber',
    slot: 'weapon',
    rarity: 4,
    level: 0,
    mainBase: atk,
    main: { stat: 'atk', value: atk },
    subs: [],
    equippedTo: null,
    set: null,
    locked: false,
    ...overrides,
  };
}
