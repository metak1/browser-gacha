/**
 * Balance check: auto-battles every stage with a team at several levels and
 * prints win rates and how often the win earns all stars (win% / 3★%).
 * Heroes are ascended to the rank their level needs, like a real player's.
 *
 * Usage: npm run balance [-- teamId,teamId,...] [--hard] [--dungeons] [--calibrate] [--progression]
 */
import {
  autoBattle,
  buildBattleSetup,
  buildEncounterSetup,
  createDefaultContent,
  dungeonMods,
  evaluateObjectives,
  indexContent,
  levelCap,
  levelUpCost,
  nextAscension,
  minRankForLevel,
  playerLevel,
  REFERENCE_TEAM,
  starsEarned,
  type BattleSetup,
  type StageObjective,
} from '../src/index';

// Uses the default content. To test live (edited) content, use the stage simulator in the admin panel.
const content = indexContent(createDefaultContent());
const args = process.argv.slice(2);
const hard = args.includes('--hard');
const dungeons = args.includes('--dungeons');
const team = args.find((a) => !a.startsWith('--'))?.split(',') ?? REFERENCE_TEAM;
const levels = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
const SEEDS = 100;
const prog = content.settings.progression;
const members = (level: number) => team.map((id) => ({ id, level, constellation: 0, ascension: minRankForLevel(prog, level) }));

function header() {
  console.log(`Team: ${team.join(', ')}${hard ? ' — HARD MODE' : ''}  (${SEEDS} seeds per cell, AI on both sides)\n`);
  console.log(['', 'rec', ...levels.map((l) => `lv${l}`)].map((s, i) => (i === 0 ? s.padEnd(16) : s.padStart(8))).join(''));
}

function row(label: string, rec: number, build: (seed: number, level: number) => BattleSetup, objectives: StageObjective[]) {
  const cells = levels.map((level) => {
    let wins = 0;
    let perfect = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const { state, actions } = autoBattle(build(seed, level));
      if (state.outcome !== 'victory') continue;
      wins++;
      if (objectives.length && starsEarned(evaluateObjectives(objectives, state, actions.length), true) === objectives.length) perfect++;
    }
    const w = Math.round((wins / SEEDS) * 100);
    return objectives.length ? `${w}/${Math.round((perfect / SEEDS) * 100)}` : `${w}%`;
  });
  console.log([label.padEnd(16), String(rec).padStart(8), ...cells.map((c) => c.padStart(8))].join(''));
}

/**
 * --calibrate: for each stage, the enemy stat multiplier at which the team at the
 * stage's recommended level wins about 85% of auto-battles (65% on bosses).
 * Paste the result into STAGE_TUNING in content/defaults.ts.
 */
function calibrate() {
  const target = (boss: boolean) => (boss ? 0.65 : 0.85);
  const seeds = 40;
  const result: Record<string, number> = {};
  for (const stage of content.stages) {
    const boss = [...stage.enemies, ...stage.waves.flat()].some((e) => content.enemiesById[e.id]?.boss);
    const rate = (mult: number) => {
      let wins = 0;
      for (let seed = 1; seed <= seeds; seed++) {
        const setup = buildBattleSetup(content, seed, members(stage.recommendedLevel), { ...stage, statMult: mult });
        if (autoBattle(setup).state.outcome === 'victory') wins++;
      }
      return wins / seeds;
    };
    // Win rate falls as the multiplier grows: bisect for the highest one that still meets the target.
    let lo = 0.3;
    let hi = 4;
    for (let i = 0; i < 9; i++) {
      const mid = (lo + hi) / 2;
      if (rate(mid) >= target(boss)) lo = mid;
      else hi = mid;
    }
    // Chapter 1 is the onboarding: never make it harder than the base stats.
    // Rounded down to 0.05: a step up can cost a boss 20 points of win rate.
    const mult = Math.floor((stage.chapter === 1 ? Math.min(1, lo) : lo) * 20) / 20;
    result[stage.id] = mult;
    console.log(`${stage.id.padEnd(6)} rec ${String(stage.recommendedLevel).padStart(2)}  ×${mult.toFixed(2)}  win ${Math.round(rate(mult) * 100)}%`);
  }
  console.log(`\nexport const STAGE_TUNING: Record<string, number> = ${JSON.stringify(result).replace(/,/g, ', ').replace(/:/g, ': ')};`);

  // Third-star action budgets: about the 40th percentile of actions in wins, five levels above recommended.
  const budgets: Record<string, number> = {};
  for (const stage of content.stages) {
    const tuned = { ...stage, statMult: result[stage.id]! };
    const counts: number[] = [];
    for (let seed = 1; seed <= seeds * 2; seed++) {
      const { state, actions } = autoBattle(buildBattleSetup(content, seed, members(stage.recommendedLevel + 5), tuned));
      if (state.outcome === 'victory') counts.push(actions.length);
    }
    counts.sort((a, b) => a - b);
    budgets[stage.id] = Math.ceil((counts[Math.floor(counts.length * 0.4)] ?? 100) / 5) * 5;
  }
  console.log(`\nACTION_BUDGETS (content/passives.ts): ${JSON.stringify(budgets).replace(/,/g, ', ').replace(/:/g, ': ')}`);
}

