import { dungeonKey, formatGearRoll, isDungeonOpen, isDungeonTierUnlocked, UI_ICONS, type DungeonDef, type GearRolls } from '@gacha/shared';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { TeamSwitcher } from '../components/TeamSwitcher';
import { sfx } from '../audio/sfx';
import { Icon, IconOr } from '../components/Art';
import { LockedFeature, useFeature } from '../components/Locked';
import { Scene } from '../components/Scene';
import { StaminaShort, useLiveStamina } from '../components/Stamina';
import { SweepButtons } from '../components/Sweep';
import { useContent } from '../state/content';
import { useProfile } from '../state/profile';
import './dungeons.css';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The next UTC weekday (from tomorrow) the dungeon opens, for "opens Tuesday". */
function nextOpenDay(d: DungeonDef, today: number): number | null {
  for (let i = 1; i <= 7; i++) {
    const day = (today + i) % 7;
    if (d.days.includes(day)) return day;
  }
  return null;
}

const isGearDungeon = (d: DungeonDef) => d.tiers.some((t) => t.gearRolls);

/** The dungeons page, opened on the tab this dungeon is listed under. */
export const dungeonsPath = (d: DungeonDef | undefined) => (d && !isGearDungeon(d) ? '/dungeons?tab=essence' : '/dungeons');

export function DungeonsScreen() {
  const { unlocked } = useFeature('dungeons');
  return unlocked ? <DungeonList /> : <LockedFeature feature="dungeons" />;
}

function DungeonList() {
  const content = useContent();
  const now = Date.now();
  const today = new Date(now).getUTCDay();
  // Open dungeons first, then by the order they open in.
  const list = [...content.bundle.dungeons].sort((a, b) => Number(isDungeonOpen(b, now)) - Number(isDungeonOpen(a, now)));
  const gear = list.filter(isGearDungeon);
  const essence = list.filter((d) => !isGearDungeon(d));
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'essence' || !gear.length ? 'essence' : 'gear';
  const shown = tab === 'gear' ? gear : essence;
  const openEssence = essence.filter((d) => isDungeonOpen(d, now)).length;

  return (
    <div className="dungeons">
      <div className="panel dungeons-head">
        <div className="page-head">
          <h1>Dungeons</h1>
          <div className="filters">
            {gear.length > 0 && (
              <button className={`chip ${tab === 'gear' ? 'active' : ''}`} onClick={() => setParams({}, { replace: true })}>
                ⚔️ Gear
              </button>
            )}
            {essence.length > 0 && (
              <button className={`chip ${tab === 'essence' ? 'active' : ''}`} onClick={() => setParams({ tab: 'essence' }, { replace: true })}>
                ✨ Essence <small className="muted">{openEssence} open</small>
              </button>
            )}
          </div>
        </div>
        <p className="small dungeons-intro">
          {tab === 'gear'
            ? "Open every day and drop only gear, from each dungeon's two sets at random."
            : `Ascension materials, one element a day and all of them on Sunday. Today is ${DAY_LONG[today]} (UTC).`}{' '}
          Each run costs ⚡ stamina, refunded if you lose. Clear a tier to unlock the next one.
        </p>
      </div>
      {!shown.length && <p className="center muted">No dungeons yet.</p>}
      <div className={`dungeon-grid ${tab}`}>
        {shown.map((d) => (
          <DungeonCard key={d.id} dungeon={d} now={now} today={today} />
        ))}
      </div>
    </div>
  );
}

