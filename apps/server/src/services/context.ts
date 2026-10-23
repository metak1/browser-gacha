import { randomInt } from 'node:crypto';
import type { Database } from '../db/database';
import { ArenaRepo } from '../repos/arena';
import { ContentRepo } from '../repos/content';
import { DungeonRepo } from '../repos/dungeons';
import { EventRepo } from '../repos/events';
import { GuildRepo } from '../repos/guilds';
import { SocialRepo } from '../repos/social';
import { GachaRepo } from '../repos/gacha';
import { GearRepo } from '../repos/gear';
import { MaterialRepo } from '../repos/materials';
import { MissionRepo } from '../repos/missions';
import { ProgressRepo } from '../repos/progress';
import { RosterRepo } from '../repos/roster';
import { SessionRepo } from '../repos/sessions';
import { UserRepo } from '../repos/users';
import { ContentService } from './content';

/** Shared dependencies for services. Clock and RNG are injectable for tests. */
export interface ServiceContext {
  db: Database;
  users: UserRepo;
  sessions: SessionRepo;
  roster: RosterRepo;
  gacha: GachaRepo;
  progress: ProgressRepo;
  missions: MissionRepo;
  gear: GearRepo;
  arena: ArenaRepo;
  materials: MaterialRepo;
  dungeons: DungeonRepo;
  social: SocialRepo;
  guilds: GuildRepo;
  events: EventRepo;
  /** Live game content (units, spells, stages, settings...). */
  content: ContentService;
  now: () => number;
  random: () => number;
}

export const cryptoRandom = () => randomInt(0, 2 ** 32) / 2 ** 32;

export type ContextOverrides = Partial<Pick<ServiceContext, 'now' | 'random'>>;

export function createContext(db: Database, overrides: ContextOverrides = {}): ServiceContext {
  const now = overrides.now ?? Date.now;
  return {
    db,
    users: new UserRepo(db),
    sessions: new SessionRepo(db),
    roster: new RosterRepo(db),
    gacha: new GachaRepo(db),
    progress: new ProgressRepo(db),
    missions: new MissionRepo(db),
    gear: new GearRepo(db),
    arena: new ArenaRepo(db),
    materials: new MaterialRepo(db),
    dungeons: new DungeonRepo(db),
    social: new SocialRepo(db),
    guilds: new GuildRepo(db),
    events: new EventRepo(db),
    content: new ContentService(db, new ContentRepo(db), now),
    now,
    random: overrides.random ?? cryptoRandom,
  };
}
