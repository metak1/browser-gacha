import { isEventActive, MAX_CONSTELLATION, type EventDef } from '@gacha/shared';
import { badRequest, notFound } from '../errors';
import type { ServiceContext } from './context';
import { grantReward } from './rewards';

/** Event shops: trade event currency for rewards and the event's hero. */
export class EventService {
  constructor(private readonly ctx: ServiceContext) {}

  /** An event that exists and is running now. */
  active(eventId: string): EventDef {
    const ev = this.ctx.content.current.bundle.events.find((e) => e.id === eventId);
    if (!ev) throw notFound('Event not found');
    if (!isEventActive(ev, this.ctx.now())) throw badRequest('event_over', `${ev.name} is not running right now`);
    return ev;
  }

  buy(userId: string, eventId: string, itemId: string, count: number) {
    const { db, events, roster, users, content, now } = this.ctx;
    const ev = this.active(eventId);
    const item = ev.shop.find((i) => i.id === itemId);
    if (!item) throw notFound('Item not found');
    db.transaction(() => {
      const bought = events.purchases(userId, eventId, itemId);
      if (bought + count > item.limit) throw badRequest('limit', `Only ${item.limit - bought} left`);
      const cost = item.cost * count;
      if (events.currency(userId, eventId) < cost) throw badRequest('insufficient_funds', `Need ${cost} ${ev.currency.name}`);
      events.addCurrency(userId, eventId, -cost);
      events.addPurchases(userId, eventId, itemId, count);
      for (let i = 0; i < count; i++) {
        grantReward(this.ctx, userId, item.reward);
        if (item.character && content.current.charactersById[item.character]) {
          // A duplicate becomes constellation and stardust, as from the gacha.
          const copies = roster.addCopy(userId, item.character, now());
          if (copies > 1) {
            const rarity = content.current.charactersById[item.character]!.rarity;
            let dust = content.current.settings.stardustPerDupe[`r${rarity}`];
            if (copies - 1 > MAX_CONSTELLATION) dust *= 2;
            users.adjustWallet(userId, { stardust: dust });
          }
        }
      }
    });
  }
}
