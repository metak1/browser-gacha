import { createDefaultContent, DUNGEON_STAMINA, ENEMY_SPRITES, REFERENCE_TEAM } from './defaults';
import { defaultObjectives, defaultPassive, defaultStarRewards } from './passives';
import { DEFAULT_STAMINA } from './schemas';
import type { ContentBundle, EncounterEnemy } from './types';

/** Bump when a new upgrade step is added below. */
export const CONTENT_SCHEMA_VERSION = 29;

/**
 * Brings content saved by an older version of the game up to date by merging
 * in the new default pieces, without touching anything the admin changed.
 * Fields themselves get their defaults from the zod schemas; this handles
 * content that should be *added* (new spells, gear, missions...).
 */
export function upgradeContent(bundle: ContentBundle, fromVersion: number): { bundle: ContentBundle; changed: boolean } {
  let b = structuredClone(bundle);
  let changed = false;

  if (fromVersion < 2) {
    // v2: ultimates, gear and drops, arena/gear missions.
    const d = createDefaultContent();
    const skillIds = new Set(b.skills.map((s) => s.id));
    const addSkill = (id: string) => {
      if (skillIds.has(id)) return true;
      const def = d.skills.find((s) => s.id === id);
      if (!def) return false;
      b.skills.push(def);
      skillIds.add(id);
      return true;
    };
    for (const unit of [...b.characters, ...b.enemies]) {
      if (unit.ultimate) continue;
      const def = [...d.characters, ...d.enemies].find((u) => u.id === unit.id);
      if (def?.ultimate && addSkill(def.ultimate)) {
        unit.ultimate = def.ultimate;
        changed = true;
      }
    }
    if (!b.gear.length) {
      b.gear = d.gear;
      changed = true;
    }
    const gearIds = new Set(b.gear.map((g) => g.id));
    for (const stage of b.stages) {
      const def = d.stages.find((s) => s.id === stage.id);
      if (!stage.drops.length && def) {
        stage.drops = def.drops.filter((x) => gearIds.has(x.gear));
        changed ||= stage.drops.length > 0;
      }
    }
    const missionIds = new Set(b.missions.map((m) => m.id));
    for (const m of d.missions) {
      if ((m.kind === 'arenaWins' || m.kind === 'upgradeGear') && !missionIds.has(m.id)) {
        b.missions.push(m);
        changed = true;
      }
    }
  }

  if (fromVersion < 3) {
    // v3: art. Icons on default spells and gear, sprite heroes/enemies, and stages that use them.
    const d = createDefaultContent();
    const defSkills = new Map(d.skills.map((s) => [s.id, s]));
    for (const s of b.skills) {
      const icon = defSkills.get(s.id)?.icon;
      if (s.icon == null && icon) {
        s.icon = icon;
        changed = true;
      }
    }
    const defGear = new Map(d.gear.map((g) => [g.id, g]));
    for (const g of b.gear) {
      const icon = defGear.get(g.id)?.icon;
      if (g.icon == null && icon) {
        g.icon = icon;
        changed = true;
      }
    }

    // New units, plus the spells they use.
    const skillIds = new Set(b.skills.map((s) => s.id));
    const addUnitSkills = (u: { basic: string; skill: string | null; ultimate: string | null }) => {
      for (const id of [u.basic, u.skill, u.ultimate]) {
        if (id && !skillIds.has(id) && defSkills.has(id)) {
          b.skills.push(defSkills.get(id)!);
          skillIds.add(id);
        }
      }
    };
    const NEW_HEROES = ['aldric'];
    const NEW_ENEMIES = ['orc', 'demon', 'blood-fiend'];
    for (const id of NEW_HEROES) {
      const def = d.characters.find((c) => c.id === id)!;
      if (!b.characters.some((c) => c.id === id)) {
        addUnitSkills(def);
        b.characters.push(def);
        changed = true;
      }
    }
    for (const id of NEW_ENEMIES) {
      const def = d.enemies.find((e) => e.id === id)!;
      if (!b.enemies.some((e) => e.id === id)) {
        addUnitSkills(def);
        b.enemies.push(def);
        changed = true;
      }
    }

    // Swap the new enemies into stages, but only where the lineup is still the v2 default.
    const V2_LINEUPS: Record<string, string[]> = {
      '1-2': ['bat', 'blob', 'bat'],
      '1-3': ['imp', 'bat', 'blob'],
      '2-1': ['imp', 'wolf', 'imp'],
      '2-2': ['wisp', 'golem', 'imp'],
      '3-1': ['wolf', 'wisp', 'wolf'],
      '3-3': ['wolf', 'golem', 'wisp', 'imp'],
    };
    for (const stage of b.stages) {
      const old = V2_LINEUPS[stage.id];
      const def = d.stages.find((s) => s.id === stage.id);
      if (!old || !def || stage.enemies.map((e) => e.id).join() !== old.join()) continue;
      const level = stage.enemies[0]!.level;
      stage.enemies = def.enemies.map((e) => ({ id: e.id, level }));
      changed = true;
    }

    // New players start with the sprite hero, unless the starters were customised.
    if (b.settings.starterCharacters.join() === 'pebble,torch,gusty,puddle') {
      b.settings.starterCharacters = [...d.settings.starterCharacters];
      changed = true;
    }
  }

  if (fromVersion < 4) {
    // v4: progression. Materials, lore, material drops, new missions, higher level ceiling.
    const d = createDefaultContent();
    const have = new Set(b.materials.map((m) => m.id));
    for (const m of d.materials) {
      if (!have.has(m.id)) {
        b.materials.push(m);
        changed = true;
      }
    }
    for (const c of b.characters) {
      const def = d.characters.find((x) => x.id === c.id);
      if (!def) continue;
      if (!c.title && def.title) {
        c.title = def.title;
        changed = true;
      }
      if (!c.lore.length && def.lore.length) {
        c.lore = def.lore;
        changed = true;
      }
    }
    for (const s of b.stages) {
      const def = d.stages.find((x) => x.id === s.id);
      if (def && !s.materialDrops.length && def.materialDrops.length) {
        s.materialDrops = def.materialDrops;
        changed = true;
      }
    }
    const missionIds = new Set(b.missions.map((m) => m.id));
    for (const m of d.missions) {
      if ((m.kind === 'ascend' || m.kind === 'skillUp') && !missionIds.has(m.id)) {
        b.missions.push(m);
        changed = true;
      }
    }
    // The old default ceiling was 40; ascension now goes to 60.
    if (b.settings.maxLevel === 40) {
      b.settings.maxLevel = d.settings.maxLevel;
      changed = true;
    }
  }

  if (fromVersion < 5) {
    // v5: passives, stage objectives (stars) and chapter star chests.
    for (const u of [...b.characters, ...b.enemies]) {
      const def = defaultPassive(u.id);
      if (!u.passive && def) {
        u.passive = def;
        changed = true;
      }
    }
    const bosses = new Set(b.enemies.filter((e) => e.boss).map((e) => e.id));
    for (const s of b.stages) {
      // Content saved before objectives existed parses with just "win".
      if (s.objectives.length === 1 && s.objectives[0]!.kind === 'win') {
        s.objectives = defaultObjectives(s.id, s.enemies.length, s.enemies.some((e) => bosses.has(e.id)));
        changed = true;
      }
    }
    const materialIds = new Set(b.materials.map((m) => m.id));
    for (const c of b.chapters) {
      const max = b.stages.filter((s) => s.chapter === c.id).reduce((n, s) => n + s.objectives.length, 0);
      if (c.starRewards.length) continue;
      c.starRewards = defaultStarRewards(c.id).filter((x) => x.stars <= max && x.reward.materials.every((m) => materialIds.has(m.id)));
      changed ||= c.starRewards.length > 0;
    }
  }

  if (fromVersion < 6) {
    // v6: chapters 4-6 (waves, summoning bosses), new enemies, daily dungeons, hard-mode missions.
    const d = createDefaultContent();
    const skillIds = new Set(b.skills.map((x) => x.id));
    const defSkills = new Map(d.skills.map((x) => [x.id, x]));
    const addSkills = (u: { basic: string; skill: string | null; ultimate: string | null }) => {
      for (const id of [u.basic, u.skill, u.ultimate]) {
        if (id && !skillIds.has(id) && defSkills.has(id)) {
          b.skills.push(defSkills.get(id)!);
          skillIds.add(id);
        }
      }
    };
    const enemyIds = new Set(b.enemies.map((e) => e.id));
    for (const e of d.enemies) {
      if (enemyIds.has(e.id)) continue;
      addSkills(e);
      b.enemies.push(e);
      enemyIds.add(e.id);
      changed = true;
    }
    const chapterIds = new Set(b.chapters.map((c) => c.id));
    const added = new Set<number>();
    for (const c of d.chapters) {
      if (c.id <= 3 || chapterIds.has(c.id)) continue;
      b.chapters.push(c);
      added.add(c.id);
      changed = true;
    }
    const stageIds = new Set(b.stages.map((x) => x.id));
    const gearIds = new Set(b.gear.map((g) => g.id));
    const materialIds = new Set(b.materials.map((m) => m.id));
    for (const st of d.stages) {
      if (!added.has(st.chapter) || stageIds.has(st.id)) continue;
      st.drops = st.drops.filter((x) => gearIds.has(x.gear));
      st.materialDrops = st.materialDrops.filter((x) => materialIds.has(x.material));
      b.stages.push(st);
      changed = true;
    }
    for (const c of b.chapters) {
      if (added.has(c.id)) c.starRewards = c.starRewards.filter((x) => x.reward.materials.every((m) => materialIds.has(m.id)));
    }
    if (!b.dungeons.length) {
      b.dungeons = d.dungeons.map((x) => ({
        ...x,
        tiers: x.tiers.map((t) => ({ ...t, materialDrops: t.materialDrops.filter((m) => materialIds.has(m.material)) })),
      }));
      changed = true;
    }
    const missionIds = new Set(b.missions.map((m) => m.id));
    for (const m of d.missions) {
      if (missionIds.has(m.id)) continue;
      const fresh = m.kind === 'dungeonRuns' || m.kind === 'hardClears' || (m.kind === 'clearStage' && b.stages.some((x) => x.id === m.target) && added.size > 0);
      if (fresh && m.reward.materials.every((x) => materialIds.has(x.id))) {
        b.missions.push(m);
        changed = true;
      }
    }
  }

  if (fromVersion < 7) {
    // v7: full Tiny RPG packs. Sprite heroes and their banner, and sprites for enemies still using the old art.
    const d = createDefaultContent();
    const skillIds = new Set(b.skills.map((x) => x.id));
    const defSkills = new Map(d.skills.map((x) => [x.id, x]));
    for (const id of ['elara', 'varek', 'roland', 'celeste', 'kael', 'fenn']) {
      const def = d.characters.find((c) => c.id === id);
      if (!def || b.characters.some((c) => c.id === id)) continue;
      for (const sid of [def.basic, def.skill, def.ultimate]) {
        if (sid && !skillIds.has(sid) && defSkills.has(sid)) {
          b.skills.push(defSkills.get(sid)!);
          skillIds.add(sid);
        }
      }
      b.characters.push(def);
      changed = true;
    }
    // Only replace art the admin hasn't customised: no sprite, or the stand-in from the free packs.
    const OLD: Record<string, string | null> = { warlord: 'orc', 'demon-lord': 'demon' };
    for (const e of b.enemies) {
      const sprite = ENEMY_SPRITES[e.id];
      if (sprite && (e.sprite === null || e.sprite === OLD[e.id])) {
        e.sprite = sprite;
        changed = true;
      }
    }
    const banner = d.banners.find((x) => x.id === 'templar');
    const ids = new Set(b.characters.map((c) => c.id));
    if (banner && !b.banners.some((x) => x.id === banner.id) && [banner.featured5!, ...banner.featured4].every((id) => ids.has(id))) {
      b.banners.unshift(banner);
      changed = true;
    }
  }

  if (fromVersion < 8) {
    // v8: more sprite enemies, swapped into lineups that are still the v7 defaults.
    const d = createDefaultContent();
    const skillIds = new Set(b.skills.map((x) => x.id));
    const defSkills = new Map(d.skills.map((x) => [x.id, x]));
    for (const id of ['skeleton', 'skeleton-archer', 'hellhound', 'lava-slime', 'minotaur', 'eyeball', 'orc-rider', 'black-knight', 'ghostfire']) {
      const def = d.enemies.find((e) => e.id === id);
      if (!def || b.enemies.some((e) => e.id === id)) continue;
      for (const sid of [def.basic, def.skill, def.ultimate]) {
        if (sid && !skillIds.has(sid) && defSkills.has(sid)) {
          b.skills.push(defSkills.get(sid)!);
          skillIds.add(sid);
        }
      }
      b.enemies.push(def);
      changed = true;
    }
    const ids = (l: { id: string }[]) => l.map((e) => e.id).join();
    /** Replaces enemy ids (keeping levels) when the current lineup is exactly the old one. */
    const swap = (current: EncounterEnemy[], old: string[], next: EncounterEnemy[]) => {
      if (ids(current) !== old.join() || current.length !== next.length) return current;
      changed = true;
      return current.map((e, i) => ({ ...e, id: next[i]!.id }));
    };
    const OLD_STAGES: Record<string, { enemies?: string[]; waves?: string[][] }> = {
      '1-3': { enemies: ['imp', 'orc', 'blob'] },
      '2-1': { enemies: ['imp', 'demon', 'imp'] },
      '2-2': { enemies: ['wisp', 'golem', 'demon'] },
      '3-1': { enemies: ['wolf', 'blood-fiend', 'wolf'] },
      '3-3': { enemies: ['demon', 'golem', 'blood-fiend', 'orc'] },
      '6-2': { waves: [['imp', 'imp', 'seraph']] },
    };
    for (const s of b.stages) {
      const old = OLD_STAGES[s.id];
      const def = d.stages.find((x) => x.id === s.id);
      if (!old || !def) continue;
      if (old.enemies) s.enemies = swap(s.enemies, old.enemies, def.enemies);
      old.waves?.forEach((w, i) => {
        if (s.waves[i] && def.waves[i]) s.waves[i] = swap(s.waves[i]!, w, def.waves[i]!);
      });
    }
    // Dungeon tiers: "dungeon/tier" → [old first wave, old extra waves].
    const OLD_TIERS: Record<string, { enemies?: string[]; waves?: string[][] }> = {
      'ember-forge/0': { enemies: ['imp', 'imp', 'imp'] },
      'ember-forge/1': { waves: [['demon', 'demon']] },
      'golem-quarry/1': { enemies: ['golem', 'orc', 'shaman'] },
      'golem-quarry/2': { waves: [['orc', 'warlord', 'shaman']] },
      'storm-engine/0': { enemies: ['wisp', 'spark', 'wisp'] },
      'glacier-crypt/0': { enemies: ['wolf', 'wolf'] },
      'glacier-crypt/1': { enemies: ['wolf', 'wraith', 'wolf'] },
    };
    for (const dg of b.dungeons) {
      const def = d.dungeons.find((x) => x.id === dg.id);
      dg.tiers.forEach((t, i) => {
        const old = OLD_TIERS[`${dg.id}/${i}`];
        const dt = def?.tiers[i];
        if (!old || !dt) return;
        if (old.enemies) t.enemies = swap(t.enemies, old.enemies, dt.enemies);
        old.waves?.forEach((w, j) => {
          if (t.waves[j] && dt.waves[j]) t.waves[j] = swap(t.waves[j]!, w, dt.waves[j]!);
        });
      });
    }
  }

  if (fromVersion < 9) {
    // v9: the Harvest Moon event (with its hero) and the guild mission.
    const d = createDefaultContent();
    const skillIds = new Set(b.skills.map((x) => x.id));
    const defSkills = new Map(d.skills.map((x) => [x.id, x]));
    const hollow = d.characters.find((c) => c.id === 'hollow');
    if (hollow && !b.characters.some((c) => c.id === 'hollow')) {
      for (const sid of [hollow.basic, hollow.skill, hollow.ultimate]) {
        if (sid && !skillIds.has(sid) && defSkills.has(sid)) {
          b.skills.push(defSkills.get(sid)!);
          skillIds.add(sid);
        }
      }
      b.characters.push(hollow);
      changed = true;
    }
    if (!b.events.length) {
      const enemyIds = new Set(b.enemies.map((e) => e.id));
      const materialIds = new Set(b.materials.map((m) => m.id));
      const ev = structuredClone(d.events[0]!);
      ev.stages = ev.stages.filter((st) => [...st.enemies, ...st.waves.flat()].every((e) => enemyIds.has(e.id)));
      ev.shop = ev.shop.filter((i) => i.reward.materials.every((m) => materialIds.has(m.id)) && (!i.character || b.characters.some((c) => c.id === i.character)));
      if (ev.stages.length) {
        b.events.push(ev);
        changed = true;
      }
    }
    const guildMission = d.missions.find((m) => m.id === 'daily-guild');
    if (guildMission && !b.missions.some((m) => m.id === guildMission.id)) {
      b.missions.push(guildMission);
      changed = true;
    }
  }

  if (fromVersion < 10) {
    // v10: boss mechanics (with their charged spells) and daily activity points.
    const d = createDefaultContent();
    const skillIds = new Set(b.skills.map((s) => s.id));
    const enemyIds = new Set(b.enemies.map((e) => e.id));
    for (const def of d.enemies) {
      const e = b.enemies.find((x) => x.id === def.id);
      if (!def.mechanics || !e || e.mechanics) continue;
      const m = structuredClone(def.mechanics);
      if (m.charge && !skillIds.has(m.charge.skill)) {
        const spell = d.skills.find((s) => s.id === m.charge!.skill);
        if (spell) {
          b.skills.push(spell);
          skillIds.add(spell.id);
        } else m.charge = null;
      }
      if (m.adds && !enemyIds.has(m.adds.unit)) m.adds = null;
      e.mechanics = m;
      changed = true;
    }
    for (const def of d.missions) {
      const m = b.missions.find((x) => x.id === def.id);
      if (m && !m.points && def.points) {
        m.points = def.points;
        changed = true;
      }
    }
  }

  if (fromVersion < 11) {
    // v11: a smoother difficulty curve. Recommended levels now start at 1, enemies sit one
    // level below, and a per-stage stat multiplier does the tuning (budgets follow in v12).
    // Only stages still on their old defaults are touched.
    const d = createDefaultContent();
    for (const def of d.stages) {
      const s = b.stages.find((x) => x.id === def.id);
      const old = OLD_STAGE_LEVELS[def.id];
      if (!s || old === undefined) continue;
      const levels = [...s.enemies, ...s.waves.flat()].map((e) => e.level);
      if (s.recommendedLevel !== old + 2 || levels.some((l) => l !== old) || s.statMult !== 1) continue;
      const newLevel = def.enemies[0]!.level;
      s.enemies = s.enemies.map((e) => ({ ...e, level: newLevel }));
      s.waves = s.waves.map((w) => w.map((e) => ({ ...e, level: newLevel })));
      s.recommendedLevel = def.recommendedLevel;
      s.statMult = def.statMult;
      if (s.gold === 60 + old * 25) s.gold = def.gold;
      changed = true;
    }
  }

  if (fromVersion < 12) {
    // v12: third-star action budgets retuned for the v11 curve. Budgets still on an old
    // default (the per-stage table, or the formula the first star release used) are replaced.
    const d = createDefaultContent();
    const bosses = new Set(b.enemies.filter((e) => e.boss).map((e) => e.id));
    for (const def of d.stages) {
      const s = b.stages.find((x) => x.id === def.id);
      const budget = def.objectives.find((o) => o.kind === 'maxActions');
      if (!s || budget?.kind !== 'maxActions') continue;
      const firstFormula = s.enemies.length * 4 + (s.enemies.some((e) => bosses.has(e.id)) ? 6 : 0);
      const isOldDefault = (v: number) => v !== budget.value && (v === OLD_ACTION_BUDGETS[def.id] || v === firstFormula);
      if (!s.objectives.some((o) => o.kind === 'maxActions' && isOldDefault(o.value))) continue;
      s.objectives = s.objectives.map((o) => (o.kind === 'maxActions' && isOldDefault(o.value) ? { ...o, value: budget.value } : o));
      changed = true;
    }
  }

  if (fromVersion < 13) {
    // v13: gear reforging and its material.
    const stone = createDefaultContent().materials.find((m) => m.id === 'reforge-stone');
    if (stone && !b.materials.some((m) => m.id === stone.id)) {
      b.materials.push(stone);
      changed = true;
    }
  }

  if (fromVersion < 14) {
    // v14: spells that scale with DEF, max HP or SPD. Only spells still on their old defaults change.
    const d = createDefaultContent();
    const shape = (s: { name: string; targeting: string; cooldown: number; effects: unknown }) =>
      JSON.stringify({ name: s.name, targeting: s.targeting, cooldown: s.cooldown, effects: s.effects });
    for (const [id, old] of Object.entries(OLD_V13_SPELLS)) {
      const i = b.skills.findIndex((s) => s.id === id);
      const def = d.skills.find((s) => s.id === id);
      if (i < 0 || !def || shape(b.skills[i]!) !== shape(old)) continue;
      b.skills[i] = { ...b.skills[i]!, name: def.name, targeting: def.targeting, cooldown: def.cooldown, effects: structuredClone(def.effects) };
      changed = true;
    }
  }

  if (fromVersion < 15) {
    // v15: the boots slot. SPD main stats move to boots; new boots join the drop tables.
    const d = createDefaultContent();
    const defGear = new Map(d.gear.map((g) => [g.id, g]));
    for (const g of b.gear) {
      if (g.mainStat !== 'spd' || g.slot === 'boots') continue;
      g.slot = 'boots';
      const def = defGear.get(g.id);
      // The two old SPD charms get their boots names, unless an admin renamed them.
      if (def && OLD_SPD_CHARM_NAMES[g.id] === g.name) Object.assign(g, { name: def.name, emoji: def.emoji, icon: def.icon });
      changed = true;
    }
    for (const def of d.gear) {
      if (def.slot === 'boots' && !b.gear.some((g) => g.id === def.id)) {
        b.gear.push(structuredClone(def));
        changed = true;
      }
    }
    for (const def of d.stages) {
      const s = b.stages.find((x) => x.id === def.id);
      if (s && JSON.stringify(s.drops) === JSON.stringify(OLD_V14_DROPS[def.id]) && JSON.stringify(s.drops) !== JSON.stringify(def.drops)) {
        s.drops = structuredClone(def.drops);
        changed = true;
      }
    }
  }

  if (fromVersion < 16) {
    // v16: random main stats. Default templates still on their old fixed main stat now roll one per drop.
    for (const g of b.gear) {
      const old = OLD_V15_MAINS[g.id];
      if (old && g.mainStat === old.mainStat && g.mainBase === old.mainBase) {
        g.mainStat = null;
        g.mainBase = 0;
        changed = true;
      }
    }
  }

  if (fromVersion < 17) {
    // v17: new players start with no heroes and summon their first team, unless the starters were customised.
    if (b.settings.starterCharacters.join() === REFERENCE_TEAM.join()) {
      b.settings.starterCharacters = [];
      changed = true;
    }
  }

  if (fromVersion < 18) {
    // v18: gear sets.
    const have = new Set(b.gearSets.map((s) => s.id));
    for (const s of createDefaultContent().gearSets) {
      if (!have.has(s.id)) {
        b.gearSets.push(s);
        changed = true;
      }
    }
  }

  if (fromVersion < 19) {
    // v19: icons for the default gear sets, unless an admin already picked one.
    for (const def of createDefaultContent().gearSets) {
      const s = b.gearSets.find((x) => x.id === def.id);
      if (s && s.icon === null) {
        s.icon = def.icon;
        changed = true;
      }
    }
  }

  if (fromVersion < 20) {
    // v20: the Armory, a gear-only dungeon.
    const armory = createDefaultContent().dungeons.find((dg) => dg.id === 'armory');
    const enemyIds = new Set(b.enemies.map((e) => e.id));
    const usable = armory && armory.tiers.every((t) => [...t.enemies, ...t.waves.flat()].every((e) => enemyIds.has(e.id)));
    if (armory && usable && !b.dungeons.some((dg) => dg.id === armory.id)) {
      b.dungeons.push(structuredClone(armory));
      changed = true;
    }
  }

  if (fromVersion < 21) {
    // v21: the Armory's enemy levels were raised to match its recommended levels. Only an
    // Armory still on the first levels (12/27/42/52) changes.
    const def = createDefaultContent().dungeons.find((dg) => dg.id === 'armory');
    const a = b.dungeons.find((dg) => dg.id === 'armory');
    const levels = (dg: typeof a) => dg!.tiers.map((t) => [...t.enemies, ...t.waves.flat()].map((e) => e.level));
    const firstDraft = [12, 27, 42, 52];
    if (def && a && a.tiers.length === def.tiers.length && levels(a).every((ls, i) => ls.every((l) => l === firstDraft[i]))) {
      a.tiers = a.tiers.map((t, i) => ({ ...t, enemies: structuredClone(def.tiers[i]!.enemies), waves: structuredClone(def.tiers[i]!.waves) }));
      changed = true;
    }
  }

  if (fromVersion < 22) {
    // v22: three gear dungeons with two sets and a mechanic each. The Armory becomes the crit-set
    // dungeon if it's still the default one; the Bastion and Windspire are added.
    const d = createDefaultContent();
    const i = b.dungeons.findIndex((dg) => dg.id === 'armory');
    const armory = d.dungeons.find((dg) => dg.id === 'armory')!;
    if (i >= 0 && armoryShape(b.dungeons[i]!) === armoryShape(V21_ARMORY)) {
      b.dungeons[i] = structuredClone(armory);
      changed = true;
    }
    const enemyIds = new Set(b.enemies.map((e) => e.id));
    const setIds = new Set(b.gearSets.map((s) => s.id));
    for (const id of ['bastion', 'windspire']) {
      const def = d.dungeons.find((dg) => dg.id === id)!;
      const usable = def.tiers.every((t) => [...t.enemies, ...t.waves.flat()].every((e) => enemyIds.has(e.id))) && def.sets.every((s) => setIds.has(s));
      if (usable && !b.dungeons.some((dg) => dg.id === id)) {
        b.dungeons.push(structuredClone(def));
        changed = true;
      }
    }
  }

  if (fromVersion < 23) {
    // v23: finish v22 for content an early build of it left behind: an Armory still on the v21
    // shape becomes the crit-set dungeon, and gear dungeons still on their draft line-ups get the
    // tuned ones.
    const d = createDefaultContent();
    for (const id of ['armory', 'bastion', 'windspire']) {
      const i = b.dungeons.findIndex((dg) => dg.id === id);
      const def = d.dungeons.find((dg) => dg.id === id);
      if (i < 0 || !def) continue;
      const cur = b.dungeons[i]!;
      if (id === 'armory' && armoryShape(cur) === armoryShape(V21_ARMORY)) {
        b.dungeons[i] = structuredClone(def);
        changed = true;
      } else if (lineupSignature(cur) === V22_DRAFT_LINEUPS[id] && cur.tiers.length === def.tiers.length) {
        cur.tiers = cur.tiers.map((t, j) => ({ ...t, enemies: structuredClone(def.tiers[j]!.enemies), waves: structuredClone(def.tiers[j]!.waves) }));
        changed = true;
      }
    }
  }

  if (fromVersion < 24) {
    // v24: gear dungeon descriptions no longer tell players what to bring.
    const d = createDefaultContent();
    for (const [id, old] of Object.entries(V23_GEAR_DESCRIPTIONS)) {
      const cur = b.dungeons.find((dg) => dg.id === id);
      const def = d.dungeons.find((dg) => dg.id === id);
      if (cur && def && cur.description === old) {
        cur.description = def.description;
        changed = true;
      }
    }
  }

  if (fromVersion < 25) {
    // v25: dungeons cost stamina instead of having a daily run limit. The field is new, so every
    // tier got the schema's flat default; give tiers their cost by tier (8/12/16/20).
    for (const dg of b.dungeons) {
      dg.tiers.forEach((t, i) => {
        t.stamina = V25_DUNGEON_STAMINA[Math.min(i, V25_DUNGEON_STAMINA.length - 1)]!;
      });
    }
    changed = true;
  }

  if (fromVersion < 26) {
    // v26: every level costs the same stamina: campaign, hard and dungeon tiers alike. Only costs
    // still on their old defaults change.
    const s = b.settings.stamina;
    if (s.campaignCost === 6) s.campaignCost = DEFAULT_STAMINA.campaignCost;
    if (s.hardCost === 12) s.hardCost = DEFAULT_STAMINA.hardCost;
    for (const dg of b.dungeons) {
      dg.tiers.forEach((t, i) => {
        if (t.stamina === V25_DUNGEON_STAMINA[Math.min(i, V25_DUNGEON_STAMINA.length - 1)]) t.stamina = DUNGEON_STAMINA;
      });
    }
    changed = true;
  }

  if (fromVersion < 27) {
    // v27: XP per stamina drops so a campaign win (10 stamina since v26, was 6) still gives the
    // same 60 XP. Only the old default pairing changes.
    const p = b.settings.playerLevel;
    if (b.settings.stamina.campaignCost === 10 && p.xpPerStamina === 10) {
      p.xpPerStamina = 6;
      changed = true;
    }
  }

  if (fromVersion < 28) {
    // v28: max stamina 120 -> 200, so players who check in two or three times a day don't lose
    // regen to a full bar. Only the old default changes.
    if (b.settings.stamina.max === 120) {
      b.settings.stamina.max = DEFAULT_STAMINA.max;
      changed = true;
    }
  }

  if (fromVersion < 29) {
    // v29: medieval landscapes. The Armory moves to the war camp and the Bastion to the ruins,
    // if they're still on their old themes.
    for (const [id, from, to] of [['armory', 'ember', 'camp'], ['bastion', 'frost', 'ruins']] as const) {
      const dg = b.dungeons.find((d) => d.id === id);
      if (dg?.theme === from) {
        dg.theme = to;
        changed = true;
      }
    }
  }

  return { bundle: b, changed };
}

