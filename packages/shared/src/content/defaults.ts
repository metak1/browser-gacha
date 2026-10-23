/**
 * The content a fresh database is seeded with. After seeding, the database is
 * the source of truth and this file is only used for "reset to defaults".
 */
import { advance, basicAttack, dmg, heal, shield, skill, status, summonFx } from '../skills';
import { characterBase } from '../stats';
import { defaultSkillIcon } from './icons';
import { DEFAULT_LORE } from './lore';
import { defaultObjectives, defaultPassive, defaultStarRewards } from './passives';
import {
  DEFAULT_ARENA_TIERS,
  DEFAULT_ACTIVITY_CHESTS, DEFAULT_FIRST_SUMMON, DEFAULT_GUILD, DEFAULT_REFORGE, DEFAULT_TOWER,
  DEFAULT_HARD_MODE,
  DEFAULT_LOGIN_CALENDAR,
  DEFAULT_PLAYER_LEVEL,
  DEFAULT_PROGRESSION,
  DEFAULT_SOCIAL,
  DEFAULT_STAMINA,
  DEFAULT_UNLOCKS,
} from './schemas';
import type { ElementId, Rarity, Role, Skill, Stats } from '../types';
import type {
  EnemyMechanics,
  BannerDef,
  ChapterDef,
  CharacterDef,
  ContentBundle,
  DungeonDef,
  EventDef,
  EncounterEnemy,
  EnemyDef,
  GameSettings,
  GearDef,
  GearSetDef,
  MaterialDef,
  MissionDef,
  SkillDef,
  StageDef,
} from './types';

const skills: SkillDef[] = [];
/** Registers a spell, giving it a default icon based on its owner's element. */
const addSkill = (id: string, s: Skill, element: ElementId, slot: 'basic' | 'skill' | 'ult'): string => {
  skills.push({ id, ...s, icon: s.icon ?? defaultSkillIcon(element, slot, s) });
  return id;
};

interface HeroSpec {
  id: string;
  name: string;
  rarity: Rarity;
  element: ElementId;
  role: Role;
  emoji: string;
  basic: string;
  skill: Skill;
  ult: Skill;
  limited?: boolean;
  sprite?: string;
}

function hero(h: HeroSpec): CharacterDef {
  return {
    id: h.id,
    name: h.name,
    rarity: h.rarity,
    element: h.element,
    role: h.role,
    emoji: h.emoji,
    sprite: h.sprite ?? null,
    limited: h.limited ?? false,
    title: DEFAULT_LORE[h.id]?.title ?? '',
    lore: structuredClone(DEFAULT_LORE[h.id]?.lore ?? []),
    base: characterBase(h.role, h.rarity),
    basic: addSkill(`${h.id}-basic`, basicAttack(h.basic), h.element, 'basic'),
    skill: addSkill(`${h.id}-skill`, h.skill, h.element, 'skill'),
    ultimate: addSkill(`${h.id}-ult`, h.ult, h.element, 'ult'),
    passive: defaultPassive(h.id),
  };
}

