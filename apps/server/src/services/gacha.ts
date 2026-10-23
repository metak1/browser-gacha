import { constellationOf, firstSummonFree, GUIDE_FLAGS, MAX_CONSTELLATION, rollPull, type SummonResultDTO } from '@gacha/shared';
import { badRequest, notFound } from '../errors';
import type { ServiceContext } from './context';
import type { MissionService } from './missions';

export class GachaService {
  constructor(
    private readonly ctx: ServiceContext,
    private readonly missions: MissionService,
  ) {}

  summon(userId: string, bannerId: string, count: number): SummonResultDTO[] {
    const { db, users, roster, gacha, now, random } = this.ctx;
    const content = this.ctx.content.current;
    const banner = content.bannersById[bannerId];
    if (!banner || !banner.active) throw notFound(`Banner ${bannerId} isn't available`);

    return db.transaction(() => {
      // A new player's first 10× summon is free (the tutorial ends on it).
      const flags = users.flags(userId);
      const free = count === 10 && firstSummonFree(content, flags);
      const cost = free ? 0 : content.settings.pullCost * count;
      if (users.findById(userId)!.wallet.gems < cost) {
        throw badRequest('insufficient_funds', `Need ${cost} gems`);
      }
      const t = now();
      const state = gacha.bannerState(userId, bannerId);
      const results: SummonResultDTO[] = [];
      let stardust = 0;

      for (let i = 0; i < count; i++) {
        // Guaranteed ★5: bring the last pull of a free summon to hard pity, so banner rules still pick the hero.
        if (free && content.settings.firstSummon.guarantee5 && i === count - 1 && !results.some((r) => r.rarity === 5)) {
          state.pity5 = Math.max(state.pity5, content.settings.gacha.hardPity5 - 1);
        }
        const pull = rollPull(state, banner, content, random);
        const copies = roster.addCopy(userId, pull.id, t);
        let dust = 0;
        if (copies > 1) {
          dust = content.settings.stardustPerDupe[`r${pull.rarity}`];
          if (copies - 1 > MAX_CONSTELLATION) dust *= 2;
        }
        stardust += dust;
        gacha.recordPull(userId, bannerId, pull, t);
        results.push({ ...pull, isNew: copies === 1, constellation: constellationOf(copies), stardust: dust });
      }

      gacha.saveBannerState(userId, bannerId, state);
      users.adjustWallet(userId, { gems: -cost, stardust });
      if (free) users.setFlags(userId, [...flags, GUIDE_FLAGS.firstSummon]);
      this.missions.record(userId, 'summon', count);
      return results;
    });
  }

  exchangeStardust(userId: string) {
    const { db, users } = this.ctx;
    const { stardustExchangeCost, pullCost } = this.ctx.content.current.settings;
    db.transaction(() => {
      if (users.findById(userId)!.wallet.stardust < stardustExchangeCost) {
        throw badRequest('insufficient_funds', `Need ${stardustExchangeCost} stardust`);
      }
      users.adjustWallet(userId, { stardust: -stardustExchangeCost, gems: pullCost });
    });
  }

  history(userId: string, limit = 100) {
    return this.ctx.gacha.recentPulls(userId, limit);
  }
}
