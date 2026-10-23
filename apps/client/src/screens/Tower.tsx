import { towerBest, towerFloor, type TowerDTO } from '@gacha/shared';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { sfx } from '../audio/sfx';
import { PixelEmoji, UnitArt } from '../components/Art';
import { LockedFeature, useFeature } from '../components/Locked';
import { RewardList } from '../components/Materials';
import { Scene } from '../components/Scene';
import { TeamSwitcher } from '../components/TeamSwitcher';
import { useContent } from '../state/content';
import { useProfile } from '../state/profile';
import './tower.css';

export function TowerScreen() {
  const { unlocked } = useFeature('tower');
  return unlocked ? <Tower /> : <LockedFeature feature="tower" />;
}

function Tower() {
  const content = useContent();
  const { profile } = useProfile();
  const navigate = useNavigate();
  const [board, setBoard] = useState<TowerDTO | null>(null);
  const best = towerBest(profile.clearedStages);
  const next = towerFloor(content, best + 1);
  const t = content.settings.tower;
  const teamLevel = profile.team.length
    ? Math.round(profile.team.reduce((n, id) => n + (profile.roster.find((c) => c.id === id)?.level ?? 1), 0) / profile.team.length)
    : 0;

  useEffect(() => {
    api.tower().then(setBoard, () => setBoard(null));
  }, [best]);

  const foes = [...next.encounter.enemies, ...(next.encounter.waves ?? []).flat()];
  // The next few milestone floors, to aim for.
  const firstMilestone = Math.ceil((best + 1) / t.milestoneEvery) * t.milestoneEvery;
  const milestones = [0, 1, 2].map((i) => towerFloor(content, firstMilestone + i * t.milestoneEvery));

  return (
    <div className="tower narrow-wide">
      <section className="tower-hero">
        <Scene theme={next.theme} weather={0.4} />
        <div className="tower-hero-text">
          <small>Endless Tower</small>
          <h1>Floor {next.floor}</h1>
          <span className="muted">{best ? `Best: floor ${best}` : 'No floors cleared yet'}</span>
        </div>
        <div className="tower-steps" aria-hidden>
          {[next.floor + 2, next.floor + 1, next.floor, Math.max(0, next.floor - 1)].map((f) =>
            f > 0 ? (
              <span key={f} className={`tower-step ${f === next.floor ? 'current' : f < next.floor ? 'done' : ''} ${f % t.bossEvery === 0 ? 'boss' : ''}`}>
                {f < next.floor ? '✓' : f % t.bossEvery === 0 ? '☠' : ''} {f}
              </span>
            ) : null,
          )}
        </div>
      </section>

      <div className="tower-body">
        <section className="panel tower-floor">
          <h3>
            Floor {next.floor} {next.boss && <span className="tag boss-tag">Boss</span>} {next.milestone && <span className="tag">Milestone</span>}
          </h3>
          <div className="tower-foes">
            {foes.map((e, i) => {
              const d = content.enemiesById[e.id];
              return d ? (
                <span key={i} className={`enemy-chip ${d.boss ? 'boss' : ''}`} title={d.name}>
                  {d.sprite ? <UnitArt sprite={d.sprite} emoji={d.emoji} height={d.boss ? '44px' : '34px'} flip /> : <PixelEmoji emoji={d.emoji} />}
                  <small>{d.name}</small>
                </span>
              ) : null;
            })}
          </div>
          {(next.encounter.waves?.length ?? 0) > 0 && <p className="small muted">Two waves: the second arrives when the first falls.</p>}
          <div className="small muted">
            Enemy Lv {next.encounter.enemies[0]?.level} · Recommended Lv {next.recommendedLevel}
            {next.mods.statMult && next.mods.statMult > 1 ? ` · enemies ×${next.mods.statMult} stats` : ''}
          </div>
          {teamLevel < next.recommendedLevel && (
            <div className={`underlevel ${next.recommendedLevel - teamLevel >= 5 ? 'severe' : ''}`}>
              ⚠ Your team averages Lv {teamLevel}, {next.recommendedLevel - teamLevel} below the recommended level.
            </div>
          )}
          <div className="tower-reward">
            <span className="small muted">First clear</span>
            <RewardList reward={next.reward} />
          </div>
          <TeamSwitcher />
          <button
            className="btn primary big glow"
            onClick={() => {
              sfx.click();
              navigate(`/tower/${next.floor}`);
            }}
          >
            🗼 Climb to floor {next.floor}
          </button>
          <p className="small muted">No stamina needed. Each floor pays out once; lose as often as you like.</p>
        </section>

        <aside className="tower-side">
          <section className="panel">
            <h3>Milestones</h3>
            {milestones.map((m) => (
              <div key={m.floor} className="tower-milestone">
                <b>Floor {m.floor}</b>
                <RewardList reward={m.reward} size={14} />
              </div>
            ))}
            <p className="small muted">
              Every {t.milestoneEvery} floors. A boss guards every {t.bossEvery}th floor.
            </p>
          </section>

          <section className="panel">
            <h3>
              Leaderboard {board?.myRank && <small className="muted">· you're #{board.myRank}</small>}
            </h3>
            {!board ? (
              <p className="small muted">Loading…</p>
            ) : !board.leaders.length ? (
              <p className="small muted">Nobody has cleared a floor yet. Be the first!</p>
            ) : (
              <ol className="tower-board">
                {board.leaders.map((l, i) => (
                  <li key={i} className={l.me ? 'me' : ''}>
                    <span className="rank">{i + 1}</span>
                    <span className="name">{l.name}</span>
                    <b>{l.floor}</b>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