const characters: CharacterDef[] = [
  // ★5
  hero({ id: 'ignis', name: 'Ignis, Ember King', rarity: 5, element: 'flame', role: 'striker', emoji: '🐉', basic: 'Ember Claw',
    skill: skill('Inferno Breath', 'none', 3, dmg(1.3, 'allEnemies'), status('burn', 2, 'allEnemies', 0.6)),
    ult: skill('Dragonfire Cataclysm', 'none', 0, dmg(2.6, 'allEnemies'), status('burn', 3, 'allEnemies')) }),
  hero({ id: 'marina', name: 'Marina, Tidecaller', rarity: 5, element: 'tide', role: 'healer', emoji: '🧜‍♀️', basic: 'Riptide',
    skill: skill('Healing Tide', 'none', 3, heal(1.7, 'allAllies'), status('defUp', 2, 'allAllies')),
    ult: skill("Ocean's Embrace", 'none', 0, heal(3.0, 'allAllies'), shield(1.2, 'allAllies')) }),
  hero({ id: 'zephyr', name: 'Zephyr Skyblade', rarity: 5, element: 'gale', role: 'striker', emoji: '🦅', basic: 'Wind Cut',
    skill: skill('Skyfall Strike', 'enemy', 3, dmg(2.6, 'target', 'spd'), status('spdUp', 2, 'self')),
    ult: skill('Thousand Gales', 'enemy', 0, dmg(5.0), dmg(1.0, 'allEnemies')) }),
  hero({ id: 'gaia', name: 'Gaia, Stoneheart', rarity: 5, element: 'stone', role: 'guardian', emoji: '🗿', basic: 'Boulder Bash',
    skill: skill('Earthen Bulwark', 'none', 4, shield(1.9, 'allAllies', 'def'), status('taunt', 2, 'self')),
    ult: skill('World Pillar', 'none', 0, shield(2.6, 'allAllies', 'def'), status('defUp', 3, 'allAllies'), status('taunt', 2, 'self')) }),
  hero({ id: 'yuki', name: 'Yuki of the White Veil', rarity: 5, element: 'frost', role: 'support', emoji: '🦊', basic: 'Snow Flurry',
    skill: skill('White Veil', 'enemy', 3, dmg(1.6), status('stun', 1, 'target', 0.7), status('defDown', 2)),
    ult: skill('Absolute Zero', 'none', 0, dmg(1.8, 'allEnemies'), status('stun', 1, 'allEnemies', 0.6)) }),
  hero({ id: 'raijin', name: 'Raijin, Storm Tiger', rarity: 5, element: 'volt', role: 'striker', emoji: '🐯', limited: true, basic: 'Thunder Swipe',
    skill: skill('Thunder Pounce', 'none', 3, dmg(1.5, 'allEnemies'), status('defDown', 2, 'allEnemies', 0.7)),
    ult: skill("Heaven's Thunder", 'none', 0, dmg(2.8, 'allEnemies'), status('defDown', 2, 'allEnemies')) }),
  // ★4
  hero({ id: 'cinder', name: 'Cinder', rarity: 4, element: 'flame', role: 'striker', emoji: '🦎', basic: 'Hot Tail',
    skill: skill('Searing Bite', 'enemy', 3, dmg(2.0), status('burn', 2)),
    ult: skill('Magma Burst', 'enemy', 0, dmg(3.6), status('burn', 3)) }),
  hero({ id: 'coral', name: 'Coral', rarity: 4, element: 'tide', role: 'healer', emoji: '🐙', basic: 'Ink Jet',
    skill: skill('Mending Ink', 'ally', 2, heal(2.4), shield(0.8)),
    ult: skill('Tidal Restoration', 'none', 0, heal(2.2, 'allAllies')) }),
  hero({ id: 'kai', name: 'Kai', rarity: 4, element: 'tide', role: 'support', emoji: '🐬', basic: 'Fin Slap',
    skill: skill('Wave Rider', 'none', 4, status('atkUp', 2, 'allAllies'), advance(0.3, 'allAllies')),
    ult: skill('Riptide Rally', 'none', 0, status('atkUp', 3, 'allAllies'), advance(0.5, 'allAllies')) }),
  hero({ id: 'sylph', name: 'Sylph', rarity: 4, element: 'gale', role: 'healer', emoji: '🧚', basic: 'Pixie Dust',
    skill: skill('Fairy Breeze', 'none', 3, heal(1.3, 'allAllies')),
    ult: skill('Fairy Ring', 'none', 0, heal(2.0, 'allAllies'), status('spdUp', 2, 'allAllies')) }),
  hero({ id: 'bramble', name: 'Bramble', rarity: 4, element: 'stone', role: 'guardian', emoji: '🦔', basic: 'Quill Jab',
    skill: skill('Prickly Guard', 'none', 3, status('taunt', 2, 'self'), status('defUp', 2, 'self'), shield(1.3, 'self', 'def')),
    ult: skill('Thorn Fortress', 'none', 0, shield(2.1, 'self', 'def'), dmg(0.8, 'allEnemies', 'def'), status('taunt', 3, 'self'), status('defUp', 3, 'self')) }),
  hero({ id: 'lumen', name: 'Lumen', rarity: 4, element: 'volt', role: 'support', emoji: '🦉', basic: 'Static Feather',
    skill: skill("Owl's Insight", 'ally', 3, status('atkUp', 3), advance(0.5)),
    ult: skill('Wisdom of Ages', 'none', 0, status('atkUp', 3, 'allAllies'), advance(0.3, 'allAllies')) }),
  hero({ id: 'buzz', name: 'Buzz', rarity: 4, element: 'volt', role: 'striker', emoji: '🐝', basic: 'Sting',
    skill: skill('Sting Swarm', 'none', 3, dmg(1.0, 'allEnemies'), status('defDown', 1, 'allEnemies', 0.5)),
    ult: skill('Hive Storm', 'none', 0, dmg(1.8, 'allEnemies'), status('defDown', 2, 'allEnemies')) }),
  hero({ id: 'rime', name: 'Rime', rarity: 4, element: 'frost', role: 'striker', emoji: '🐧', basic: 'Beak Peck',
    skill: skill('Ice Slide', 'enemy', 3, dmg(1.9), status('stun', 1, 'target', 0.4)),
    ult: skill('Glacier Crash', 'enemy', 0, dmg(3.4), status('stun', 1, 'target', 0.8)) }),
  // ★3
  hero({ id: 'torch', name: 'Torch Sprite', rarity: 3, element: 'flame', role: 'striker', emoji: '🕯️', basic: 'Spark',
    skill: skill('Flicker', 'enemy', 3, dmg(1.6), status('burn', 2, 'target', 0.5)),
    ult: skill('Bonfire', 'none', 0, dmg(1.4, 'allEnemies'), status('burn', 2, 'allEnemies', 0.5)) }),
  hero({ id: 'kindle', name: 'Kindle', rarity: 3, element: 'flame', role: 'support', emoji: '🐿️', basic: 'Acorn Toss',
    skill: skill('Warm Up', 'ally', 3, status('atkUp', 2), advance(0.2)),
    ult: skill('Hearth Song', 'none', 0, status('atkUp', 2, 'allAllies')) }),
  hero({ id: 'puddle', name: 'Puddle', rarity: 3, element: 'tide', role: 'healer', emoji: '🐸', basic: 'Tongue Lash',
    skill: skill('Splash Heal', 'ally', 2, heal(2.0)),
    ult: skill('Rain Dance', 'none', 0, heal(1.6, 'allAllies')) }),
  hero({ id: 'drip', name: 'Drip', rarity: 3, element: 'tide', role: 'guardian', emoji: '🦀', basic: 'Pinch',
    skill: skill('Shell Up', 'none', 3, shield(1.5, 'self', 'def'), status('taunt', 2, 'self')),
    ult: skill('Iron Shell', 'none', 0, shield(2.1, 'self', 'def'), status('taunt', 2, 'self')) }),
  hero({ id: 'breeze', name: 'Breeze', rarity: 3, element: 'gale', role: 'support', emoji: '🐦', basic: 'Peck',
    skill: skill('Tailwind', 'none', 4, status('spdUp', 2, 'allAllies'), advance(0.15, 'allAllies')),
    ult: skill('Gust Front', 'none', 0, advance(0.4, 'allAllies')) }),
  hero({ id: 'gusty', name: 'Gusty', rarity: 3, element: 'gale', role: 'striker', emoji: '🦋', basic: 'Wing Slice',
    skill: skill('Flutter Flurry', 'none', 3, dmg(0.85, 'allEnemies', 'spd')),
    ult: skill('Monarch Storm', 'none', 0, dmg(1.6, 'allEnemies')) }),
  hero({ id: 'pebble', name: 'Pebble', rarity: 3, element: 'stone', role: 'guardian', emoji: '🐢', basic: 'Shell Bump',
    skill: skill('Hard Shell', 'none', 3, status('taunt', 2, 'self'), status('defUp', 2, 'self')),
    ult: skill('Mountain Stance', 'none', 0, shield(1.7, 'self', 'def'), status('defUp', 3, 'self'), status('taunt', 2, 'self')) }),
  hero({ id: 'mossy', name: 'Mossy', rarity: 3, element: 'stone', role: 'healer', emoji: '🐌', basic: 'Slime Trail',
    skill: skill('Moss Wrap', 'none', 3, heal(0.09, 'allAllies', 'hp')),
    ult: skill('Overgrowth', 'none', 0, heal(1.5, 'allAllies'), status('defUp', 2, 'allAllies')) }),
  hero({ id: 'static', name: 'Static', rarity: 3, element: 'volt', role: 'striker', emoji: '🐭', basic: 'Nibble',
    skill: skill('Zap', 'enemy', 3, dmg(1.7), status('defDown', 2, 'target', 0.5)),
    ult: skill('Overload', 'enemy', 0, dmg(3.0), status('defDown', 2)) }),
  // Animated sprite heroes (Tiny RPG Character Asset Pack by Zerie).
  hero({ id: 'aldric', name: 'Aldric, Royal Soldier', rarity: 4, element: 'gale', role: 'striker', emoji: '🗡️', sprite: 'soldier', basic: 'Sword Slash',
    skill: skill('Shield Bash', 'enemy', 3, dmg(1.7), status('stun', 1, 'target', 0.4)),
    ult: skill('Royal Charge', 'none', 0, dmg(1.6, 'allEnemies'), status('atkUp', 2, 'self')) }),
  hero({ id: 'flurry', name: 'Flurry', rarity: 3, element: 'frost', role: 'striker', emoji: '🐰', basic: 'Hop Kick',
    skill: skill('Snowball', 'enemy', 3, dmg(1.5), status('stun', 1, 'target', 0.25)),
    ult: skill('Blizzard Hop', 'none', 0, dmg(1.2, 'allEnemies'), status('stun', 1, 'allEnemies', 0.2)) }),
  // Sprite heroes from the full Tiny RPG Character Asset Packs (by Zerie).
  hero({ id: 'elara', name: 'Elara, Starlight Wizard', rarity: 5, element: 'frost', role: 'striker', emoji: '🧙‍♀️', sprite: 'wizard', basic: 'Frost Bolt',
    skill: skill('Glacial Lance', 'enemy', 3, dmg(2.0), status('stun', 1, 'target', 0.35)),
    ult: skill('Comet Shower', 'none', 0, dmg(1.6, 'allEnemies'), status('defDown', 2, 'allEnemies')) }),
  hero({ id: 'varek', name: 'Varek, Knight Templar', rarity: 5, element: 'volt', role: 'guardian', emoji: '⚜️', sprite: 'knight-templar', limited: true, basic: 'Holy Strike',
    skill: skill('Bulwark of Faith', 'none', 4, shield(1.0, 'allAllies', 'def'), status('taunt', 2, 'self')),
    ult: skill('Judgement', 'none', 0, dmg(1.4, 'allEnemies'), status('defUp', 2, 'allAllies')) }),
  hero({ id: 'roland', name: 'Sir Roland', rarity: 4, element: 'stone', role: 'guardian', emoji: '🛡️', sprite: 'knight', basic: 'Longsword',
    skill: skill('Shield Bash', 'enemy', 4, dmg(1.3, 'target', 'def'), status('taunt', 2, 'self'), status('defUp', 2, 'self')),
    ult: skill('Unbreakable', 'none', 0, shield(1.5, 'allAllies')) }),
  hero({ id: 'celeste', name: 'Sister Celeste', rarity: 4, element: 'volt', role: 'healer', emoji: '🕯', sprite: 'priest', basic: 'Smite',
    skill: skill('Prayer', 'none', 3, heal(0.13, 'allAllies', 'hp')),
    ult: skill('Miracle', 'none', 0, heal(2.2, 'allAllies'), status('atkUp', 2, 'allAllies')) }),
  hero({ id: 'kael', name: 'Kael the Duelist', rarity: 4, element: 'flame', role: 'striker', emoji: '⚔️', sprite: 'swordsman', basic: 'Quick Slash',
    skill: skill('Flame Riposte', 'enemy', 3, dmg(1.9), status('burn', 2, 'target', 0.5)),
    ult: skill('Blazing Flurry', 'enemy', 0, dmg(3.2), status('burn', 3)) }),
  hero({ id: 'fenn', name: 'Fenn the Archer', rarity: 3, element: 'gale', role: 'striker', emoji: '🏹', sprite: 'archer', basic: 'Arrow Shot',
    skill: skill('Volley', 'none', 3, dmg(0.7, 'allEnemies')),
    ult: skill('Rain of Arrows', 'none', 0, dmg(1.3, 'allEnemies'), status('defDown', 1, 'allEnemies', 0.5)) }),
  // Event hero: only from the Harvest Moon Festival shop.
  hero({ id: 'hollow', name: 'Hollow, Pumpkin Knight', rarity: 4, element: 'flame', role: 'guardian', emoji: '🎃', sprite: 'black-knight-c', limited: true, basic: 'Ember Cleave',
    skill: skill('Lantern Ward', 'none', 4, shield(1.0, 'allAllies'), status('taunt', 2, 'self')),
    ult: skill('Harvest Pyre', 'none', 0, dmg(1.4, 'allEnemies'), status('burn', 2, 'allEnemies')) }),
];

