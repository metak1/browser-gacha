import { randomUUID } from 'node:crypto';
import {
  bestLoadout,
  constellationOf,
  gearSalvageValue,
  gearUpgradeCost,
  pickGearTemplate,
  reforgeGold,
  reforgeSub,
  rollGear,
  salvageStones,
  upgradeGear,
  type GearDef,
  type GearItem,
  type GearRolls,
  type SalvagedDTO,
  type StageDef,
  type TeamMember,
  unitBase,
} from '@gacha/shared';
import { badRequest, conflict, notFound } from '../errors';
import type { ServiceContext } from './context';
import type { MissionService } from './missions';

/** Player inventories: drops, equipping, upgrades and salvage. */
export class GearService {
  constructor(
    private readonly ctx: ServiceContext,
    private readonly missions: MissionService,
  ) {}

  list(userId: string): GearItem[] {
    return this.ctx.gear.list(userId);
  }

  /** Resolves a player's heroes (levels, constellation, worn gear) for a battle setup. */
  teamMembers(userId: string, charIds: string[]): TeamMember[] {
    const { roster, gear, content } = this.ctx;
    return charIds
      .filter((id) => content.current.charactersById[id])
      .flatMap((id) => {
        const owned = roster.get(userId, id);
        if (!owned) return [];
        return [
          {
            id,
            level: owned.level,
            constellation: constellationOf(owned.copies),
            gear: gear.equippedOn(userId, id),
            ascension: owned.ascension,
            skillLevel: owned.skillLevel,
            ultLevel: owned.ultLevel,
          },
        ];
      });
  }

  equip(userId: string, gearId: string, charId: string | null) {
    const { db, gear, roster, content } = this.ctx;
    db.transaction(() => {
      const item = gear.get(userId, gearId);
      if (!item) throw notFound('Gear not found');
      if (charId === null) {
        gear.setEquipped(userId, gearId, null);
        return;
      }
      if (!roster.get(userId, charId) || !content.current.charactersById[charId]) {
        throw badRequest('invalid_character', `You don't own ${charId}`);
      }
      // Moving gear between heroes, or replacing what's in the slot, are both fine.
      gear.setEquipped(userId, gearId, null);
      gear.unequipSlot(userId, charId, item.slot);
      gear.setEquipped(userId, gearId, charId);
    });
  }

  /** Puts the best free gear on a hero, slot by slot (see bestLoadout). Returns how many pieces changed. */
  /** Locks or unlocks an item; locked gear is safe from salvage. */
  setLocked(userId: string, gearId: string, locked: boolean): GearItem {
    const { gear } = this.ctx;
    if (!gear.get(userId, gearId)) throw notFound('Gear not found');
    gear.setLocked(userId, gearId, locked);
    return gear.get(userId, gearId)!;
  }

  /** The gear set auto-equip aims for on a hero (null = whatever is strongest). */
  setTargetSet(userId: string, charId: string, set: string | null) {
    const { roster, content } = this.ctx;
    if (!roster.get(userId, charId)) throw badRequest('invalid_character', `You don't own ${charId}`);
    if (set && !content.current.gearSetsById[set]) throw badRequest('invalid_set', 'Unknown gear set');
    roster.setGearSet(userId, charId, set);
  }

  autoEquip(userId: string, charId: string): number {
    const { db, gear, roster, content } = this.ctx;
    const c = content.current.charactersById[charId];
    return db.transaction(() => {
      const owned = roster.get(userId, charId);
      if (!c || !owned) throw badRequest('invalid_character', `You don't own ${charId}`);
      const { stats: base, combat } = unitBase(content.current.settings.progression, c, owned.level, constellationOf(owned.copies), owned.ascension);
      const sets = content.current.gearSetsById;
      const target = owned.gearSet && sets[owned.gearSet] ? owned.gearSet : null;
      const plan = bestLoadout(base, gear.list(userId), charId, sets, combat, target).filter((s) => s.best && s.best.id !== s.current?.id);
      for (const s of plan) {
        gear.unequipSlot(userId, charId, s.slot);
        gear.setEquipped(userId, s.best!.id, charId);
      }
      return plan.length;
    });
  }

  upgrade(userId: string, gearId: string): GearItem {
    const { db, gear, users, content, random } = this.ctx;
    const { settings } = content.current;
    return db.transaction(() => {
      const item = gear.get(userId, gearId);
      if (!item) throw notFound('Gear not found');
      if (item.level >= settings.gearMaxLevel) throw conflict('max_level', 'Already at max level');
      const cost = gearUpgradeCost(settings, item);
      if (users.findById(userId)!.wallet.gold < cost) throw badRequest('insufficient_funds', `Need ${cost} gold`);
      const next = upgradeGear(item, random);
      gear.saveRolls(userId, next);
      users.adjustWallet(userId, { gold: -cost });
      this.missions.record(userId, 'upgradeGear');
      return next;
    });
  }

  salvage(userId: string, gearId: string): number {
    const { db, gear, users, content } = this.ctx;
    return db.transaction(() => {
      const item = gear.get(userId, gearId);
      if (!item) throw notFound('Gear not found');
      if (item.locked) throw conflict('locked', 'Unlock this item before salvaging it');
      const gold = gearSalvageValue(content.current.settings, item);
      gear.delete(userId, gearId);
      users.adjustWallet(userId, { gold });
      this.addStones(userId, salvageStones(content.current.settings, item.rarity));
      return gold;
    });
  }

  private addStones(userId: string, count: number) {
    if (count > 0) this.ctx.materials.add(userId, this.ctx.content.current.settings.reforge.material, count);
  }