/** Dungeon stamina per run by tier, as v25 set it. */
const V25_DUNGEON_STAMINA = [8, 12, 16, 20];

/** Gear dungeon descriptions as v22 shipped them. */
const V23_GEAR_DESCRIPTIONS: Record<string, string> = {
  armory: 'Crit gear (Precision, Ruin). Its armoured guards shrug off weak hits: bring piercing, DEF Down, or damage that scales with HP or DEF.',
  bastion: 'Survival gear (Vitality, Bulwark). Its undead garrison fights buffed and keeps buffing: bring tanks, healers and Dispel.',
  windspire: 'Tempo gear (Fury, Gale). Its storm-born flyers are fast and strike first: bring speed, taunting tanks and delay.',
};

/** "level:enemy/enemy|wave/wave;..." for a dungeon's tiers, to recognise known line-ups. */
function lineupSignature(dg: { tiers: { enemies: { id: string; level: number }[]; waves: { id: string; level: number }[][] }[] }): string {
  return dg.tiers
    .map((t) => `${t.enemies[0]?.level ?? 0}:${t.enemies.map((e) => e.id).join('/')}|${t.waves.map((w) => w.map((e) => e.id).join('/')).join('+')}`)
    .join(';');
}

/** The line-ups the first build of v22 shipped (before tuning). */
const V22_DRAFT_LINEUPS: Record<string, string> = {
  bastion:
    '17:skeleton/wolf/skeleton|;34:skeleton-archer/wraith/wolf|wolf/wolf;50:wraith/black-knight/wraith|skeleton/wraith/skeleton-archer;60:wraith/magma-golem/wraith|wolf/lich/wolf',
  windspire: '17:bat/harpy/bat|;34:harpy/spark/harpy|bat/bat;50:harpy/seraph/harpy|spark/storm-knight/spark;60:seraph/harpy/seraph|spark/thunderbird/spark',
};

