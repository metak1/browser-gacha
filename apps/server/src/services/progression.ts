import { essenceFor, maxSkillLevel, nextAscension, skillLevelCost, type MaterialStack, type StageDef } from '@gacha/shared';
import { badRequest, conflict, notFound } from '../errors';
import type { ServiceContext } from './context';
import type { MissionService } from './missions';
import { grantMaterials } from './rewards';

export type SkillSlot = 'skill' | 'ultimate';

/** Ascension, skill levels, the material shop, and material drops. */
export class ProgressionService {
  constructor(
    private readonly ctx: ServiceContext,
    private readonly missions: MissionService,
  ) {}

  ascend(userId: string, charId: string) {
    const { db, roster, content } = this.ctx;
    const index = content.current;
    const prog = index.settings.progression;
    const def = index.charactersById[charId];
    if (!def) throw notFound(`Unknown character ${charId}`);
    db.transaction(() => {
      const owned = roster.get(userId, charId);
      if (!owned) throw notFound(`You don't own ${charId}`);
      const step = nextAscension(prog, owned.ascension);
      if (!step) throw conflict('max_ascension', `${def.name} is fully ascended`);
      const essence = essenceFor(index, def.element);
      this.pay(userId, step.gold, [
        ...(step.essence && essence ? [{ id: essence.id, count: step.essence }] : []),
        ...(step.crystals ? [{ id: prog.crystal, count: step.crystals }] : []),
      ]);
      roster.setAscension(userId, charId, owned.ascension + 1);
      this.missions.record(userId, 'ascend');
    });
  }

  skillUp(userId: string, charId: string, slot: SkillSlot) {
    const { db, roster, content } = this.ctx;
    const index = content.current;
    const prog = index.settings.progression;
    const def = index.charactersById[charId];
    if (!def) throw notFound(`Unknown character ${charId}`);
    if (!(slot === 'skill' ? def.skill : def.ultimate)) throw badRequest('no_skill', `${def.name} has no ${slot}`);
    db.transaction(() => {
      const owned = roster.get(userId, charId);
      if (!owned) throw notFound(`You don't own ${charId}`);
      const level = slot === 'skill' ? owned.skillLevel : owned.ultLevel;
      if (level >= maxSkillLevel(prog)) throw conflict('max_skill_level', 'Already at max skill level');
      const cost = skillLevelCost(prog, level)!;
      this.pay(userId, cost.gold, cost.tomes ? [{ id: prog.tome, count: cost.tomes }] : []);
      roster.setSkillLevel(userId, charId, slot, level + 1);
      this.missions.record(userId, 'skillUp');
    });
  }

  buy(userId: string, materialId: string, quantity: number) {
    const { db, content, users, materials } = this.ctx;
    const index = content.current;
    const entry = index.settings.progression.shop.find((e) => e.material === materialId);
    if (!entry || !index.materialsById[materialId]) throw notFound('That item is not for sale');
    db.transaction(() => {
      const wallet = users.findById(userId)!.wallet;
      const gold = entry.gold * quantity;
      const stardust = entry.stardust * quantity;
      if (wallet.gold < gold) throw badRequest('insufficient_funds', `Need ${gold} gold`);
      if (wallet.stardust < stardust) throw badRequest('insufficient_funds', `Need ${stardust} stardust`);
      users.adjustWallet(userId, { gold: -gold, stardust: -stardust });
      materials.add(userId, materialId, quantity);
    });
  }

  /** Rolls a stage's material drops and grants them. Call inside the victory transaction. */
  /** Rolls material drops; `countMult` scales the counts (hard mode). */
  rollMaterialDrops(userId: string, table: StageDef['materialDrops'], countMult = 1): MaterialStack[] {
    const { random } = this.ctx;
    const drops: MaterialStack[] = [];
    for (const d of table) {
      if (random() >= d.chance) continue;
      const count = Math.max(1, Math.round((d.min + Math.floor(random() * (d.max - d.min + 1))) * countMult));
      const existing = drops.find((x) => x.id === d.material);
      if (existing) existing.count += count;
      else drops.push({ id: d.material, count });
    }
    grantMaterials(this.ctx, userId, drops);
    return drops.filter((d) => this.ctx.content.current.materialsById[d.id]);
  }

  /** Checks and spends gold + materials, all or nothing (we're inside a transaction). */
  private pay(userId: string, gold: number, mats: MaterialStack[]) {
    const { users, materials, content } = this.ctx;
    const missing: string[] = [];
    if (users.findById(userId)!.wallet.gold < gold) missing.push(`${gold} gold`);
    for (const m of mats) {
      if (materials.count(userId, m.id) < m.count) {
        missing.push(`${m.count}× ${content.current.materialsById[m.id]?.name ?? m.id}`);
      }
    }
    if (missing.length) throw badRequest('insufficient_materials', `Need ${missing.join(', ')}`);
    users.adjustWallet(userId, { gold: -gold });
    for (const m of mats) materials.spend(userId, m.id, m.count);
  }
}
