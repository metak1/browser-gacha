import { DERIVED_MISSION_KINDS, type MissionDef, type MissionDTO, type MissionKind } from '@gacha/shared';
import { badRequest, conflict, notFound } from '../errors';
import type { ServiceContext } from './context';
import { grantReward } from './rewards';

export const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Daily chest claims share the mission progress table under this id prefix. */
const CHEST_PREFIX = 'activity-chest:';

type CounterKind = Exclude<MissionKind, 'collect' | 'clearStage' | 'hardClears'>;

/**
 * Missions are defined in content. Counter missions (win battles, summon, ...)
 * are fed by record() from the services where those things happen; derived
 * missions (collect, clearStage) are computed from the player's state.
 * Daily missions keep their progress per UTC day.
 */
export class MissionService {
  constructor(private readonly ctx: ServiceContext) {}

  /** Call inside the transaction that performs the action. */
  record(userId: string, kind: CounterKind, amount = 1) {
    const day = utcDay(this.ctx.now());
    for (const m of this.ctx.content.current.bundle.missions) {
      if (m.active && m.kind === kind) this.ctx.missions.increment(userId, m.id, this.period(m, day), amount);
    }
  }

  list(userId: string): MissionDTO[] {
    const { content, missions, roster, progress } = this.ctx;
    const day = utcDay(this.ctx.now());
    const rows = new Map(missions.forUser(userId).map((r) => [`${r.missionId}|${r.period}`, r]));
    const known = content.current.charactersById;
    const collected = roster.list(userId).filter((c) => known[c.id]).length;
    const cleared = new Set(progress.clearedStages(userId));
    const hardCleared = [...cleared].filter((id) => id.startsWith('hard:')).length;

    return content.current.bundle.missions
      .filter((m) => m.active)
      .map((m) => {
        const row = rows.get(`${m.id}|${this.period(m, day)}`);
        let value = row?.progress ?? 0;
        if (m.kind === 'collect') value = collected;
        if (m.kind === 'clearStage') value = m.target && cleared.has(m.target) ? 1 : 0;
        if (m.kind === 'hardClears') value = hardCleared;
        const done = Math.min(value, m.count);
        return {
          id: m.id,
          name: m.name,
          description: m.description,
          kind: m.kind,
          repeat: m.repeat,
          count: m.count,
          progress: done,
          complete: done >= m.count,
          claimed: row?.claimed ?? false,
          reward: m.reward,
          points: m.repeat === 'daily' ? m.points : 0,
        };
      });
  }

  /** Missions and daily chests ready to claim. */
  readyCount(userId: string): number {
    const missions = this.list(userId);
    const { points, claimed } = this.activityFrom(userId, missions);
    const chests = this.ctx.content.current.settings.activityChests.filter((c) => points >= c.points && !claimed.includes(c.points));
    return missions.filter((m) => m.complete && !m.claimed).length + chests.length;
  }

  /** Today's activity points (from claimed daily missions) and the chests already opened today. */
  activity(userId: string) {
    return this.activityFrom(userId, this.list(userId));
  }

  private activityFrom(userId: string, missions: MissionDTO[]) {
    const points = missions.reduce((n, m) => (m.repeat === 'daily' && m.claimed ? n + m.points : n), 0);
    const day = utcDay(this.ctx.now());
    const opened = new Set(
      this.ctx.missions
        .forUser(userId)
        .filter((r) => r.period === day && r.claimed && r.missionId.startsWith(CHEST_PREFIX))
        .map((r) => r.missionId),
    );
    const claimed = this.ctx.content.current.settings.activityChests.map((c) => c.points).filter((p) => opened.has(CHEST_PREFIX + p));
    return { points, claimed };
  }

  /** Opens today's chest at a points threshold. */
  claimChest(userId: string, threshold: number) {
    const { db, content, missions } = this.ctx;
    const chest = content.current.settings.activityChests.find((c) => c.points === threshold);
    if (!chest) throw notFound('No chest at that many points');
    db.transaction(() => {
      if (this.activity(userId).points < chest.points) throw badRequest('not_enough_points', `Reach ${chest.points} activity points first`);
      // Stored like a daily mission, so it resets each UTC day.
      if (!missions.markClaimed(userId, CHEST_PREFIX + chest.points, utcDay(this.ctx.now()))) {
        throw conflict('already_claimed', 'Chest already opened today');
      }
      grantReward(this.ctx, userId, chest.reward);
    });
  }

  claim(userId: string, missionId: string) {
    const { db, content, missions } = this.ctx;
    const def = content.current.missionsById[missionId];
    if (!def || !def.active) throw notFound('Mission not found');
    db.transaction(() => {
      const state = this.list(userId).find((m) => m.id === missionId)!;
      if (!state.complete) throw badRequest('mission_incomplete', 'This mission is not complete yet');
      if (!missions.markClaimed(userId, missionId, this.period(def, utcDay(this.ctx.now())))) {
        throw conflict('already_claimed', 'Reward already claimed');
      }
      grantReward(this.ctx, userId, def.reward);
    });
  }

  private period(m: MissionDef, day: string) {
    return m.repeat === 'daily' && !DERIVED_MISSION_KINDS.includes(m.kind) ? day : '';
  }
}
