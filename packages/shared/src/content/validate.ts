import { TOWER_CHALLENGES } from '../tower';
import { BOOTS_ONLY_MAIN, isPercentStat, MAIN_POOLS } from '../gear';
import { z } from 'zod';
import { bundleSchema } from './schemas';
import { DERIVED_MISSION_KINDS, type ContentBundle } from './types';

function duplicates<T>(values: T[]): T[] {
  const seen = new Set<T>();
  const dupes = new Set<T>();
  for (const v of values) (seen.has(v) ? dupes : seen).add(v);
  return [...dupes];
}

/**
 * Checks a whole bundle: shapes (via zod) and every cross-reference between
 * documents. Returns human-readable problems; an empty list means it's valid.
 */
export function validateBundle(bundle: ContentBundle): string[] {
  const parsed = bundleSchema.safeParse(bundle);
  if (!parsed.success) {
    return parsed.error.issues.map((i) => `${i.path.join('/')}: ${i.message}`);
  }
  const b = parsed.data;
  const errors: string[] = [];
  const err = (where: string, msg: string) => errors.push(`${where}: ${msg}`);

  for (const [kind, list] of [
    ['skills', b.skills],
    ['characters', b.characters],
    ['enemies', b.enemies],
    ['chapters', b.chapters],
    ['stages', b.stages],
    ['banners', b.banners],
    ['missions', b.missions],
    ['gear', b.gear],
    ['gearSets', b.gearSets],
    ['materials', b.materials],
    ['dungeons', b.dungeons],
    ['events', b.events],
  ] as const) {
    for (const d of duplicates(list.map((x) => x.id))) err(kind, `duplicate id "${d}"`);
  }

  for (const s of b.skills) {
    if (s.targeting === 'none' && s.effects.some((e) => e.to === 'target')) {
      err(`skills/${s.id}`, `an effect aims at "the target", but this spell doesn't pick one (targeting is "none")`);
    }
  }

  const enemyIds = new Set(b.enemies.map((e) => e.id));
  for (const s of b.skills) {
    for (const e of s.effects) {
      if (e.kind === 'summon' && !enemyIds.has(e.unit)) err(`skills/${s.id}`, `summons unknown enemy "${e.unit}"`);
    }
  }

  const skills = new Set(b.skills.map((s) => s.id));
  const chars = new Map(b.characters.map((c) => [c.id, c]));
  const enemies = new Set(b.enemies.map((e) => e.id));
  const chapters = new Set(b.chapters.map((c) => c.id));
  const stages = new Set(b.stages.map((s) => s.id));
  const gearIds = new Set(b.gear.map((g) => g.id));
  const materialIds = new Set(b.materials.map((m) => m.id));
  const checkReward = (where: string, r: { materials: { id: string }[] }) => {
    for (const m of r.materials) if (!materialIds.has(m.id)) err(where, `rewards unknown material "${m.id}"`);
  };

  const setIds = new Set(b.gearSets.map((s) => s.id));
  for (const g of b.gear) if (g.set && !setIds.has(g.set)) err(`gear/${g.id}`, `belongs to unknown gear set "${g.set}"`);
  for (const s of b.gearSets) {
    for (const bonus of s.bonuses) {
      if (isPercentStat(bonus.stat) && bonus.value > 1) err(`gearSets/${s.id}`, 'percent bonuses are fractions (0.1 = 10%), so they must be at most 1');
    }
  }

  for (const g of b.gear) {
    if (!g.mainStat) continue;
    if (isPercentStat(g.mainStat) && g.mainBase > 1) err(`gear/${g.id}`, 'percent main stats are fractions (0.06 = 6%), so they must be at most 1');
  }

  for (const u of [...b.characters.map((c) => ['characters', c] as const), ...b.enemies.map((e) => ['enemies', e] as const)]) {
    const [kind, unit] = u;
    if (!skills.has(unit.basic)) err(`${kind}/${unit.id}`, `basic attack uses unknown spell "${unit.basic}"`);
    if (unit.skill && !skills.has(unit.skill)) err(`${kind}/${unit.id}`, `skill uses unknown spell "${unit.skill}"`);
    if (unit.ultimate && !skills.has(unit.ultimate)) err(`${kind}/${unit.id}`, `ultimate uses unknown spell "${unit.ultimate}"`);
    for (const rule of unit.passive?.rules ?? []) {
      if (rule.kind === 'trigger' && rule.on !== 'hit' && rule.effects.some((e) => e.to === 'target')) {
        err(`${kind}/${unit.id}`, `passive "${rule.on}" trigger aims at "the target", which only exists for "when hit" (the attacker)`);
      }
    }
  }

  for (const dg of b.dungeons) for (const s of dg.sets) if (!setIds.has(s)) err(`dungeons/${dg.id}`, `offers unknown gear set "${s}"`);
  for (const dg of b.dungeons) {
    if (dg.mechanic && !TOWER_CHALLENGES.some((c) => c.id === dg.mechanic)) err(`dungeons/${dg.id}`, `unknown mechanic "${dg.mechanic}"`);
  }

  for (const g of b.gear) {
    if (!g.mainStat) continue;
    if (BOOTS_ONLY_MAIN.includes(g.mainStat) && g.slot !== 'boots') err(`gear/${g.id}`, `${g.mainStat.toUpperCase()} as a main stat is only allowed on boots`);
    else if (!MAIN_POOLS[g.slot].includes(g.mainStat)) err(`gear/${g.id}`, `${g.slot} can't have ${g.mainStat} as a main stat (allowed: ${MAIN_POOLS[g.slot].join(', ')})`);
  }

  for (const e of b.enemies) {
    const m = e.mechanics;
    if (m?.charge && !skills.has(m.charge.skill)) err(`enemies/${e.id}`, `charges unknown spell "${m.charge.skill}"`);
    if (m?.adds && !enemies.has(m.adds.unit)) err(`enemies/${e.id}`, `calls unknown enemy "${m.adds.unit}"`);
    if (m?.adds?.unit === e.id) err(`enemies/${e.id}`, "can't call copies of itself");
  }

  for (const s of b.stages) {
    if (!chapters.has(s.chapter)) err(`stages/${s.id}`, `unknown chapter ${s.chapter}`);
    for (const e of [...s.enemies, ...s.waves.flat()]) if (!enemies.has(e.id)) err(`stages/${s.id}`, `unknown enemy "${e.id}"`);
    for (const d of s.drops) if (!gearIds.has(d.gear)) err(`stages/${s.id}`, `drops unknown gear "${d.gear}"`);
    for (const d of s.materialDrops) {
      if (!materialIds.has(d.material)) err(`stages/${s.id}`, `drops unknown material "${d.material}"`);
      if (d.min > d.max) err(`stages/${s.id}`, `material drop "${d.material}" has min above max`);
    }
  }
  if (!b.stages.length) err('stages', 'the campaign needs at least one stage');
  for (const s of b.stages) {
    for (const d of duplicates(s.objectives.map((o) => o.kind))) err(`stages/${s.id}`, `objective "${d}" is listed twice`);
  }

  for (const c of b.chapters) {
    const where = `chapters/${c.id}`;
    const max = b.stages.filter((s) => s.chapter === c.id).reduce((n, s) => n + Math.max(1, s.objectives.length), 0);
    for (const d of duplicates(c.starRewards.map((x) => x.stars))) err(where, `two star chests need ${d} stars`);
    for (const x of c.starRewards) {
      if (x.stars > max) err(where, `a chest needs ${x.stars} stars but the chapter only has ${max}`);
      checkReward(`${where} chest ${x.stars}★`, x.reward);
    }
  }

  for (const r of [3, 4, 5] as const) {
    if (!b.characters.some((c) => c.rarity === r && !c.limited)) {
      err('characters', `the gacha needs at least one non-limited ★${r} character`);
    }
  }

  for (const banner of b.banners) {
    const where = `banners/${banner.id}`;
    if (banner.featured5) {
      const c = chars.get(banner.featured5);
      if (!c) err(where, `featured ★5 "${banner.featured5}" doesn't exist`);
      else if (c.rarity !== 5) err(where, `featured ★5 "${c.name}" is ★${c.rarity}`);
    }
    for (const id of banner.featured4) {
      const c = chars.get(id);
      if (!c) err(where, `featured ★4 "${id}" doesn't exist`);
      else if (c.rarity !== 4) err(where, `featured ★4 "${c.name}" is ★${c.rarity}`);
    }
  }
  if (!b.banners.some((x) => x.active)) err('banners', 'at least one banner must be active');

  for (const m of b.missions) {
    const where = `missions/${m.id}`;
    checkReward(where, m.reward);
    if (m.kind === 'clearStage') {
      if (!m.target || !stages.has(m.target)) err(where, 'clearStage missions need an existing target stage');
      if (m.count !== 1) err(where, 'clearStage missions must have a count of 1');
    }
    if (DERIVED_MISSION_KINDS.includes(m.kind) && m.repeat === 'daily') {
      err(where, `${m.kind} missions can't repeat daily (they're based on permanent progress)`);
    }
  }

  for (const d of b.dungeons) {
    const where = `dungeons/${d.id}`;
    if (duplicates(d.days).length) err(where, 'a day is listed twice');
    for (const [i, t] of d.tiers.entries()) {
      for (const e of [...t.enemies, ...t.waves.flat()]) if (!enemies.has(e.id)) err(`${where} tier ${i + 1}`, `unknown enemy "${e.id}"`);
      for (const m of t.materialDrops) {
        if (!materialIds.has(m.material)) err(`${where} tier ${i + 1}`, `drops unknown material "${m.material}"`);
        if (m.min > m.max) err(`${where} tier ${i + 1}`, `material drop "${m.material}" has min above max`);
      }
    }
  }

  for (const ev of b.events) {
    const where = `events/${ev.id}`;
    if (ev.end < ev.start) err(where, 'ends before it starts');
    for (const [i, st] of ev.stages.entries()) {
      for (const e of [...st.enemies, ...st.waves.flat()]) if (!enemies.has(e.id)) err(`${where} stage ${i + 1}`, `unknown enemy "${e.id}"`);
      if (st.currencyMin > st.currencyMax) err(`${where} stage ${i + 1}`, 'currency min is above max');
    }
    for (const d of duplicates(ev.shop.map((x) => x.id))) err(where, `two shop items use the id "${d}"`);
    for (const item of ev.shop) {
      checkReward(`${where} shop ${item.id}`, item.reward);
      if (item.character && !chars.has(item.character)) err(`${where} shop ${item.id}`, `sells unknown hero "${item.character}"`);
    }
  }

  const settings = b.settings;
  for (const id of settings.starterCharacters) {
    if (!chars.has(id)) err('settings', `starter character "${id}" doesn't exist`);
  }
  if (settings.starterCharacters.length > settings.maxTeamSize) err('settings', 'more starters than the max team size');
  if (new Set(settings.starterCharacters).size !== settings.starterCharacters.length) err('settings', 'duplicate starter');
  if (settings.gacha.softPity5 > settings.gacha.hardPity5) err('settings', '★5 soft pity must be at or below hard pity');
  if (settings.gacha.softPity4 > settings.gacha.hardPity4) err('settings', '★4 soft pity must be at or below hard pity');
  if (!settings.arenaTiers.some((t) => t.minRating === 0)) err('settings', 'one arena tier must start at rating 0');
  for (const t of settings.arenaTiers) checkReward(`settings/arena tier ${t.name}`, t.reward);

  for (const [feature, stage] of Object.entries(settings.unlocks)) {
    if (stage && !stages.has(stage)) err('settings', `${feature} unlocks on unknown stage "${stage}"`);
  }

  for (const [i, r] of settings.loginCalendar.entries()) checkReward(`settings/login day ${i + 1}`, r);
  if (!b.materials.some((m) => m.id === settings.reforge.material)) err('settings', `reforge material "${settings.reforge.material}" is not a material`);
  for (const boss of settings.guild.bosses) if (!enemies.has(boss.enemy)) err('settings', `guild boss "${boss.enemy}" is not an enemy`);
  for (const t of settings.guild.tiers) checkReward(`settings/guild chest ${t.percent}%`, t.reward);
  for (const d of duplicates(settings.guild.tiers.map((t) => t.percent))) err('settings', `two guild chests open at ${d}%`);

  const prog = settings.progression;
  if (!materialIds.has(prog.crystal)) err('settings', `progression crystal "${prog.crystal}" is not a material`);
  if (!materialIds.has(prog.tome)) err('settings', `progression tome "${prog.tome}" is not a material`);
  for (const e of ['flame', 'tide', 'gale', 'stone', 'volt', 'frost'] as const) {
    if (prog.ascension.some((s) => s.essence > 0) && !b.materials.some((m) => m.element === e)) {
      err('materials', `ascension needs an essence material for the ${e} element`);
    }
  }
  let cap = prog.baseCap;
  for (const [i, s] of prog.ascension.entries()) {
    if (s.cap <= cap) err('settings', `ascension ${i + 1} must raise the level cap (to more than ${cap})`);
    cap = s.cap;
  }
  if (cap > settings.maxLevel) err('settings', `the highest ascension cap (${cap}) is above the max level (${settings.maxLevel})`);
  for (const e of prog.shop) if (!materialIds.has(e.material)) err('settings', `shop sells unknown material "${e.material}"`);
  for (const d of duplicates(settings.arenaTiers.map((t) => t.minRating))) err('settings', `two arena tiers start at ${d}`);

  return errors;
}

export function formatZodError(error: z.ZodError): string {
  return error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; ');
}