  /** Pays a reforge's gold and stones, or throws. Inside a transaction. */
  private payForge(userId: string, gold: number, stones: number) {
    const { users, materials, content } = this.ctx;
    const material = content.current.settings.reforge.material;
    if (users.findById(userId)!.wallet.gold < gold) throw badRequest('insufficient_funds', `Need ${gold} gold`);
    if (!materials.spend(userId, material, stones)) throw badRequest('insufficient_materials', `Need ${stones} reforge stone${stones === 1 ? '' : 's'}`);
    users.adjustWallet(userId, { gold: -gold });
  }

  /** Rerolls one substat into a different random stat (see reforgeSub). Always random. */
  reforge(userId: string, gearId: string, sub: number): GearItem {
    const { db, gear, content, random } = this.ctx;
    const settings = content.current.settings;
    return db.transaction(() => {
      const item = gear.get(userId, gearId);
      if (!item) throw notFound('Gear not found');
      if (!item.subs[sub]) throw badRequest('invalid_substat', 'No such bonus stat');
      this.payForge(userId, reforgeGold(settings, item), settings.reforge.stones);
      const next = reforgeSub(item, sub, random);
      gear.saveRolls(userId, next);
      return next;
    });
  }

  /** Rolls a stage's drop table. Call inside the victory transaction. */
  /** Gear of this rarity or lower is salvaged on drop (0 = keep everything). */
  private autoSalvage(userId: string): number {
    const v = this.ctx.users.prefs(userId).autoSalvage;
    return v === 3 || v === 4 ? v : 0;
  }

  /**
   * Rolls a drop table; `chanceMult` scales every chance (hard mode), capped at 100%.
   * Drops at or below the player's auto-salvage rarity become gold instead.
   */
  rollDrops(userId: string, table: StageDef['drops'], chanceMult = 1): { drops: GearItem[]; inventoryFull: boolean; salvaged: SalvagedDTO } {
    const { gear, content, random } = this.ctx;
    const salvageAt = this.autoSalvage(userId);
    const drops: GearItem[] = [];
    const salvaged: SalvagedDTO = { count: 0, gold: 0, stones: 0 };
    const state = { count: gear.count(userId), inventoryFull: false };
    for (const entry of table) {
      const template = content.current.gearById[entry.gear];
      if (!template || random() >= Math.min(1, entry.chance * chanceMult)) continue;
      this.grant(userId, template, null, salvageAt, drops, salvaged, state);
    }
    return { drops, inventoryFull: state.inventoryFull, salvaged };
  }

  /**
   * Gear-dungeon loot: `rolls.count` items, each a random template of a rarity picked by the
   * tier's weights, and a random set from the dungeon's own (`offered`), or any set when the
   * dungeon offers none in particular.
   */
  rollGearDungeon(userId: string, rolls: GearRolls, offered: string[] = []): { drops: GearItem[]; inventoryFull: boolean; salvaged: SalvagedDTO } {
    const { gear, content, random } = this.ctx;
    const salvageAt = this.autoSalvage(userId);
    const drops: GearItem[] = [];
    const salvaged: SalvagedDTO = { count: 0, gold: 0, stones: 0 };
    const state = { count: gear.count(userId), inventoryFull: false };
    for (let i = 0; i < rolls.count; i++) {
      const template = pickGearTemplate(content.current.bundle.gear, rolls, random);
      const itemSet = offered.length ? offered[Math.floor(random() * offered.length)]! : null;
      if (template) this.grant(userId, template, itemSet, salvageAt, drops, salvaged, state);
    }
    return { drops, inventoryFull: state.inventoryFull, salvaged };
  }

  /** Gives one dropped item, or salvages it (auto-salvage), or loses it when the bag is full. */
  private grant(
    userId: string,
    template: GearDef,
    set: string | null,
    salvageAt: number,
    drops: GearItem[],
    salvaged: SalvagedDTO,
    state: { count: number; inventoryFull: boolean },
  ) {
    const { gear, content, random, now, users } = this.ctx;
    const settings = content.current.settings;
    {
      if (template.rarity <= salvageAt) {
        const gold = gearSalvageValue(settings, { level: 0, rarity: template.rarity });
        const stones = salvageStones(settings, template.rarity);
        users.adjustWallet(userId, { gold });
        this.addStones(userId, stones);
        salvaged.count++;
        salvaged.gold += gold;
        salvaged.stones += stones;
        return;
      }
      if (state.count >= settings.gearInventoryCap) {
        state.inventoryFull = true;
        return;
      }
      // A given set (a gear dungeon's) overrides the template's (or the random) set.
      const source = set ? { ...template, set } : template;
      const item: GearItem = { id: randomUUID(), ...rollGear(source, random, content.current.bundle.gearSets), equippedTo: null, locked: false };
      gear.insert(userId, item, now());
      drops.push(item);
      state.count++;
    }
  }

  /** Salvages every unequipped, unupgraded item of this rarity or lower. */
  salvageBulk(userId: string, maxRarity: number): SalvagedDTO {
    const { db, gear, users, content } = this.ctx;
    return db.transaction(() => {
      const items = gear.list(userId).filter((g) => g.rarity <= maxRarity && g.level === 0 && !g.equippedTo && !g.locked);
      let gold = 0;
      let stones = 0;
      for (const item of items) {
        gold += gearSalvageValue(content.current.settings, item);
        stones += salvageStones(content.current.settings, item.rarity);
        gear.delete(userId, item.id);
      }
      users.adjustWallet(userId, { gold });
      this.addStones(userId, stones);
      return { count: items.length, gold, stones };
    });
  }
}
