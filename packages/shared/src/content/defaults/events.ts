/** Default events. */
import type { EventDef } from '../types';
import { lineup } from './campaign';
import { reward } from './missions';

/** The first timed event. Dates are inclusive UTC days; edit them in Admin → Events. */
export const HARVEST_EVENT: EventDef = {
  id: 'harvest-moon',
  name: 'Harvest Moon Festival',
  emoji: '🎃',
  description: 'The autumn moon rises and the fields fill with mischief. Clear festival stages for Moon Candy and trade it for Hollow, the Pumpkin Knight.',
  theme: 'ember',
  start: '2026-10-15',
  end: '2026-11-15',
  currency: { name: 'Moon Candy', emoji: '🍬', icon: null },
  stages: [
    {
      name: 'Lantern Path',
      recommendedLevel: 15,
      enemies: lineup(['lava-slime', 'ghostfire', 'lava-slime'], 13),
      waves: [],
      currencyMin: 8,
      currencyMax: 12,
      gold: 600,
      firstClearGems: 100,
    },
    {
      name: 'Haunted Orchard',
      recommendedLevel: 30,
      enemies: lineup(['hellhound', 'ghostfire', 'hellhound'], 28),
      waves: [lineup(['imp', 'demon', 'imp'], 28)],
      currencyMin: 14,
      currencyMax: 20,
      gold: 1200,
      firstClearGems: 150,
    },
    {
      name: 'Moonlit Bonfire',
      recommendedLevel: 45,
      enemies: lineup(['ghostfire', 'magma-golem', 'ghostfire'], 42),
      waves: [lineup(['hellhound', 'wyrm', 'hellhound'], 42)],
      currencyMin: 24,
      currencyMax: 32,
      gold: 2400,
      firstClearGems: 200,
    },
  ],
  shop: [
    { id: 'hollow', reward: reward(0), character: 'hollow', cost: 400, limit: 5 },
    { id: 'gems', reward: reward(150), character: null, cost: 120, limit: 5 },
    { id: 'crystal', reward: reward(0, 0, 0, { 'star-crystal': 1 }), character: null, cost: 90, limit: 5 },
    { id: 'tomes', reward: reward(0, 0, 0, { 'skill-tome': 2 }), character: null, cost: 60, limit: 10 },
    { id: 'essence', reward: reward(0, 0, 0, { 'flame-essence': 5 }), character: null, cost: 40, limit: 10 },
    { id: 'gold', reward: reward(0, 5000), character: null, cost: 20, limit: 20 },
  ],
};
export const events: EventDef[] = [HARVEST_EVENT];