// Enemy base stats are tuned with `npm run balance`; regular enemies are scaled up more than bosses.
function foe(
  id: string, name: string, element: ElementId, role: Role, emoji: string,
  raw: Stats, basic: string, sk: Skill, boss = false, ult?: Skill, sprite?: string,
): EnemyDef {
  const t = boss ? { hp: 1.1, atk: 1.15, def: 0.9 } : { hp: 2.1, atk: 1.65, def: 1 };
  return {
    id, name, element, role, emoji, boss,
    sprite: sprite ?? null,
    base: { hp: Math.round(raw.hp * t.hp), atk: Math.round(raw.atk * t.atk), def: Math.round(raw.def * t.def), spd: raw.spd },
    basic: addSkill(`${id}-basic`, basicAttack(basic), element, 'basic'),
    skill: addSkill(`${id}-skill`, sk, element, 'skill'),
    ultimate: ult ? addSkill(`${id}-ult`, ult, element, 'ult') : null,
    passive: defaultPassive(id),
  };
}

const enemies: EnemyDef[] = [
  foe('blob', 'Gel Blob', 'tide', 'striker', '🦠', { hp: 520, atk: 70, def: 30, spd: 88 }, 'Gloop',
    skill('Sticky Splash', 'none', 3, dmg(0.6, 'allEnemies'))),
  foe('imp', 'Fire Imp', 'flame', 'striker', '😈', { hp: 480, atk: 90, def: 30, spd: 104 }, 'Scratch',
    skill('Fireball', 'enemy', 3, dmg(1.5), status('burn', 2, 'target', 0.5))),
  foe('bat', 'Gale Bat', 'gale', 'striker', '🦇', { hp: 420, atk: 80, def: 25, spd: 118 }, 'Bite',
    skill('Screech', 'enemy', 3, dmg(0.8), status('defDown', 2))),
  foe('golem', 'Rock Golem', 'stone', 'guardian', '🪨', { hp: 1100, atk: 75, def: 90, spd: 80 }, 'Slam',
    skill('Stone Skin', 'none', 4, status('taunt', 2, 'self'), status('defUp', 2, 'self'))),
  foe('wisp', 'Volt Wisp', 'volt', 'support', '👻', { hp: 500, atk: 85, def: 35, spd: 110 }, 'Jolt',
    skill('Overcharge', 'none', 4, status('atkUp', 2, 'allAllies'))),
  foe('wolf', 'Frost Wolf', 'frost', 'striker', '🐺', { hp: 650, atk: 100, def: 40, spd: 108 }, 'Maul',
    skill('Frost Fang', 'enemy', 3, dmg(1.6), status('stun', 1, 'target', 0.2))),
  foe('shaman', 'Troll Shaman', 'stone', 'healer', '🧌', { hp: 600, atk: 80, def: 45, spd: 96 }, 'Staff Whack',
    skill('Mend', 'none', 3, heal(1.2, 'allAllies'))),
  // Animated sprite enemies (Tiny RPG Character Asset Packs by Zerie).
  foe('orc', 'Orc Brute', 'stone', 'striker', '👹', { hp: 600, atk: 92, def: 40, spd: 96 }, 'Club Smash',
    skill('Skull Crusher', 'enemy', 3, dmg(1.7), status('defDown', 2, 'target', 0.5)), false, undefined, 'orc'),
  foe('demon', 'Horned Demon', 'flame', 'striker', '😈', { hp: 640, atk: 104, def: 40, spd: 106 }, 'Rending Claw',
    skill('Hellfire', 'none', 3, dmg(0.8, 'allEnemies'), status('burn', 2, 'allEnemies', 0.4)), false, undefined, 'demon'),
  foe('blood-fiend', 'Blood Fiend', 'tide', 'striker', '🩸', { hp: 700, atk: 92, def: 45, spd: 100 }, 'Lash',
    skill('Blood Feast', 'enemy', 3, dmg(1.4), heal(1.0, 'self')), false, undefined, 'blood-monster'),
  foe('kraken', 'Abyssal Kraken', 'tide', 'striker', '🦑', { hp: 2600, atk: 95, def: 60, spd: 95 }, 'Tentacle Lash',
    skill('Maelstrom', 'none', 3, dmg(0.9, 'allEnemies'), status('defDown', 2, 'allEnemies', 0.5)), true,
    skill('Abyssal Tsunami', 'none', 0, dmg(1.6, 'allEnemies'), status('defDown', 2, 'allEnemies'))),
  foe('wyrm', 'Ashen Wyrm', 'flame', 'striker', '🐲', { hp: 3200, atk: 115, def: 70, spd: 100 }, 'Searing Claw',
    skill('Cinder Storm', 'none', 3, dmg(1.0, 'allEnemies'), status('burn', 2, 'allEnemies', 0.6)), true,
    skill('Ashfall', 'none', 0, dmg(1.8, 'allEnemies'), status('burn', 3, 'allEnemies'))),
  foe('lich', 'Frost Lich', 'frost', 'support', '💀', { hp: 4000, atk: 130, def: 80, spd: 104 }, 'Bone Chill',
    skill('Grave Frost', 'none', 4, dmg(1.1, 'allEnemies'), status('stun', 1, 'allEnemies', 0.25)), true,
    skill('Eternal Winter', 'none', 0, dmg(1.9, 'allEnemies'), status('stun', 1, 'allEnemies', 0.4))),

  // Chapter 4: Storm Spire.
  foe('harpy', 'Storm Harpy', 'gale', 'striker', '🦅', { hp: 520, atk: 98, def: 32, spd: 120 }, 'Talon Rake',
    skill('Gust Dive', 'enemy', 3, dmg(1.6), advance(0.3, 'self'))),
  foe('spark', 'Spark Imp', 'volt', 'striker', '⚡', { hp: 360, atk: 80, def: 20, spd: 125 }, 'Zap',
    skill('Static Burst', 'enemy', 3, dmg(1.3), status('stun', 1, 'target', 0.2))),
  foe('storm-knight', 'Storm Knight', 'volt', 'guardian', '🛡️', { hp: 900, atk: 85, def: 60, spd: 90 }, 'Charged Strike',
    skill('Lightning Rod', 'none', 4, status('taunt', 2, 'self'), shield(1.5, 'self'))),
  foe('thunderbird', 'Thunderbird', 'volt', 'striker', '🌩️', { hp: 3800, atk: 125, def: 70, spd: 112 }, 'Thunderclap',
    skill('Call the Storm', 'none', 5, summonFx('spark', 2), status('atkUp', 2, 'allAllies')), true,
    skill('Skyfall', 'none', 0, dmg(1.7, 'allEnemies'), status('stun', 1, 'allEnemies', 0.35))),
  // Chapter 5: Sunken Temple.
  foe('siren', 'Temple Siren', 'tide', 'healer', '🧜', { hp: 560, atk: 85, def: 40, spd: 104 }, 'Hymn Strike',
    skill('Lullaby', 'none', 4, heal(0.6, 'allAllies'), status('stun', 1, 'allEnemies', 0.15))),
  foe('naga', 'Naga Guard', 'tide', 'guardian', '🐍', { hp: 900, atk: 90, def: 55, spd: 92 }, 'Trident Thrust',
    skill('Coil', 'enemy', 3, dmg(1.2), status('taunt', 2, 'self'))),
  foe('scuttler', 'Reef Scuttler', 'stone', 'striker', '🦀', { hp: 600, atk: 100, def: 50, spd: 98 }, 'Pincer',
    skill('Shell Crack', 'enemy', 3, dmg(1.5), status('defDown', 2))),
  foe('warlord', 'Orc Warlord', 'stone', 'striker', '👹', { hp: 2100, atk: 118, def: 50, spd: 100 }, 'Warhammer',
    skill('Rally the Horde', 'none', 5, summonFx('orc', 1)), true,
    skill('Earthshaker', 'none', 0, dmg(1.8, 'allEnemies'), status('defDown', 2, 'allEnemies')), 'orc'),
  // Chapter 6: Starfall Abyss.
  foe('wraith', 'Void Wraith', 'frost', 'striker', '👤', { hp: 580, atk: 115, def: 35, spd: 116 }, 'Soul Rend',
    skill('Chill Touch', 'enemy', 3, dmg(1.7), status('stun', 1, 'target', 0.25))),
  foe('seraph', 'Fallen Seraph', 'gale', 'support', '👼', { hp: 640, atk: 95, def: 45, spd: 110 }, 'Feather Lance',
    skill('Dark Blessing', 'none', 4, status('atkUp', 2, 'allAllies'), status('spdUp', 2, 'allAllies'))),
  foe('magma-golem', 'Magma Golem', 'flame', 'guardian', '🌋', { hp: 950, atk: 95, def: 55, spd: 82 }, 'Molten Fist',
    skill('Eruption', 'none', 4, dmg(0.7, 'allEnemies'), status('burn', 2, 'allEnemies', 0.5), status('taunt', 2, 'self'))),
  foe('demon-lord', 'Demon Lord', 'flame', 'striker', '😈', { hp: 2400, atk: 128, def: 55, spd: 108 }, 'Hellblade',
    skill('Summon Legion', 'none', 5, summonFx('imp', 1)), true,
    skill('Armageddon', 'none', 0, dmg(2.0, 'allEnemies'), status('burn', 3, 'allEnemies')), 'demon'),

  // More sprite enemies from the full Tiny RPG packs. Stats mirror the enemies they
  // stand in for in the lineups below, so difficulty stays put.
  foe('skeleton', 'Skeleton Warrior', 'frost', 'striker', '☠️', { hp: 650, atk: 100, def: 40, spd: 104 }, 'Rusty Blade',
    skill('Bone Cleave', 'enemy', 3, dmg(1.6), status('defDown', 2, 'target', 0.4)), false, undefined, 'skeleton'),
  foe('skeleton-archer', 'Skeleton Archer', 'frost', 'striker', '🏹', { hp: 540, atk: 108, def: 32, spd: 110 }, 'Bone Arrow',
    skill('Piercing Shot', 'enemy', 3, dmg(1.8)), false, undefined, 'skeleton-archer'),
  foe('hellhound', 'Hellhound', 'flame', 'striker', '🐕', { hp: 620, atk: 102, def: 38, spd: 114 }, 'Scorching Bite',
    skill('Flame Pounce', 'enemy', 3, dmg(1.5), status('burn', 2, 'target', 0.5)), false, undefined, 'hellhound'),
  foe('lava-slime', 'Lava Slime', 'flame', 'striker', '🫠', { hp: 500, atk: 84, def: 32, spd: 92 }, 'Splatter',
    skill('Magma Spikes', 'none', 3, dmg(0.6, 'allEnemies'), status('burn', 2, 'allEnemies', 0.3)), false, undefined, 'lava-slime'),
  foe('minotaur', 'Minotaur', 'stone', 'striker', '🐂', { hp: 640, atk: 96, def: 42, spd: 94 }, 'Axe Swing',
    skill('Gore', 'enemy', 3, dmg(1.8), status('stun', 1, 'target', 0.3)), false, undefined, 'minotaur'),
  foe('eyeball', 'Watcher Eye', 'volt', 'support', '👁️', { hp: 500, atk: 85, def: 35, spd: 110 }, 'Gaze',
    skill('Hex Beam', 'none', 4, dmg(0.5, 'allEnemies'), status('defDown', 2, 'allEnemies', 0.5)), false, undefined, 'eyeball-monster'),
  foe('orc-rider', 'Orc Rider', 'stone', 'striker', '🐗', { hp: 600, atk: 92, def: 40, spd: 104 }, 'Lance Charge',
    skill('Trample', 'none', 3, dmg(0.8, 'allEnemies')), false, undefined, 'orc-rider'),
  foe('black-knight', 'Black Knight', 'stone', 'guardian', '♞', { hp: 1100, atk: 75, def: 90, spd: 80 }, 'Dark Blade',
    skill('Dark Bulwark', 'none', 4, status('taunt', 2, 'self'), status('defUp', 2, 'self')), false, undefined, 'black-knight'),
  foe('ghostfire', 'Ghostfire', 'flame', 'support', '🔥', { hp: 480, atk: 90, def: 30, spd: 106 }, 'Ember Touch',
    skill('Soul Flame', 'enemy', 3, dmg(1.4), status('burn', 2)), false, undefined, 'ghostfire'),
];