/** JSON with object keys sorted and undefined fields dropped, for order-independent comparison. */
/**
 * A dungeon compared field by field, without the fields added after v21 (mechanic, tier stamina),
 * which parsing fills with defaults. Key order differs between stored (schema order) and default
 * content, so this is canonical.
 */
function armoryShape(dg: { mechanic?: unknown; tiers: object[] }): string {
  return canonical({ ...dg, mechanic: undefined, tiers: dg.tiers.map((t) => ({ ...t, stamina: undefined })) });
}

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

/** The default Armory as of v21 (one dungeon, every set). */
const V21_ARMORY = {"id":"armory","name":"The Armory","emoji":"⚒️","theme":"ember","days":[0,1,2,3,4,5,6],"description":"Gear only. Pick the set you want, win, and every drop belongs to it: random slot, main stat and bonus stats.","sets":[],"tiers":[{"name":"Tier I","recommendedLevel":15,"enemies":[{"id":"orc","level":17},{"id":"black-knight","level":17},{"id":"orc","level":17}],"waves":[],"gold":150,"materialDrops":[],"gearRolls":{"count":2,"r3":6,"r4":4,"r5":0}},{"name":"Tier II","recommendedLevel":30,"enemies":[{"id":"minotaur","level":34},{"id":"black-knight","level":34},{"id":"orc-rider","level":34}],"waves":[[{"id":"orc","level":34},{"id":"orc","level":34},{"id":"orc","level":34}]],"gold":300,"materialDrops":[],"gearRolls":{"count":2,"r3":2,"r4":6.5,"r5":1.5}},{"name":"Tier III","recommendedLevel":45,"enemies":[{"id":"storm-knight","level":50},{"id":"magma-golem","level":50},{"id":"storm-knight","level":50}],"waves":[[{"id":"minotaur","level":50},{"id":"black-knight","level":50},{"id":"minotaur","level":50}]],"gold":500,"materialDrops":[],"gearRolls":{"count":3,"r3":0,"r4":6,"r5":4}},{"name":"Tier IV","recommendedLevel":55,"enemies":[{"id":"black-knight","level":60},{"id":"magma-golem","level":60},{"id":"black-knight","level":60}],"waves":[[{"id":"orc","level":60},{"id":"warlord","level":60},{"id":"orc","level":60}]],"gold":800,"materialDrops":[],"gearRolls":{"count":3,"r3":0,"r4":3,"r5":7}}]};

