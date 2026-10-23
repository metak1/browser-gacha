import type { MissionDTO } from '@gacha/shared';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api';
import { sfx } from '../audio/sfx';
import { ActivityTrack } from '../components/DailyActivity';
import { RewardList } from '../components/Materials';
import { useProfile } from '../state/profile';
import { useToast } from '../state/toast';

export function MissionsScreen() {
  const { setProfile } = useProfile();
  const toast = useToast();
  const [missions, setMissions] = useState<MissionDTO[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api.missions().then(setMissions, (err) => toast(errorMessage(err), 'error'));
  }, [toast]);

  async function claim(m: MissionDTO) {
    setBusy(m.id);
    try {
      const res = await api.claimMission(m.id);
      setMissions(res.missions);
      setProfile(res.profile);
      sfx.coins();
      toast(`Claimed “${m.name}”`);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  }

  if (!missions) return <p className="center muted">Loading missions…</p>;

  // Ready to claim first, then in progress, then done.
  const order = (m: MissionDTO) => (m.complete && !m.claimed ? 0 : m.claimed ? 2 : 1);
  const groups = [
    { title: 'Daily', hint: 'Resets every day at 00:00 UTC', list: missions.filter((m) => m.repeat === 'daily') },
    { title: 'Story & achievements', hint: 'One-time rewards', list: missions.filter((m) => m.repeat === 'once') },
  ];

  return (
    <div className="missions narrow-wide">
      <div className="page-head">
        <h1>Missions</h1>
        <span className="muted">{missions.filter((m) => m.complete && !m.claimed).length} ready to claim</span>
      </div>
      {groups.map(
        (g) =>
          g.list.length > 0 && (
            <section key={g.title} className="mission-group">
              <h2>
                {g.title} <small className="muted">{g.hint}</small>
              </h2>
              {g.title === 'Daily' && (
                <div className="panel activity-panel">
                  <b>Daily chests</b> <small className="muted">Claim daily missions for activity points.</small>
                  <ActivityTrack />
                </div>
              )}
              {[...g.list]
                .sort((a, b) => order(a) - order(b))
                .map((m) => (
                  <div key={m.id} className={`mission ${m.claimed ? 'claimed' : m.complete ? 'ready' : ''}`}>
                    <div className="mission-body">
                      <b>{m.name}</b>
                      <span className="muted small">{m.description}</span>
                      <div className="mission-bar">
                        <div style={{ width: `${(m.progress / m.count) * 100}%` }} />
                        <span>
                          {m.progress} / {m.count}
                        </span>
                      </div>
                    </div>
                    <div className="mission-reward">
                      <RewardList reward={m.reward} />
                      {m.points > 0 && <span className="today-points">+{m.points} activity</span>}
                    </div>
                    <button
                      className={`btn ${m.complete && !m.claimed ? 'primary glow' : ''}`}
                      disabled={!m.complete || m.claimed || busy === m.id}
                      onClick={() => claim(m)}
                    >
                      {m.claimed ? 'Claimed ✓' : m.complete ? 'Claim' : 'In progress'}
                    </button>
                  </div>
                ))}
            </section>
          ),
      )}
      {!missions.length && <p className="center muted">No missions right now.</p>}
    </div>
  );
}