/** Animated sprites for enemies, from the full Tiny RPG Character Asset Packs. */
export const ENEMY_SPRITES: Record<string, string> = {
  blob: 'slime',
  imp: 'demon-b',
  bat: 'bat',
  wolf: 'werewolf',
  shaman: 'warlock',
  lich: 'necromancer',
  harpy: 'hellbat',
  'storm-knight': 'black-knight-b',
  warlord: 'elite-orc',
  wraith: 'armored-skeleton',
  seraph: 'demoness',
  'magma-golem': 'flame-golem',
  'demon-lord': 'demon-e',
};
for (const e of enemies) if (ENEMY_SPRITES[e.id]) e.sprite = ENEMY_SPRITES[e.id]!;

/**
 * Boss mechanics: every few turns a boss charges a big attack that the team
 * can break with enough damage; some enrage when low or call for help.
 * Break thresholds are tuned (see the boss simulation in the README) so that
 * auto-battle breaks roughly half the charges; focused manual play does better.
 */
function bossMechanics(id: string, charged: Skill, every: number, breakPct: number, rest: Partial<Omit<EnemyMechanics, 'charge'>> = {}) {
  const boss = enemies.find((e) => e.id === id)!;
  boss.mechanics = {
    charge: { skill: addSkill(`${id}-charge`, charged, boss.element, 'ult'), every, breakPct },
    enrage: rest.enrage ?? null,
    adds: rest.adds ?? null,
  };
}
bossMechanics('kraken', skill('Tidal Crush', 'none', 0, dmg(1.5, 'allEnemies')), 3, 0.15);
bossMechanics('wyrm', skill('Inferno Breath', 'none', 0, dmg(2.0, 'allEnemies'), status('burn', 3, 'allEnemies')), 3, 0.11, {
  enrage: { below: 0.3, atk: 1.3, spd: 1.15 },
});
bossMechanics('lich', skill('Absolute Zero', 'none', 0, dmg(1.5, 'allEnemies'), status('stun', 1, 'allEnemies', 0.3)), 4, 0.08, {
  adds: { at: [0.5], unit: 'skeleton', count: 1 },
});
bossMechanics('thunderbird', skill('Judgment Bolt', 'enemy', 0, dmg(3.5), status('stun', 1, 'target')), 3, 0.05, {
  enrage: { below: 0.4, atk: 1.25, spd: 1.2 },
});
bossMechanics('warlord', skill('Cataclysm Slam', 'none', 0, dmg(2.2, 'allEnemies'), status('defDown', 2, 'allEnemies')), 4, 0.15, {
  enrage: { below: 0.5, atk: 1.35, spd: 1.1 },
});
bossMechanics('demon-lord', skill('Hellgate', 'none', 0, dmg(2.4, 'allEnemies'), status('burn', 3, 'allEnemies')), 4, 0.1, {
  enrage: { below: 0.3, atk: 1.3, spd: 1.15 },
  adds: { at: [0.5], unit: 'hellhound', count: 1 },
});

