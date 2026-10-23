import type { Database } from '../db/database';
import { AdminService } from './admin';
import { ArenaService } from './arena';
import { AuthService } from './auth';
import { BattleService } from './battle';
import type { ContentService } from './content';
import { createContext, type ContextOverrides } from './context';
import { GachaService } from './gacha';
import { GearService } from './gear';
import { MissionService } from './missions';
import { PlayerService } from './player';
import { EventService } from './events';
import { GuildService } from './guild';
import { ProgressionService } from './progression';
import { SocialService } from './social';

export interface Services {
  auth: AuthService;
  player: PlayerService;
  gacha: GachaService;
  battle: BattleService;
  missions: MissionService;
  gear: GearService;
  arena: ArenaService;
  progression: ProgressionService;
  content: ContentService;
  admin: AdminService;
  social: SocialService;
  guild: GuildService;
  events: EventService;
}

export function createServices(db: Database, overrides?: ContextOverrides): Services {
  const ctx = createContext(db, overrides);
  const missions = new MissionService(ctx);
  const gear = new GearService(ctx, missions);
  const arena = new ArenaService(ctx, gear, missions);
  const progression = new ProgressionService(ctx, missions);
  const social = new SocialService(ctx, gear);
  const guild = new GuildService(ctx, gear, missions);
  const events = new EventService(ctx);
  return {
    auth: new AuthService(ctx),
    player: new PlayerService(ctx, missions, social),
    gacha: new GachaService(ctx, missions),
    battle: new BattleService(ctx, missions, gear, arena, progression, social, guild, events),
    social,
    guild,
    events,
    progression,
    missions,
    gear,
    arena,
    content: ctx.content,
    admin: new AdminService(ctx),
  };
}