/** Fixed main stats of the default gear templates before v16. */
const OLD_V15_MAINS: Record<string, { mainStat: string; mainBase: number }> = {"bronze-blade":{"mainStat":"atk","mainBase":18},"runed-saber":{"mainStat":"atk","mainBase":28},"starforged-edge":{"mainStat":"atk","mainBase":42},"leather-vest":{"mainStat":"hp","mainBase":120},"knight-mail":{"mainStat":"hp","mainBase":190},"aegis-of-dawn":{"mainStat":"hp","mainBase":280},"lucky-clover":{"mainStat":"spd","mainBase":3},"moon-pendant":{"mainStat":"atkPct","mainBase":0.06},"warding-amulet":{"mainStat":"defPct","mainBase":0.08},"swift-feather":{"mainStat":"spd","mainBase":6},"heart-locket":{"mainStat":"hpPct","mainBase":0.1},"ranger-boots":{"mainStat":"spd","mainBase":4},"iron-greaves":{"mainStat":"defPct","mainBase":0.08},"pilgrim-treads":{"mainStat":"hpPct","mainBase":0.07},"warlord-sabatons":{"mainStat":"atkPct","mainBase":0.09}};

const OLD_SPD_CHARM_NAMES: Record<string, string> = { 'lucky-clover': 'Lucky Clover', 'swift-feather': 'Swift Feather' };