const chapters: ChapterDef[] = [
  { id: 1, name: 'Whispering Meadow', theme: 'meadow', starRewards: defaultStarRewards(1) },
  { id: 2, name: 'Ember Peaks', theme: 'ember', starRewards: defaultStarRewards(2) },
  { id: 3, name: 'Frozen Citadel', theme: 'frost', starRewards: defaultStarRewards(3) },
  { id: 4, name: 'Storm Spire', theme: 'storm', starRewards: defaultStarRewards(4) },
  { id: 5, name: 'Sunken Temple', theme: 'deep', starRewards: defaultStarRewards(5) },
  { id: 6, name: 'Starfall Abyss', theme: 'cosmos', starRewards: defaultStarRewards(6) },
];

/** [id, name, recommended team level, first wave, boss?, later waves]. Enemies are one level below. */
type StageSpec = [id: string, name: string, level: number, enemies: string[], boss?: boolean, waves?: string[][]];
const STAGE_SPECS: StageSpec[] = [
  ['1-1', 'Meadow Path', 1, ['blob', 'blob']],
  ['1-2', 'Bat Hollow', 2, ['bat', 'orc', 'bat']],
  ['1-3', 'Imp Crossing', 4, ['imp', 'orc-rider', 'blob']],
  ['1-4', 'Lake of Tentacles', 6, ['blob', 'kraken', 'blob'], true],
  ['2-1', 'Scorched Trail', 8, ['imp', 'hellhound', 'imp']],
  ['2-2', 'Golem Pass', 10, ['eyeball', 'golem', 'demon']],
  ['2-3', 'Shaman Camp', 12, ['wolf', 'shaman', 'wolf']],
  ['2-4', 'Caldera Throne', 15, ['imp', 'wyrm', 'imp'], true],
  ['3-1', 'Icebound Gate', 17, ['skeleton', 'blood-fiend', 'skeleton-archer']],
  ['3-2', 'Hall of Echoes', 19, ['bat', 'golem', 'shaman', 'bat']],
  ['3-3', 'Frozen Armory', 21, ['demon', 'black-knight', 'blood-fiend', 'minotaur']],
  ['3-4', 'Throne of Winter', 24, ['wolf', 'lich', 'wolf'], true],
  ['4-1', 'Windswept Stair', 27, ['harpy', 'spark', 'harpy']],
  ['4-2', 'Conductor Bridge', 29, ['storm-knight', 'spark', 'harpy'], false, [['spark', 'spark', 'harpy']]],
  ['4-3', 'Eye of the Gale', 31, ['harpy', 'wisp', 'harpy', 'bat'], false, [['storm-knight', 'spark', 'spark']]],
  ['4-4', 'Thunder Throne', 34, ['spark', 'thunderbird', 'spark'], true],
  ['5-1', 'Drowned Steps', 36, ['scuttler', 'siren', 'scuttler']],
  ['5-2', 'Coral Nave', 38, ['naga', 'blood-fiend'], false, [['scuttler', 'scuttler', 'blob']]],
  ['5-3', 'Abyssal Altar', 40, ['naga', 'siren', 'scuttler'], false, [['blood-fiend', 'scuttler', 'siren']]],
  ['5-4', "Warlord's Grotto", 43, ['orc', 'orc', 'scuttler'], true, [['orc', 'warlord', 'siren']]],
  ['6-1', 'Falling Stars', 45, ['wraith', 'seraph', 'wraith']],
  ['6-2', 'Molten Rift', 47, ['magma-golem', 'demon', 'wraith'], false, [['ghostfire', 'imp', 'seraph']]],
  ['6-3', 'Hall of the Fallen', 49, ['seraph', 'wraith', 'magma-golem', 'wraith'], false, [['demon', 'seraph', 'demon']]],
  ['6-4', 'Throne of Ruin', 52, ['wraith', 'magma-golem', 'wraith'], true, [['imp', 'demon-lord', 'imp']]],
];

const LATE_DROPS = {
  normal: [{ gear: 'runed-saber', chance: 0.3 }, { gear: 'knight-mail', chance: 0.3 }, { gear: 'warding-amulet', chance: 0.25 }, { gear: 'moon-pendant', chance: 0.2 }, { gear: 'ranger-boots', chance: 0.2 }, { gear: 'pilgrim-treads', chance: 0.15 }, { gear: 'swift-feather', chance: 0.08 }, { gear: 'starforged-edge', chance: 0.06 }],
  boss: [{ gear: 'starforged-edge', chance: 0.3 }, { gear: 'aegis-of-dawn', chance: 0.3 }, { gear: 'swift-feather', chance: 0.25 }, { gear: 'heart-locket', chance: 0.25 }, { gear: 'warlord-sabatons', chance: 0.25 }],
};

// Gear drop tables by chapter; bosses roll their own richer table.
const DROPS: Record<number, { normal: StageDef['drops']; boss: StageDef['drops'] }> = {
  1: {
    normal: [{ gear: 'bronze-blade', chance: 0.35 }, { gear: 'leather-vest', chance: 0.35 }, { gear: 'lucky-clover', chance: 0.25 }],
    boss: [{ gear: 'runed-saber', chance: 0.3 }, { gear: 'knight-mail', chance: 0.3 }, { gear: 'moon-pendant', chance: 0.2 }],
  },
  2: {
    normal: [{ gear: 'runed-saber', chance: 0.25 }, { gear: 'knight-mail', chance: 0.25 }, { gear: 'lucky-clover', chance: 0.3 }, { gear: 'moon-pendant', chance: 0.15 }, { gear: 'ranger-boots', chance: 0.12 }],
    boss: [{ gear: 'starforged-edge', chance: 0.12 }, { gear: 'aegis-of-dawn', chance: 0.12 }, { gear: 'runed-saber', chance: 0.4 }, { gear: 'warding-amulet', chance: 0.3 }, { gear: 'pilgrim-treads', chance: 0.25 }],
  },
  3: {
    normal: [{ gear: 'runed-saber', chance: 0.3 }, { gear: 'knight-mail', chance: 0.3 }, { gear: 'warding-amulet', chance: 0.25 }, { gear: 'iron-greaves', chance: 0.2 }, { gear: 'ranger-boots', chance: 0.15 }, { gear: 'swift-feather', chance: 0.06 }],
    boss: [{ gear: 'starforged-edge', chance: 0.25 }, { gear: 'aegis-of-dawn', chance: 0.25 }, { gear: 'swift-feather', chance: 0.2 }, { gear: 'heart-locket', chance: 0.2 }, { gear: 'warlord-sabatons', chance: 0.15 }],
  },
  4: LATE_DROPS,
  5: LATE_DROPS,
  6: LATE_DROPS,
};

const ENEMY_ELEMENT: Record<string, ElementId> = Object.fromEntries(enemies.map((e) => [e.id, e.element]));

