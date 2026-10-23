/**
 * Balance check: auto-battles every stage with a team at several levels and
 * prints win rates and how often the win earns all stars (win% / 3★%).
 * Heroes are ascended to the rank their level needs, like a real player's.
 *
 * Usage: npm run balance [-- teamId,teamId,...] [--hard] [--dungeons] [--calibrate]
 */
import {
  autoBattle,
  buildBattleSetup,
  buildEncounterSetup,
  createDefaultContent,
  evaluateObjectives,
  indexContent,
  minRankForLevel,
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

if (args.includes('--calibrate')) {
  calibrate();
} else if (dungeons) {
  header();
  for (const d of content.bundle.dungeons) {
    d.tiers.forEach((tier, i) =>
      row(`${d.id} ${i + 1}`, tier.recommendedLevel, (seed, level) => buildEncounterSetup(content, seed, members(level), tier), []),
    );
  }
} else {
  header();
  for (const stage of content.stages) {
    const rec = stage.recommendedLevel + (hard ? content.settings.hardMode.levelBonus : 0);
    row(stage.id, rec, (seed, level) => buildBattleSetup(content, seed, members(level), stage, hard), hard ? [] : stage.objectives);
  }
}
