import { isFeatureUnlocked, type Feature, type MissionDTO, type MissionKind, type Reward } from '@gacha/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { sfx } from '../audio/sfx';
import { useContent } from '../state/content';
import { useProfile } from '../state/profile';
import { useToast } from '../state/toast';
import { PixelEmoji } from './Art';
import { RewardList } from './Materials';
import './daily.css';

/** Where to go to make progress on each kind of daily mission. */
const GO: Partial<Record<MissionKind, { to: string; feature?: Feature }>> = {
  winBattles: { to: '/campaign' },
  summon: { to: '/summon' },
  arenaWins: { to: '/arena', feature: 'arena' },
  dungeonRuns: { to: '/dungeons', feature: 'dungeons' },
  upgradeGear: { to: '/roster' },
  levelUp: { to: '/roster' },
  skillUp: { to: '/roster' },
  ascend: { to: '/roster' },
  guildAttacks: { to: '/social?tab=guild' },
};

const rewardText = (r: Reward) =>
  [r.gems && `💎 ${r.gems}`, r.gold && `🪙 ${r.gold}`, r.stardust && `✨ ${r.stardust}`, ...r.materials.map((m) => `${m.id} ×${m.count}`)]
    .filter(Boolean)
    .join(' · ');

function untilReset(now = Date.now()) {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  const mins = Math.max(0, Math.round((next.getTime() - now) / 60_000));
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}

/** Today's activity points with the daily chests along the bar. */
export function ActivityTrack() {
  const { profile, setProfile } = useProfile();
  const chests = useContent().settings.activityChests;
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!chests.length) return null;
  const { points, claimed } = profile.activity;
  const max = Math.max(...chests.map((c) => c.points));

  async function open(at: number, reward: Reward) {
    setBusy(true);
    try {
      setProfile(await api.claimActivity(at));
      sfx.coins();
      toast(`Daily chest: ${rewardText(reward)}`);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="activity">
      <div className="activity-points">
        <b>{points}</b>
        <small>activity</small>
      </div>
      <div className="activity-track">
        <div className="activity-bar">
          <div style={{ width: `${Math.min(100, (points / max) * 100)}%` }} />
        </div>
        {chests.map((c) => {
          const opened = claimed.includes(c.points);
          const ready = !opened && points >= c.points;
          return (
            <button
              key={c.points}
              className={`activity-chest ${opened ? 'opened' : ready ? 'ready' : 'locked'}`}
              style={{ left: `${(c.points / max) * 100}%` }}
              disabled={!ready || busy}
              onClick={() => open(c.points, c.reward)}
              title={`${c.points} points: ${rewardText(c.reward)}`}
            >
              <span className="chest-icon">{opened ? '✓' : <PixelEmoji emoji={ready ? '🎁' : '📦'} />}</span>
              <small className="chest-points">{c.points}</small>
              <span className="chest-reward">
                <RewardList reward={c.reward} size={13} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Home: the daily supplies and login calendar, today's chests, and every daily
 * task with a way to get it done. Finished tasks fold away.
 */
export function TodayPanel({ supplies, calendar }: { supplies?: ReactNode; calendar?: ReactNode }) {
  const { profile, setProfile, mutate } = useProfile();
  const content = useContent();
  const toast = useToast();
  const [missions, setMissions] = useState<MissionDTO[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const cleared = new Set(profile.clearedStages);

  // Refresh when something claimable changes. Progress made elsewhere shows when Home is opened again (it remounts).
  const key = `${profile.missionsReady}|${profile.activity.points}|${profile.dailyAvailable}`;
  useEffect(() => {
    api.missions().then(setMissions, () => setMissions([]));
  }, [key]);

  const daily = (missions ?? []).filter((m) => m.repeat === 'daily');
  if (missions && !daily.length && !supplies) return null;

  async function claim(m: MissionDTO) {
    setBusy(m.id);
    try {
      const res = await api.claimMission(m.id);
      setMissions(res.missions);
      setProfile(res.profile);
      sfx.coins();
      toast(`“${m.name}” +${m.points} activity`);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  }

  const order = (m: MissionDTO) => (m.complete && !m.claimed ? 0 : m.claimed ? 2 : 1);
  const done = daily.filter((m) => m.claimed);
  const shown = [...daily].filter((m) => showDone || !m.claimed).sort((a, b) => order(a) - order(b));

  return (
    <section className="panel today">
      <div className="today-head">
        <h3>Today</h3>
        <small className="muted">
          {done.length}/{daily.length} done · resets in {untilReset()}
        </small>
      </div>
      {supplies}
      {calendar}
      <ActivityTrack />
      <div className="today-list">
        {shown.map((m) => {
          const go = GO[m.kind];
          const lockedBy = go?.feature && !isFeatureUnlocked(content.settings, go.feature, cleared) ? content.settings.unlocks[go.feature] : null;
          const noGuild = m.kind === 'guildAttacks' && !profile.guildId;
          return (
            <div key={m.id} className={`today-task ${m.claimed ? 'claimed' : m.complete ? 'ready' : ''}`}>
              <div className="today-task-body">
                <b>{m.name}</b>
                <div className="today-task-bar">
                  <div style={{ width: `${(m.progress / m.count) * 100}%` }} />
                </div>
                <small className="muted">
                  {m.progress}/{m.count} · {m.description}
                </small>
              </div>
              <span className="today-points" title="Activity points">
                +{m.points}
              </span>
              <span className="today-reward">
                <RewardList reward={m.reward} size={14} />
              </span>
              {m.claimed ? (
                <span className="today-done">✓</span>
              ) : m.complete ? (
                <button className="btn small primary glow" disabled={busy === m.id} onClick={() => claim(m)}>
                  Claim
                </button>
              ) : m.kind === 'claimDaily' ? (
                <button className="btn small" disabled={!profile.dailyAvailable} onClick={() => mutate(api.claimDaily, 'Daily supplies claimed')}>
                  Collect
                </button>
              ) : lockedBy ? (
                <span className="today-locked" title={`Unlocks after stage ${lockedBy}`}>
                  🔒 {lockedBy}
                </span>
              ) : go ? (
                <Link className="btn small" to={go.to} onClick={() => sfx.click()}>
                  {noGuild ? 'Join' : 'Go'}
                </Link>
              ) : (
                <span />
              )}
            </div>
          );
        })}
        {done.length > 0 && (
          <button className="today-fold" onClick={() => setShowDone(!showDone)}>
            {showDone ? '▲ Hide finished' : `✓ ${done.length} finished · show`}
          </button>
        )}
      </div>
    </section>
  );
}