function materialDrops(foes: string[], chapter: number, boss: boolean): StageDef['materialDrops'] {
  const elements = [...new Set(foes.map((f) => ENEMY_ELEMENT[f]!))];
  const drops: StageDef['materialDrops'] = elements.map((e) => ({ material: `${e}-essence`, min: 1, max: chapter + (boss ? 2 : 0), chance: boss ? 1 : 0.7 }));
  if (boss) drops.push({ material: 'star-crystal', min: 1, max: chapter, chance: 0.6 }, { material: 'skill-tome', min: 1, max: 1, chance: 0.5 });
  else if (chapter >= 2) drops.push({ material: 'skill-tome', min: 1, max: 1, chance: 0.12 });
  return drops;
}

const lineup = (ids: string[], level: number): EncounterEnemy[] => ids.map((e) => ({ id: e, level }));

/**
 * Enemy HP/ATK/DEF multipliers per stage, from the calibration in
 * `npm run balance -- --calibrate`: the starter team (no gear) at the recommended
 * level wins about 85% of auto-battles on normal stages and 65% on bosses.
 * Chapter 1 is left at 1 or lower, so the opening stays gentle.
 */
export const STAGE_TUNING: Record<string, number> = {
  '1-1': 1, '1-2': 1, '1-3': 1, '1-4': 1,
  '2-1': 1.25, '2-2': 1.25, '2-3': 1.2, '2-4': 0.85,
  '3-1': 1.2, '3-2': 1.15, '3-3': 1.05, '3-4': 0.85,
  '4-1': 1.4, '4-2': 1.3, '4-3': 1.05, '4-4': 1.15,
  '5-1': 1.5, '5-2': 1.6, '5-3': 1.25, '5-4': 1.15,
  '6-1': 1.35, '6-2': 1.25, '6-3': 0.95, '6-4': 1,
};

const stages: StageDef[] = STAGE_SPECS.map(([id, name, level, first, boss, later = []]) => {
  const [chapter, index] = id.split('-').map(Number) as [number, number];
  const foes = [...first, ...later.flat()];
  const enemyLevel = Math.max(1, level - 1);
  return {
    id,
    chapter,
    index,
    name,
    enemies: lineup(first, enemyLevel),
    waves: later.map((w) => lineup(w, enemyLevel)),
    recommendedLevel: level,
    statMult: STAGE_TUNING[id] ?? 1,
    firstClearGems: (boss ? 600 : 200) + (chapter > 3 ? 100 * (chapter - 3) : 0),
    gold: 60 + level * 25,
    drops: structuredClone(DROPS[chapter]![boss ? 'boss' : 'normal']),
    materialDrops: materialDrops(foes, chapter, Boolean(boss)),
    objectives: defaultObjectives(id, foes.length, Boolean(boss)),
  };
});

const ESSENCE: { element: ElementId; name: string; emoji: string; icon: number }[] = [
  { element: 'flame', name: 'Ember Essence', emoji: '🔥', icon: 171 },
  { element: 'tide', name: 'Tide Essence', emoji: '💧', icon: 172 },
  { element: 'gale', name: 'Gale Essence', emoji: '🍃', icon: 167 },
  { element: 'stone', name: 'Stone Essence', emoji: '🪨', icon: 200 },
  { element: 'volt', name: 'Volt Essence', emoji: '⚡', icon: 166 },
  { element: 'frost', name: 'Frost Essence', emoji: '❄️', icon: 170 },
];

const materials: MaterialDef[] = [
  ...ESSENCE.map((e) => ({
    id: `${e.element}-essence`,
    name: e.name,
    emoji: e.emoji,
    icon: e.icon,
    rarity: 3 as const,
    element: e.element,
    description: `Condensed ${e.element} energy. ${e.element[0]!.toUpperCase() + e.element.slice(1)} heroes need it to ascend. Dropped by ${e.element} enemies.`,
  })),
  { id: 'star-crystal', name: 'Star Crystal', emoji: '💠', icon: 26, rarity: 5, element: null, description: 'A shard of a summoning star. Needed for higher ascensions. Dropped by bosses.' },
  { id: 'reforge-stone', name: 'Reforge Stone', emoji: '🔨', icon: null, rarity: 4, element: null, description: 'Rewrites gear bonus stats at the forge. From salvaging ★4 and ★5 gear, and tower milestones.' },
  { id: 'skill-tome', name: 'Skill Tome', emoji: '📘', icon: 101, rarity: 4, element: null, description: 'Battle notes from heroes of old. Used to level up skills and ultimates.' },
];

// Templates set the slot, rarity and look; every drop rolls its main stat from the slot's pool.
const gear: GearDef[] = [
  { id: 'bronze-blade', name: 'Bronze Blade', emoji: '🗡️', slot: 'weapon', rarity: 3, mainStat: null, mainBase: 0, icon: 1441, set: null },
  { id: 'runed-saber', name: 'Runed Saber', emoji: '⚔️', slot: 'weapon', rarity: 4, mainStat: null, mainBase: 0, icon: 1508, set: null },
  { id: 'starforged-edge', name: 'Starforged Edge', emoji: '🔱', slot: 'weapon', rarity: 5, mainStat: null, mainBase: 0, icon: 1590, set: null },
  { id: 'leather-vest', name: 'Leather Vest', emoji: '🦺', slot: 'armor', rarity: 3, mainStat: null, mainBase: 0, icon: 1969, set: null },
  { id: 'knight-mail', name: 'Knight Mail', emoji: '🛡️', slot: 'armor', rarity: 4, mainStat: null, mainBase: 0, icon: 1921, set: null },
  { id: 'aegis-of-dawn', name: 'Aegis of Dawn', emoji: '💠', slot: 'armor', rarity: 5, mainStat: null, mainBase: 0, icon: 1927, set: null },
  { id: 'lucky-clover', name: 'Clover Sandals', emoji: '🩴', slot: 'boots', rarity: 3, mainStat: null, mainBase: 0, icon: null, set: null },
  { id: 'moon-pendant', name: 'Moon Pendant', emoji: '🌙', slot: 'charm', rarity: 4, mainStat: null, mainBase: 0, icon: 2065, set: null },
  { id: 'warding-amulet', name: 'Warding Amulet', emoji: '🧿', slot: 'charm', rarity: 4, mainStat: null, mainBase: 0, icon: 2066, set: null },
  { id: 'swift-feather', name: 'Featherstep Boots', emoji: '👢', slot: 'boots', rarity: 5, mainStat: null, mainBase: 0, icon: null, set: null },
  { id: 'heart-locket', name: 'Heart Locket', emoji: '💖', slot: 'charm', rarity: 5, mainStat: null, mainBase: 0, icon: 2181, set: null },
  // Boots: the only slot with SPD as a main stat, but other boots exist too.
  { id: 'ranger-boots', name: 'Ranger Boots', emoji: '🥾', slot: 'boots', rarity: 4, mainStat: null, mainBase: 0, icon: null, set: null },
  { id: 'iron-greaves', name: 'Iron Greaves', emoji: '🦿', slot: 'boots', rarity: 4, mainStat: null, mainBase: 0, icon: null, set: null },
  { id: 'pilgrim-treads', name: 'Pilgrim Treads', emoji: '👞', slot: 'boots', rarity: 4, mainStat: null, mainBase: 0, icon: null, set: null },
  { id: 'warlord-sabatons', name: 'Warlord Sabatons', emoji: '🥿', slot: 'boots', rarity: 5, mainStat: null, mainBase: 0, icon: null, set: null },
];

