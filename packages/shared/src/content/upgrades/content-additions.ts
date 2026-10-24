import { createDefaultContent, ENEMY_SPRITES } from '../defaults';
import { defaultObjectives, defaultPassive, defaultStarRewards } from '../passives';
import type { EncounterEnemy } from '../types';
import { type ContentUpgrade } from './helpers';

/** Steps v2-v10: new content (ultimates, art, progression, chapters 4-6, sprites, the event, boss mechanics). */
export const ContentAdditions: ContentUpgrade[] = [
  {
    id: 'v2-ultimates-gear-and-drops',
    version: 2,
    run(b) {
      let changed = false;
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
      return changed;
    },
  },
  {
    id: 'v3-art',
    version: 3,
    run(b) {
      let changed = false;
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
      return changed;
    },
  },
  {
    id: 'v4-progression',
    version: 4,
    run(b) {
      let changed = false;
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
      return changed;
    },
  },
  {
    id: 'v5-passives-and-stars',
    version: 5,
    run(b) {
      let changed = false;
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
          s.objectives = defaultObjectives(
            s.id,
            s.enemies.length,
            s.enemies.some((e) => bosses.has(e.id)),
          );
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
      return changed;
    },
  },
  {
    id: 'v6-chapters-4-to-6',
    version: 6,
    run(b) {
      let changed = false;
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
        const fresh =
          m.kind === 'dungeonRuns' || m.kind === 'hardClears' || (m.kind === 'clearStage' && b.stages.some((x) => x.id === m.target) && added.size > 0);
        if (fresh && m.reward.materials.every((x) => materialIds.has(x.id))) {
          b.missions.push(m);
          changed = true;
        }
      }
      return changed;
    },
  },
  {
    id: 'v7-tiny-rpg-sprites',
    version: 7,
    run(b) {
      let changed = false;
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
      return changed;
    },
  },
  {
    id: 'v8-more-sprite-enemies',
    version: 8,
    run(b) {
      let changed = false;
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
      return changed;
    },
  },
  {
    id: 'v9-harvest-moon-event',
    version: 9,
    run(b) {
      let changed = false;
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
        ev.shop = ev.shop.filter(
          (i) => i.reward.materials.every((m) => materialIds.has(m.id)) && (!i.character || b.characters.some((c) => c.id === i.character)),
        );
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
      return changed;
    },
  },
  {
    id: 'v10-boss-mechanics',
    version: 10,
    run(b) {
      let changed = false;
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
      return changed;
    },
  },
];
