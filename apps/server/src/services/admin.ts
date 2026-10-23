import {
  autoBattle,
  evaluateObjectives,
  starsEarned,
  buildBattleSetup,
  minRankForLevel,
  type AdminGrantRequest,
  type AdminPlayerDTO,
  type SimulateRequest,
  type SimulateResponse,
  type UserRole,
} from '@gacha/shared';
import { badRequest, notFound } from '../errors';
import type { User } from '../repos/users';
import type { ServiceContext } from './context';

/** Operator tools: player lookup and grants, roles, and balance simulation. */
export class AdminService {
  constructor(private readonly ctx: ServiceContext) {}

  isAdmin(userId: string): boolean {
    return this.ctx.users.findById(userId)?.role === 'admin';
  }

  players(query: string): AdminPlayerDTO[] {
    return this.ctx.users.search(query, 50).map((u) => this.toDTO(u));
  }

  grant(userId: string, req: AdminGrantRequest): AdminPlayerDTO {
    const { db, users, roster, content, now } = this.ctx;
    const user = users.findById(userId);
    if (!user) throw notFound('Player not found');
    const { maxLevel } = content.current.settings;
    if (req.level !== undefined && (req.level < 1 || req.level > maxLevel)) {
      throw badRequest('invalid_level', `Level must be 1–${maxLevel}`);
    }
    db.transaction(() => {
      users.adjustWallet(userId, { gems: req.gems ?? 0, gold: req.gold ?? 0, stardust: req.stardust ?? 0 });
      if (req.allCharacters) {
        for (const c of content.current.bundle.characters) {
          if (!roster.get(userId, c.id)) roster.addCopy(userId, c.id, now());
        }
      }
      if (req.level !== undefined) {
        // Raise ascension too if the level needs it, so the hero isn't stuck above its cap.
        const rank = minRankForLevel(content.current.settings.progression, req.level);
        for (const c of roster.list(userId)) {
          roster.setLevel(userId, c.id, req.level);
          if (c.ascension < rank) roster.setAscension(userId, c.id, rank);
        }
      }
      if (req.materialsEach) {
        for (const m of content.current.bundle.materials) this.ctx.materials.add(userId, m.id, req.materialsEach);
      }
    });
    return this.toDTO(users.findById(userId)!);
  }

  setRole(userId: string, role: UserRole): AdminPlayerDTO {
    const user = this.ctx.users.findById(userId);
    if (!user) throw notFound('Player not found');
    this.ctx.users.setRole(userId, role);
    return this.toDTO({ ...user, role });
  }

  /** Auto-battles a stage many times with a hypothetical team, using the live content. */
  simulate(req: SimulateRequest): SimulateResponse {
    const content = this.ctx.content.current;
    const stage = content.stagesById[req.stageId];
    if (!stage) throw notFound(`Unknown stage ${req.stageId}`);
    for (const id of req.team) if (!content.charactersById[id]) throw badRequest('invalid_team', `Unknown character ${id}`);
    let wins = 0;
    let turns = 0;
    let perfect = 0;
    let winActions = 0;
    for (let seed = 1; seed <= req.runs; seed++) {
      const setup = buildBattleSetup(
        content,
        seed,
        req.team.map((id) => ({ id, level: req.level, constellation: 0 })),
        stage,
      );
      const { state, actions } = autoBattle(setup);
      turns += state.turns;
      if (state.outcome !== 'victory') continue;
      wins++;
      winActions += actions.length;
      if (starsEarned(evaluateObjectives(stage.objectives, state, actions.length), true) >= stage.objectives.length) perfect++;
    }
    return {
      runs: req.runs,
      wins,
      winRate: wins / req.runs,
      averageTurns: Math.round(turns / req.runs),
      perfectRate: perfect / req.runs,
      averageWinActions: wins ? Math.round(winActions / wins) : 0,
    };
  }

  private toDTO(u: User): AdminPlayerDTO {
    return {
      id: u.id,
      username: u.username,
      role: u.role,
      createdAt: u.createdAt,
      wallet: u.wallet,
      characters: this.ctx.roster.list(u.id).length,
      clears: this.ctx.progress.clearedStages(u.id).length,
    };
  }
}