/** Gear sets: every drop rolls one at random (unless its template fixes a set). */
const gearSets: GearSetDef[] = [
  { id: 'precision', name: 'Precision', emoji: '🎯', icon: 731, bonuses: [{ pieces: 2, stat: 'critRate', value: 0.06 }, { pieces: 4, stat: 'critRate', value: 0.12 }] },
  { id: 'ruin', name: 'Ruin', emoji: '💥', icon: 767, bonuses: [{ pieces: 2, stat: 'critDmg', value: 0.12 }, { pieces: 4, stat: 'critDmg', value: 0.25 }] },
  { id: 'fury', name: 'Fury', emoji: '🔥', icon: 657, bonuses: [{ pieces: 2, stat: 'atkPct', value: 0.08 }, { pieces: 4, stat: 'atkPct', value: 0.15 }] },
  { id: 'vitality', name: 'Vitality', emoji: '💚', icon: 661, bonuses: [{ pieces: 2, stat: 'hpPct', value: 0.1 }, { pieces: 4, stat: 'hpPct', value: 0.2 }] },
  { id: 'bulwark', name: 'Bulwark', emoji: '🛡️', icon: 665, bonuses: [{ pieces: 2, stat: 'defPct', value: 0.1 }, { pieces: 4, stat: 'defPct', value: 0.2 }] },
  { id: 'gale', name: 'Gale', emoji: '🌪️', icon: 891, bonuses: [{ pieces: 2, stat: 'spd', value: 5 }, { pieces: 4, stat: 'spd', value: 10 }] },
];

const banners: BannerDef[] = [
  {
    id: 'thunder',
    name: "Thunder's Call",
    description: 'The Storm Tiger descends. Raijin has a boosted drop rate, and losing a 50/50 guarantees him next time.',
    limited: true,
    active: true,
    featured5: 'raijin',
    featured4: ['lumen', 'coral', 'rime'],
  },
  {
    id: 'templar',
    name: 'Order of the Templar',
    description: 'Varek, the Knight Templar, answers the call. Varek has a boosted drop rate, and losing a 50/50 guarantees him next time.',
    limited: true,
    active: true,
    featured5: 'varek',
    featured4: ['roland', 'celeste', 'kael'],
  },
  {
    id: 'standard',
    name: "Wanderer's Wish",
    description: 'The permanent banner. Every standard character can appear.',
    limited: false,
    active: true,
    featured5: null,
    featured4: [],
  },
];

const reward = (gems: number, gold = 0, stardust = 0, mats: Record<string, number> = {}) => ({
  gems,
  gold,
  stardust,
  materials: Object.entries(mats).map(([id, count]) => ({ id, count })),
});
const missions: MissionDef[] = [
  { id: 'first-steps', name: 'First Steps', description: 'Clear stage 1-1.', kind: 'clearStage', target: '1-1', count: 1, repeat: 'once', active: true, reward: reward(300), points: 0 },
  { id: 'meadow-hero', name: 'Hero of the Meadow', description: 'Defeat the Abyssal Kraken in 1-4.', kind: 'clearStage', target: '1-4', count: 1, repeat: 'once', active: true, reward: reward(800, 1000), points: 0 },
  { id: 'peak-conqueror', name: 'Peak Conqueror', description: 'Defeat the Ashen Wyrm in 2-4.', kind: 'clearStage', target: '2-4', count: 1, repeat: 'once', active: true, reward: reward(1200, 2000), points: 0 },
  { id: 'winter-ends', name: 'Winter Ends', description: 'Defeat the Frost Lich in 3-4.', kind: 'clearStage', target: '3-4', count: 1, repeat: 'once', active: true, reward: reward(1600, 3000), points: 0 },
  { id: 'collector-10', name: 'Growing Party', description: 'Own 10 different heroes.', kind: 'collect', target: null, count: 10, repeat: 'once', active: true, reward: reward(500), points: 0 },
  { id: 'collector-20', name: 'Grand Collection', description: 'Own 20 different heroes.', kind: 'collect', target: null, count: 20, repeat: 'once', active: true, reward: reward(1000, 0, 50), points: 0 },
  { id: 'veteran', name: 'Veteran', description: 'Win 50 battles.', kind: 'winBattles', target: null, count: 50, repeat: 'once', active: true, reward: reward(1000), points: 0 },
  { id: 'daily-checkin', name: 'Daily Check-in', description: 'Claim your daily supplies.', kind: 'claimDaily', target: null, count: 1, repeat: 'daily', active: true, reward: reward(50), points: 10 },
  { id: 'daily-battles', name: 'Daily Skirmishes', description: 'Win 3 battles today.', kind: 'winBattles', target: null, count: 3, repeat: 'daily', active: true, reward: reward(150, 300, 0, { 'skill-tome': 1 }), points: 20 },
  { id: 'daily-summon', name: 'Daily Wish', description: 'Summon 5 times today.', kind: 'summon', target: null, count: 5, repeat: 'daily', active: true, reward: reward(120), points: 15 },
  { id: 'daily-arena', name: 'Arena Duelist', description: 'Win 2 arena battles today.', kind: 'arenaWins', target: null, count: 2, repeat: 'daily', active: true, reward: reward(100), points: 20 },
  { id: 'daily-forge', name: 'Daily Forge', description: 'Upgrade gear 3 times today.', kind: 'upgradeGear', target: null, count: 3, repeat: 'daily', active: true, reward: reward(50, 200), points: 15 },
  { id: 'arena-champion', name: 'Arena Champion', description: 'Win 20 arena battles.', kind: 'arenaWins', target: null, count: 20, repeat: 'once', active: true, reward: reward(800), points: 0 },
  { id: 'master-smith', name: 'Master Smith', description: 'Upgrade gear 30 times.', kind: 'upgradeGear', target: null, count: 30, repeat: 'once', active: true, reward: reward(500, 0, 20), points: 0 },
  { id: 'first-ascension', name: 'Rising Star', description: 'Ascend a hero for the first time.', kind: 'ascend', target: null, count: 1, repeat: 'once', active: true, reward: reward(300, 0, 0, { 'star-crystal': 1 }), points: 0 },
  { id: 'ascension-master', name: 'Ascension Master', description: 'Ascend heroes 10 times.', kind: 'ascend', target: null, count: 10, repeat: 'once', active: true, reward: reward(1000, 0, 0, { 'star-crystal': 3 }), points: 0 },
  { id: 'skill-scholar', name: 'Scholar', description: 'Level up skills 5 times.', kind: 'skillUp', target: null, count: 5, repeat: 'once', active: true, reward: reward(400, 0, 0, { 'skill-tome': 2 }), points: 0 },
  { id: 'daily-training', name: 'Daily Training', description: 'Level up heroes 3 times today.', kind: 'levelUp', target: null, count: 3, repeat: 'daily', active: true, reward: reward(0, 400), points: 15 },
  { id: 'storm-breaker', name: 'Storm Breaker', description: 'Defeat the Thunderbird in 4-4.', kind: 'clearStage', target: '4-4', count: 1, repeat: 'once', active: true, reward: reward(1800, 4000), points: 0 },
  { id: 'temple-raider', name: 'Temple Raider', description: "Defeat the Orc Warlord in 5-4.", kind: 'clearStage', target: '5-4', count: 1, repeat: 'once', active: true, reward: reward(2000, 5000), points: 0 },
  { id: 'abyss-walker', name: 'Abyss Walker', description: 'Defeat the Demon Lord in 6-4.', kind: 'clearStage', target: '6-4', count: 1, repeat: 'once', active: true, reward: reward(2500, 6000, 50), points: 0 },
  { id: 'daily-dungeon', name: 'Dungeon Delver', description: 'Win 2 dungeon runs today.', kind: 'dungeonRuns', target: null, count: 2, repeat: 'daily', active: true, reward: reward(100, 500), points: 20 },
  { id: 'dungeon-regular', name: 'Dungeon Regular', description: 'Win 30 dungeon runs.', kind: 'dungeonRuns', target: null, count: 30, repeat: 'once', active: true, reward: reward(800, 0, 0, { 'star-crystal': 2 }), points: 0 },
  { id: 'hard-initiate', name: 'Hardened', description: 'Clear 4 stages on hard mode.', kind: 'hardClears', target: null, count: 4, repeat: 'once', active: true, reward: reward(600, 0, 0, { 'skill-tome': 2 }), points: 0 },
  { id: 'daily-guild', name: 'Guild Spirit', description: 'Attack the guild boss twice today.', kind: 'guildAttacks', target: null, count: 2, repeat: 'daily', active: true, reward: reward(80, 300), points: 20 },
  { id: 'hard-master', name: 'Unbreakable', description: 'Clear 12 stages on hard mode.', kind: 'hardClears', target: null, count: 12, repeat: 'once', active: true, reward: reward(1500, 0, 30, { 'star-crystal': 3 }), points: 0 },
];