/** Default stage drop tables before v15 (no boots). */
const OLD_V14_DROPS: Record<string, unknown> = {"1-1":[{"gear":"bronze-blade","chance":0.35},{"gear":"leather-vest","chance":0.35},{"gear":"lucky-clover","chance":0.25}],"1-2":[{"gear":"bronze-blade","chance":0.35},{"gear":"leather-vest","chance":0.35},{"gear":"lucky-clover","chance":0.25}],"1-3":[{"gear":"bronze-blade","chance":0.35},{"gear":"leather-vest","chance":0.35},{"gear":"lucky-clover","chance":0.25}],"1-4":[{"gear":"runed-saber","chance":0.3},{"gear":"knight-mail","chance":0.3},{"gear":"moon-pendant","chance":0.2}],"2-1":[{"gear":"runed-saber","chance":0.25},{"gear":"knight-mail","chance":0.25},{"gear":"lucky-clover","chance":0.3},{"gear":"moon-pendant","chance":0.15}],"2-2":[{"gear":"runed-saber","chance":0.25},{"gear":"knight-mail","chance":0.25},{"gear":"lucky-clover","chance":0.3},{"gear":"moon-pendant","chance":0.15}],"2-3":[{"gear":"runed-saber","chance":0.25},{"gear":"knight-mail","chance":0.25},{"gear":"lucky-clover","chance":0.3},{"gear":"moon-pendant","chance":0.15}],"2-4":[{"gear":"starforged-edge","chance":0.12},{"gear":"aegis-of-dawn","chance":0.12},{"gear":"runed-saber","chance":0.4},{"gear":"warding-amulet","chance":0.3}],"3-1":[{"gear":"runed-saber","chance":0.3},{"gear":"knight-mail","chance":0.3},{"gear":"warding-amulet","chance":0.25},{"gear":"swift-feather","chance":0.06}],"3-2":[{"gear":"runed-saber","chance":0.3},{"gear":"knight-mail","chance":0.3},{"gear":"warding-amulet","chance":0.25},{"gear":"swift-feather","chance":0.06}],"3-3":[{"gear":"runed-saber","chance":0.3},{"gear":"knight-mail","chance":0.3},{"gear":"warding-amulet","chance":0.25},{"gear":"swift-feather","chance":0.06}],"3-4":[{"gear":"starforged-edge","chance":0.25},{"gear":"aegis-of-dawn","chance":0.25},{"gear":"swift-feather","chance":0.2},{"gear":"heart-locket","chance":0.2}],"4-1":[{"gear":"runed-saber","chance":0.3},{"gear":"knight-mail","chance":0.3},{"gear":"warding-amulet","chance":0.25},{"gear":"moon-pendant","chance":0.2},{"gear":"swift-feather","chance":0.08},{"gear":"starforged-edge","chance":0.06}],"4-2":[{"gear":"runed-saber","chance":0.3},{"gear":"knight-mail","chance":0.3},{"gear":"warding-amulet","chance":0.25},{"gear":"moon-pendant","chance":0.2},{"gear":"swift-feather","chance":0.08},{"gear":"starforged-edge","chance":0.06}],"4-3":[{"gear":"runed-saber","chance":0.3},{"gear":"knight-mail","chance":0.3},{"gear":"warding-amulet","chance":0.25},{"gear":"moon-pendant","chance":0.2},{"gear":"swift-feather","chance":0.08},{"gear":"starforged-edge","chance":0.06}],"4-4":[{"gear":"starforged-edge","chance":0.3},{"gear":"aegis-of-dawn","chance":0.3},{"gear":"swift-feather","chance":0.25},{"gear":"heart-locket","chance":0.25}],"5-1":[{"gear":"runed-saber","chance":0.3},{"gear":"knight-mail","chance":0.3},{"gear":"warding-amulet","chance":0.25},{"gear":"moon-pendant","chance":0.2},{"gear":"swift-feather","chance":0.08},{"gear":"starforged-edge","chance":0.06}],"5-2":[{"gear":"runed-saber","chance":0.3},{"gear":"knight-mail","chance":0.3},{"gear":"warding-amulet","chance":0.25},{"gear":"moon-pendant","chance":0.2},{"gear":"swift-feather","chance":0.08},{"gear":"starforged-edge","chance":0.06}],"5-3":[{"gear":"runed-saber","chance":0.3},{"gear":"knight-mail","chance":0.3},{"gear":"warding-amulet","chance":0.25},{"gear":"moon-pendant","chance":0.2},{"gear":"swift-feather","chance":0.08},{"gear":"starforged-edge","chance":0.06}],"5-4":[{"gear":"starforged-edge","chance":0.3},{"gear":"aegis-of-dawn","chance":0.3},{"gear":"swift-feather","chance":0.25},{"gear":"heart-locket","chance":0.25}],"6-1":[{"gear":"runed-saber","chance":0.3},{"gear":"knight-mail","chance":0.3},{"gear":"warding-amulet","chance":0.25},{"gear":"moon-pendant","chance":0.2},{"gear":"swift-feather","chance":0.08},{"gear":"starforged-edge","chance":0.06}],"6-2":[{"gear":"runed-saber","chance":0.3},{"gear":"knight-mail","chance":0.3},{"gear":"warding-amulet","chance":0.25},{"gear":"moon-pendant","chance":0.2},{"gear":"swift-feather","chance":0.08},{"gear":"starforged-edge","chance":0.06}],"6-3":[{"gear":"runed-saber","chance":0.3},{"gear":"knight-mail","chance":0.3},{"gear":"warding-amulet","chance":0.25},{"gear":"moon-pendant","chance":0.2},{"gear":"swift-feather","chance":0.08},{"gear":"starforged-edge","chance":0.06}],"6-4":[{"gear":"starforged-edge","chance":0.3},{"gear":"aegis-of-dawn","chance":0.3},{"gear":"swift-feather","chance":0.25},{"gear":"heart-locket","chance":0.25}]};