/**
 * --progression: a day-by-day model of a free player on the campaign, to see how stamina pacing
 * plays out. The team (4 heroes) moves as one: each run goes to the next stage once the team is at
 * its recommended level (losses refund, so a clear costs one run); otherwise it farms what the team
 * lacks: gold to level up, or essence, crystals and gold to ascend past a level cap. Farming picks
 * the cleared stage or dungeon tier that gives the most of it per stamina. Income also counts daily
 * mission gold and the stamina account level-ups pay. Essence is pooled across elements and spare
 * gold buys it from the shop. Not modelled: gem refills, events, the arena and gear.
 */
function progression() {
  const s = content.settings;
  const dailyGold = content.bundle.missions.filter((m) => m.active && m.repeat === 'daily').reduce((n, m) => n + m.reward.gold, 0);
  const essencePrice = prog.shop.find((x) => x.material.endsWith('-essence'))?.gold ?? 0;
  const expect = (drops: { material: string; min: number; max: number; chance: number }[], test: (id: string) => boolean) =>
    drops.filter((d) => test(d.material)).reduce((n, d) => n + (d.chance * (d.min + d.max)) / 2, 0);
  type Source = { gold: number; essence: number; crystals: number; rec: number; dungeon: boolean; stamina: number };
  const fromStage = (st: (typeof content.stages)[number], cost: number): Source => ({
    gold: st.gold,
    essence: expect(st.materialDrops, (id) => id.endsWith('-essence')),
    crystals: expect(st.materialDrops, (id) => id === prog.crystal),
    rec: st.recommendedLevel,
    dungeon: false,
    stamina: cost,
  });
  const essenceDungeons = content.bundle.dungeons.filter((d) => !d.tiers.some((t) => t.gearRolls));

  const now = {
    cost: s.stamina.campaignCost,
    xpPer: s.playerLevel.xpPerStamina,
    regenMin: s.stamina.regenMinutes,
    max: s.stamina.max,
    dungeonCost: null as number | null,
  };
  const variants = [
    { ...now, name: 'old: ⚡6, 10 XP/⚡, 3 free dg runs', cost: 6, xpPer: 10, dungeonCost: 0 },
    { ...now, name: `now: ⚡${now.cost} everything, ${now.xpPer} XP/⚡` },
    { ...now, name: 'now + regen every 4 min', regenMin: 4 },
    { ...now, name: 'now + regen every 3 min', regenMin: 3 },
    { ...now, name: 'now + 200 max stamina', max: 200 },
  ];
  const stages = content.stages;
  const chapters = [...new Set(stages.map((st) => st.chapter))];
  const lastOf = new Map(chapters.map((ch) => [ch, stages.filter((st) => st.chapter === ch).at(-1)!.id]));
  const unlockAt = s.unlocks.dungeons;

  for (const sessions of [3, 2]) {
    console.log(`\nDays to finish each chapter, ${sessions} play sessions a day (+${dailyGold} gold a day from daily missions)\n`);
    console.log(['', ...chapters.map((ch) => `ch${ch}`), 'team'].map((c, i) => (i === 0 ? c.padEnd(34) : c.padStart(6))).join(''));
    for (const v of variants) {
      const p = { ...s.playerLevel, xpPerStamina: v.xpPer };
      let stamina = v.max;
      let gold = 0;
      let essence = 0;
      let crystals = 0;
      let xp = 0;
      let level = 1;
      let rank = 0;
      let next = 0;
      let dungeonsOpen = !unlockAt;
      const done = new Map<number, number>();
      const regenPerSession = Math.floor((24 * 60) / sessions / v.regenMin);
      const gain = (src: Source, runXp: number) => {
        gold += src.gold;
        essence += src.essence;
        crystals += src.crystals;
        const before = playerLevel(p, xp).level;
        xp += runXp;
        stamina += (playerLevel(p, xp).level - before) * p.rewardStamina;
      };
      // Level up and ascend the whole team as far as resources allow.
      const spend = () => {
        for (;;) {
          const cap = levelCap(prog, rank, s.maxLevel);
          if (level < cap && gold >= 4 * levelUpCost(s, level)) {
            gold -= 4 * levelUpCost(s, level);
            level++;
            continue;
          }
          const step = nextAscension(prog, rank);
          if (level < cap || !step) return;
          // Spare gold buys missing essence.
          while (essence < 4 * step.essence && essencePrice > 0 && gold >= 4 * step.gold + essencePrice) {
            gold -= essencePrice;
            essence++;
          }
          if (gold < 4 * step.gold || essence < 4 * step.essence || crystals < 4 * step.crystals) return;
          gold -= 4 * step.gold;
          essence -= 4 * step.essence;
          crystals -= 4 * step.crystals;
          rank++;
        }
      };
      const sources = (): Source[] => [
        ...stages.slice(0, next).map((st) => fromStage(st, v.cost)),
        ...(dungeonsOpen
          ? essenceDungeons.flatMap((d) =>
              d.tiers
                .filter((t) => t.recommendedLevel <= level)
                .map((t) => ({
                  gold: t.gold,
                  essence: expect(t.materialDrops, (id) => id.endsWith('-essence')),
                  crystals: expect(t.materialDrops, (id) => id === prog.crystal),
                  rec: t.recommendedLevel,
                  dungeon: true,
                  stamina: v.dungeonCost ?? t.stamina,
                })),
            )
          : []),
      ];
      // What the team is short of right now, most limiting first.
      const want = (): 'gold' | 'essence' | 'crystals' => {
        const step = nextAscension(prog, rank);
        if (level < levelCap(prog, rank, s.maxLevel) || !step) return 'gold';
        if (crystals < 4 * step.crystals) return 'crystals';
        if (essence < 4 * step.essence && gold >= 4 * step.gold + essencePrice) return 'gold'; // can buy it
        if (essence < 4 * step.essence) return 'essence';
        return 'gold';
      };
      const bestFor = (list: Source[], key: 'gold' | 'essence' | 'crystals') =>
        list.reduce<Source | null>((top, x) => (x[key] / Math.max(1, x.stamina) > (top ? top[key] / Math.max(1, top.stamina) : 0) ? x : top), null);

      for (let day = 1; day <= 180 && next < stages.length; day++) {
        gold += dailyGold;
        // Old rules: 3 free runs per open essence dungeon a day (one element a day, all six on Sundays).
        if (v.dungeonCost === 0 && dungeonsOpen) {
          const runs = 3 * (day % 7 === 0 ? essenceDungeons.length : 1);
          for (let i = 0; i < runs; i++) {
            const src =
              bestFor(
                sources().filter((x) => x.dungeon),
                want(),
              ) ??
              bestFor(
                sources().filter((x) => x.dungeon),
                'essence',
              );
            if (src) gain(src, 50); // old rules: a flat 50 XP per dungeon win
            spend();
          }
        }
        for (let session = 0; session < sessions; session++) {
          if (day > 1 || session > 0) stamina = Math.min(v.max, stamina + regenPerSession);
          for (let guard = 0; guard < 500 && next < stages.length; guard++) {
            const stage = stages[next]!;
            const pool = sources().filter((x) => !(v.dungeonCost === 0 && x.dungeon));
            const clearing = level >= stage.recommendedLevel;
            const pick: Source | null = clearing ? fromStage(stage, v.cost) : (bestFor(pool, want()) ?? bestFor(pool, 'gold'));
            if (!pick || stamina < pick.stamina) break;
            stamina -= pick.stamina;
            gain(pick, pick.stamina * v.xpPer);
            if (clearing) {
              next++;
              if (stage.id === unlockAt) dungeonsOpen = true;
              // When in the day it happened, as a fraction of days played.
              if (lastOf.get(stage.chapter) === stage.id) done.set(stage.chapter, day - 1 + (session + 1) / sessions);
            }
            spend();
          }
        }
      }
      const cells = chapters.map((ch) => (done.has(ch) ? done.get(ch)!.toFixed(1) : '—'));
      console.log([v.name.padEnd(34), ...cells.map((c) => c.padStart(6)), `lv${level}`.padStart(6)].join(''));
    }
  }
  console.log('\n— = not finished within 180 days. "team" is the team level at the end.');
}

if (args.includes('--progression')) {
  progression();
} else if (args.includes('--calibrate')) {
  calibrate();
} else if (dungeons) {
  header();
  for (const d of content.bundle.dungeons) {
    d.tiers.forEach((tier, i) =>
      row(`${d.id} ${i + 1}`, tier.recommendedLevel, (seed, level) => buildEncounterSetup(content, seed, members(level), tier, dungeonMods(d)), []),
    );
  }
} else {
  header();
  for (const stage of content.stages) {
    const rec = stage.recommendedLevel + (hard ? content.settings.hardMode.levelBonus : 0);
    row(stage.id, rec, (seed, level) => buildBattleSetup(content, seed, members(level), stage, hard), hard ? [] : stage.objectives);
  }
}
