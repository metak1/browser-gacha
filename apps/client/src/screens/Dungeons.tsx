import { dungeonKey, isDungeonOpen, isDungeonTierUnlocked, UI_ICONS, type DungeonDef } from '@gacha/shared';
import { useNavigate } from 'react-router-dom';
import { TeamSwitcher } from '../components/TeamSwitcher';
import { sfx } from '../audio/sfx';
import { Icon, IconOr } from '../components/Art';
import { LockedFeature, useFeature } from '../components/Locked';
import { Scene } from '../components/Scene';
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

  return (
    <div className="dungeons">
      <div className="page-head">
        <h1>Dungeons</h1>
        <span className="muted">
          Today is {DAY_LONG[today]} (UTC) · {content.settings.dungeonRunsPerDay} winning runs per dungeon per day
        </span>
      </div>
      <p className="muted small">
        Farm ascension materials here. Each dungeon opens on its own day, and every dungeon opens on Sunday. Clear a tier to unlock the next one.
      </p>
      {!list.length && <p className="center muted">No dungeons yet.</p>}
      <div className="dungeon-grid">
        {list.map((d) => (
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
  const open = isDungeonOpen(dungeon, now);
  const used = profile.dungeonRuns[dungeon.id] ?? 0;
  const left = Math.max(0, content.settings.dungeonRunsPerDay - used);
  const next = open ? null : nextOpenDay(dungeon, today);

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
            {open ? `${left}/${content.settings.dungeonRunsPerDay} runs left` : next !== null ? `Opens ${DAY_LONG[next]}` : 'Closed'}
          </span>
        </div>
      </div>
      {dungeon.description && <p className="small muted dungeon-desc">{dungeon.description}</p>}
      {open && left > 0 && (
        <div className="dungeon-team">
          <TeamSwitcher />
        </div>
      )}
      <div className="tiers">
        {dungeon.tiers.map((t, i) => {
          const unlocked = isDungeonTierUnlocked(dungeon.id, i, profile.clearedStages);
          const cleared = profile.clearedStages.includes(dungeonKey(dungeon.id, i));
          const foes = [...t.enemies, ...t.waves.flat()];
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
                {t.materialDrops.map((m) => {
                  const def = content.materialsById[m.material];
                  return (
                    <span key={m.material} className={`mat-chip r${def?.rarity ?? 3}`} title={`${def?.name ?? m.material}${m.chance < 1 ? ` (${Math.round(m.chance * 100)}% chance)` : ''}`}>
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
                className={`btn ${open && unlocked && left > 0 ? 'primary' : ''}`}
                disabled={!open || !unlocked || left <= 0}
                onClick={() => {
                  sfx.click();
                  navigate(`/dungeon/${dungeon.id}/${i}`);
                }}
              >
                {!unlocked ? '🔒 Locked' : !open ? 'Closed' : left <= 0 ? 'No runs left' : '⚔️ Enter'}
              </button>
              {cleared && open && left > 0 && (
                <SweepButtons target={{ kind: 'dungeon', dungeonId: dungeon.id, tier: i }} maxRuns={left} costLabel="one daily run" />
              )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