// Daily dungeons: one element a day (Mon-Sat), all open on Sunday.
type TierSpec = [enemies: string[], waves: string[][]];
const TIER_INFO = [
  { name: 'Tier I', level: 8, rec: 10, gold: 400, essence: [2, 3] as const, tome: 0, crystal: 0 },
  { name: 'Tier II', level: 22, rec: 25, gold: 1200, essence: [4, 6] as const, tome: 0.3, crystal: 0 },
  { name: 'Tier III', level: 40, rec: 45, gold: 3000, essence: [7, 10] as const, tome: 0.6, crystal: 0.4 },
];
function dungeon(id: string, name: string, emoji: string, element: ElementId, theme: DungeonDef['theme'], day: number, tiers: TierSpec[]): DungeonDef {
  return {
    id,
    name,
    emoji,
    theme,
    days: [day, 0],
    description: `Farm ${element} essence. Open on ${['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'][day]} and Sundays.`,
    tiers: tiers.map(([first, later], i) => {
      const t = TIER_INFO[i]!;
      const drops: StageDef['materialDrops'] = [{ material: `${element}-essence`, min: t.essence[0], max: t.essence[1], chance: 1 }];
      if (t.tome) drops.push({ material: 'skill-tome', min: 1, max: 1, chance: t.tome });
      if (t.crystal) drops.push({ material: 'star-crystal', min: 1, max: 1, chance: t.crystal });
      return { name: t.name, recommendedLevel: t.rec, enemies: lineup(first, t.level), waves: later.map((w) => lineup(w, t.level)), gold: t.gold, materialDrops: drops };
    }),
  };
}
const dungeons: DungeonDef[] = [
  dungeon('ember-forge', 'Ember Forge', '🔥', 'flame', 'ember', 1, [
    [['lava-slime', 'imp', 'imp'], []],
    [['imp', 'demon', 'imp'], [['hellhound', 'demon']]],
    [['demon', 'magma-golem', 'demon'], [['imp', 'wyrm', 'imp']]],
  ]),
  dungeon('tidal-grotto', 'Tidal Grotto', '💧', 'tide', 'deep', 2, [
    [['blob', 'blob', 'blob'], []],
    [['blood-fiend', 'blob', 'blood-fiend'], [['naga', 'siren']]],
    [['naga', 'blood-fiend', 'siren'], [['blob', 'kraken', 'blob']]],
  ]),
  dungeon('sky-nest', 'Sky Nest', '🍃', 'gale', 'storm', 3, [
    [['bat', 'bat', 'bat'], []],
    [['harpy', 'bat', 'harpy'], [['harpy', 'harpy']]],
    [['seraph', 'harpy', 'harpy'], [['bat', 'seraph', 'harpy', 'bat']]],
  ]),
  dungeon('golem-quarry', 'Golem Quarry', '🪨', 'stone', 'meadow', 4, [
    [['orc', 'orc'], []],
    [['black-knight', 'orc', 'shaman'], [['scuttler', 'scuttler']]],
    [['scuttler', 'golem', 'scuttler'], [['minotaur', 'warlord', 'shaman']]],
  ]),
  dungeon('storm-engine', 'Storm Engine', '⚡', 'volt', 'storm', 5, [
    [['eyeball', 'spark', 'wisp'], []],
    [['spark', 'storm-knight', 'spark'], [['wisp', 'wisp']]],
    [['storm-knight', 'wisp', 'storm-knight'], [['spark', 'thunderbird', 'spark']]],
  ]),
  dungeon('glacier-crypt', 'Glacier Crypt', '❄️', 'frost', 'frost', 6, [
    [['skeleton', 'wolf'], []],
    [['skeleton-archer', 'wraith', 'wolf'], [['wolf', 'wolf']]],
    [['wraith', 'wolf', 'wraith'], [['wolf', 'lich', 'wolf']]],
  ]),
];

/** The four heroes new players used to start with: a balanced reference team for tests and balancing. */
export const REFERENCE_TEAM = ['pebble', 'torch', 'aldric', 'puddle'];

const settings: GameSettings = {
  pullCost: 160,
  startingGems: 1600,
  startingGold: 1000,
  dailyGems: 800,
  dailyGold: 500,
  maxTeamSize: 4,
  maxLevel: 60,
  levelCostBase: 20,
  levelCostPerLevel: 15,
  starterCharacters: [],
  stardustPerDupe: { r3: 1, r4: 5, r5: 25 },
  stardustExchangeCost: 25,
  gacha: {
    base5: 0.006,
    softPity5: 74,
    softStep5: 0.06,
    hardPity5: 90,
    base4: 0.051,
    softPity4: 9,
    softStep4: 0.51,
    hardPity4: 10,
  },
  gearMaxLevel: 12,
  gearUpgradeBase: 60,
  gearUpgradePerLevel: 40,
  gearSalvageBase: 40,
  gearInventoryCap: 200,
  arenaTicketsPerDay: 5,
  arenaStartRating: 1000,
  arenaK: 32,
  arenaWinGold: 300,
  arenaWinGems: 20,
  arenaTiers: structuredClone(DEFAULT_ARENA_TIERS),
  progression: structuredClone(DEFAULT_PROGRESSION),
  hardMode: structuredClone(DEFAULT_HARD_MODE),
  dungeonRunsPerDay: 3,
  stamina: structuredClone(DEFAULT_STAMINA),
  unlocks: structuredClone(DEFAULT_UNLOCKS),
  maxSweep: 10,
  playerLevel: structuredClone(DEFAULT_PLAYER_LEVEL),
  loginCalendar: structuredClone(DEFAULT_LOGIN_CALENDAR),
  social: structuredClone(DEFAULT_SOCIAL),
  guild: structuredClone(DEFAULT_GUILD),
  firstSummon: structuredClone(DEFAULT_FIRST_SUMMON),
  activityChests: structuredClone(DEFAULT_ACTIVITY_CHESTS),
  tower: structuredClone(DEFAULT_TOWER),
  reforge: structuredClone(DEFAULT_REFORGE),
};

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
    { name: 'Lantern Path', recommendedLevel: 15, enemies: lineup(['lava-slime', 'ghostfire', 'lava-slime'], 13), waves: [], currencyMin: 8, currencyMax: 12, gold: 600, firstClearGems: 100 },
    { name: 'Haunted Orchard', recommendedLevel: 30, enemies: lineup(['hellhound', 'ghostfire', 'hellhound'], 28), waves: [lineup(['imp', 'demon', 'imp'], 28)], currencyMin: 14, currencyMax: 20, gold: 1200, firstClearGems: 150 },
    { name: 'Moonlit Bonfire', recommendedLevel: 45, enemies: lineup(['ghostfire', 'magma-golem', 'ghostfire'], 42), waves: [lineup(['hellhound', 'wyrm', 'hellhound'], 42)], currencyMin: 24, currencyMax: 32, gold: 2400, firstClearGems: 200 },
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
const events: EventDef[] = [HARVEST_EVENT];

const DEFAULT_CONTENT: ContentBundle = { version: 1, settings, skills, characters, enemies, chapters, stages, banners, missions, gear, gearSets, materials, dungeons, events };

/** A fresh, deep copy of the default content. */
export function createDefaultContent(): ContentBundle {
  return structuredClone(DEFAULT_CONTENT);
}