function DungeonCard({ dungeon, now, today }: { dungeon: DungeonDef; now: number; today: number }) {
  const navigate = useNavigate();
  const content = useContent();
  const { profile } = useProfile();
  const stamina = useLiveStamina();
  const open = isDungeonOpen(dungeon, now);
  const next = open ? null : nextOpenDay(dungeon, today);
  const gearDungeon = dungeon.tiers.some((t) => t.gearRolls);

  return (
    <section className={`dungeon ${open ? 'open' : 'closed'}`}>
      <div className="dungeon-banner">
        <Scene theme={dungeon.theme} weather={0.3} />
        <div className="dungeon-title">
          <span className="dungeon-emoji">{dungeon.emoji}</span>
          <div>
            <h2>{dungeon.name}</h2>
            <div className="dungeon-days">
              {DAY_SHORT.map((label, day) => (
                <span key={day} className={`day ${dungeon.days.includes(day) ? 'on' : ''} ${day === today ? 'today' : ''}`}>
                  {label}
                </span>
              ))}
            </div>
          </div>
          <span className={`dungeon-status ${open ? 'ok' : ''}`}>
            {open ? (gearDungeon ? 'Always open' : 'Open today') : next !== null ? `Opens ${DAY_LONG[next]}` : 'Closed'}
          </span>
        </div>
      </div>
      {dungeon.description && <p className="small muted dungeon-desc">{dungeon.description}</p>}
      {gearDungeon && <DungeonSets dungeon={dungeon} />}
      {open && (
        <div className="dungeon-team">
          <TeamSwitcher />
        </div>
      )}
      <div className="tiers">
        {dungeon.tiers.map((t, i) => {
          const unlocked = isDungeonTierUnlocked(dungeon.id, i, profile.clearedStages);
          const cleared = profile.clearedStages.includes(dungeonKey(dungeon.id, i));
          const foes = [...t.enemies, ...t.waves.flat()];
          const canPay = stamina.current >= t.stamina;
          return (
            <div key={i} className={`tier ${unlocked ? '' : 'locked'}`}>
              <div className="tier-info">
                <b>
                  {t.name} {cleared && <span className="tag ok">Cleared</span>}
                </b>
                <span className="small muted">
                  Recommended Lv {t.recommendedLevel}
                  {t.waves.length > 0 && ` · ${t.waves.length + 1} waves`}
                </span>
                <span className="tier-foes" title={foes.map((f) => content.enemiesById[f.id]?.name ?? f.id).join(', ')}>
                  {foes.map((f, j) => (
                    <span key={j} className={content.enemiesById[f.id]?.boss ? 'boss' : ''}>
                      {content.enemiesById[f.id]?.emoji ?? '❔'}
                    </span>
                  ))}
                </span>
              </div>
              <div className="tier-rewards">
                <span className="mat-chip">
                  <Icon id={UI_ICONS.gold} size={16} /> <b>{t.gold}</b>
                </span>
                {t.gearRolls && <GearOdds rolls={t.gearRolls} />}
                {t.materialDrops.map((m) => {
                  const def = content.materialsById[m.material];
                  return (
                    <span
                      key={m.material}
                      className={`mat-chip r${def?.rarity ?? 3}`}
                      title={`${def?.name ?? m.material}${m.chance < 1 ? ` (${Math.round(m.chance * 100)}% chance)` : ''}`}
                    >
                      <IconOr icon={def?.icon} emoji={def?.emoji ?? '❔'} size={16} />
                      <b>
                        {m.min === m.max ? m.min : `${m.min}–${m.max}`}
                        {m.chance < 1 && <small> {Math.round(m.chance * 100)}%</small>}
                      </b>
                    </span>
                  );
                })}
              </div>
              <div className="tier-buttons">
                <button
                  className={`btn ${open && unlocked && canPay ? 'primary' : ''}`}
                  disabled={!open || !unlocked || !canPay}
                  onClick={() => {
                    sfx.click();
                    navigate(`/dungeon/${dungeon.id}/${i}`);
                  }}
                >
                  {!unlocked ? '🔒 Locked' : !open ? 'Closed' : '⚔️ Enter'}
                  {unlocked && open && t.stamina > 0 && <small className="cost-tag">⚡{t.stamina}</small>}
                </button>
                {cleared && open && (
                  <SweepButtons
                    target={{ kind: 'dungeon', dungeonId: dungeon.id, tier: i }}
                    maxRuns={t.stamina > 0 ? Math.floor(stamina.current / t.stamina) : 99}
                    costLabel={`⚡${t.stamina}`}
                  />
                )}
              </div>
              {unlocked && open && !canPay && (
                <div className="tier-short">
                  <StaminaShort need={t.stamina} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** The gear sets a gear dungeon drops; each item is one of them at random. */
function DungeonSets({ dungeon }: { dungeon: DungeonDef }) {
  const content = useContent();
  const sets = dungeon.sets.length ? dungeon.sets.flatMap((id) => content.gearSetsById[id] ?? []) : content.bundle.gearSets;
  return (
    <div className="dungeon-sets">
      <span className="small muted">Drops:</span>
      {sets.map((s) => (
        <span key={s.id} className="chip" title={s.bonuses.map((b) => `${b.pieces} pc: ${formatGearRoll(b)}`).join(' · ')}>
          <IconOr icon={s.icon} emoji={s.emoji} size={16} /> {s.name}
        </span>
      ))}
    </div>
  );
}

/** "🎁 2 gear · ★4 65% · ★5 15%" for a gear dungeon tier. */
function GearOdds({ rolls }: { rolls: GearRolls }) {
  const total = rolls.r3 + rolls.r4 + rolls.r5;
  const odds = ([3, 4, 5] as const).filter((r) => rolls[`r${r}`] > 0).map((r) => ({ r, pct: Math.round((rolls[`r${r}`] / total) * 100) }));
  return (
    <span
      className="mat-chip gear-odds"
      title={`${rolls.count} gear per win, each from one of this dungeon's sets at random. Random slot, main stat and bonus stats.`}
    >
      🎁 <b>{rolls.count} gear</b>
      {odds.map(({ r, pct }) => (
        <small key={r} className={`r${r}-text`}>
          {' '}
          ★{r} {pct}%
        </small>
      ))}
    </span>
  );
}