/** Default definitions (before v14) of the spells that moved to DEF/HP/SPD scaling. */
const OLD_V13_SPELLS: Record<string, { name: string; targeting: string; cooldown: number; effects: unknown }> = {"gaia-skill":{"name":"Earthen Bulwark","targeting":"none","cooldown":4,"effects":[{"kind":"shield","to":"allAllies","mult":2.2},{"kind":"status","to":"self","status":"taunt","turns":2}]},"gaia-ult":{"name":"World Pillar","targeting":"none","cooldown":0,"effects":[{"kind":"shield","to":"allAllies","mult":3},{"kind":"status","to":"allAllies","status":"defUp","turns":3},{"kind":"status","to":"self","status":"taunt","turns":2}]},"pebble-ult":{"name":"Mountain Stance","targeting":"none","cooldown":0,"effects":[{"kind":"shield","to":"self","mult":2},{"kind":"status","to":"self","status":"defUp","turns":3},{"kind":"status","to":"self","status":"taunt","turns":2}]},"drip-skill":{"name":"Shell Up","targeting":"none","cooldown":3,"effects":[{"kind":"shield","to":"self","mult":1.8},{"kind":"status","to":"self","status":"taunt","turns":2}]},"drip-ult":{"name":"Iron Shell","targeting":"none","cooldown":0,"effects":[{"kind":"shield","to":"self","mult":2.5},{"kind":"status","to":"self","status":"taunt","turns":2}]},"bramble-skill":{"name":"Prickly Guard","targeting":"none","cooldown":3,"effects":[{"kind":"status","to":"self","status":"taunt","turns":2},{"kind":"status","to":"self","status":"defUp","turns":2},{"kind":"shield","to":"self","mult":1.5}]},"bramble-ult":{"name":"Thorn Fortress","targeting":"none","cooldown":0,"effects":[{"kind":"shield","to":"self","mult":2.5},{"kind":"status","to":"self","status":"taunt","turns":3},{"kind":"status","to":"self","status":"defUp","turns":3}]},"roland-skill":{"name":"Shield Wall","targeting":"none","cooldown":4,"effects":[{"kind":"status","to":"self","status":"taunt","turns":2},{"kind":"status","to":"self","status":"defUp","turns":2}]},"varek-skill":{"name":"Bulwark of Faith","targeting":"none","cooldown":4,"effects":[{"kind":"shield","to":"allAllies","mult":1.2},{"kind":"status","to":"self","status":"taunt","turns":2}]},"mossy-skill":{"name":"Moss Wrap","targeting":"none","cooldown":3,"effects":[{"kind":"heal","to":"allAllies","mult":1}]},"celeste-skill":{"name":"Prayer","targeting":"none","cooldown":3,"effects":[{"kind":"heal","to":"allAllies","mult":1.4}]},"zephyr-skill":{"name":"Skyfall Strike","targeting":"enemy","cooldown":3,"effects":[{"kind":"damage","to":"target","mult":2.8},{"kind":"status","to":"self","status":"spdUp","turns":2}]},"gusty-skill":{"name":"Flutter Flurry","targeting":"none","cooldown":3,"effects":[{"kind":"damage","to":"allEnemies","mult":0.9}]}};

/** Enemy levels of the default stages before v11 (their recommended level was this + 2). */
const OLD_STAGE_LEVELS: Record<string, number> = {
  '1-1': 1, '1-2': 2, '1-3': 3, '1-4': 4, '2-1': 7, '2-2': 9, '2-3': 11, '2-4': 13,
  '3-1': 16, '3-2': 18, '3-3': 20, '3-4': 23, '4-1': 27, '4-2': 29, '4-3': 31, '4-4': 34,
  '5-1': 36, '5-2': 38, '5-3': 40, '5-4': 43, '6-1': 45, '6-2': 47, '6-3': 49, '6-4': 52,
};

/** Third-star action budgets before v11. */
const OLD_ACTION_BUDGETS: Record<string, number> = {
  '1-1': 15, '1-2': 18, '1-3': 20, '1-4': 35, '2-1': 22, '2-2': 35, '2-3': 32, '2-4': 45,
  '3-1': 40, '3-2': 55, '3-3': 60, '3-4': 75, '4-1': 25, '4-2': 65, '4-3': 75, '4-4': 100,
  '5-1': 35, '5-2': 75, '5-3': 90, '5-4': 95, '6-1': 35, '6-2': 75, '6-3': 85, '6-4': 100,
};
