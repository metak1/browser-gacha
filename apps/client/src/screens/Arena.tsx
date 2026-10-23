import { nextTier, tierFor, type ArenaLeaderboardEntryDTO, type ArenaStatusDTO } from '@gacha/shared';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { sfx } from '../audio/sfx';
import { MultiPick } from '../admin/fields';
import { UnitArt, PixelEmoji } from '../components/Art';
import { LockedFeature, useFeature } from '../components/Locked';
import { RewardList } from '../components/Materials';
import { useContent } from '../state/content';
import { useProfile } from '../state/profile';
import { useToast } from '../state/toast';
import './arena.css';


export function ArenaScreen() {
  const { unlocked } = useFeature('arena');
  return unlocked ? <ArenaHub /> : <LockedFeature feature="arena" />;
}

function ArenaHub() {
  const content = useContent();
  const { profile, mutate } = useProfile();
  const toast = useToast();
  const navigate = useNavigate();
  const [status, setStatus] = useState<ArenaStatusDTO | null>(null);
  const [board, setBoard] = useState<ArenaLeaderboardEntryDTO[]>([]);
  const [editing, setEditing] = useState(false);
  const [defense, setDefense] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await api.arena.status();
      setStatus(s);
      setDefense(s.defense);
      if (s.seasonReward) {
        sfx.victory();
        // The season payout changed the wallet.
        void mutate(api.me);
      }
      setBoard(await api.arena.leaderboard());
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }, [mutate, toast]);
  useEffect(() => void load(), [load]);

  async function refresh() {
    setBusy(true);
    try {
      setStatus(await api.arena.refresh());
      sfx.click();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function saveDefense() {
    try {
      const s = await api.arena.setDefense(defense);
      setStatus(s);
      setEditing(false);
      toast('Defense team saved');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  if (!status) return <p className="center muted">Entering the arena…</p>;

  const tiers = content.settings.arenaTiers;
  const tier = tierFor(status.rating, tiers);
  const next = nextTier(status.rating, tiers);
  const progress = next ? (status.rating - tier.minRating) / (next.minRating - tier.minRating) : 1;
  const ownedOptions = profile.roster
    .map((o) => content.charactersById[o.id])
    .filter((c) => c !== undefined)
    .sort((a, b) => b.rarity - a.rarity)
    .map((c) => ({ value: c.id, label: `${c.emoji} ${c.name}` }));

  return (
    <div className="arena">
      <section className="arena-hero">
        <div className="arena-tier">
          <span className="arena-tier-icon">{tier.icon}</span>
          <div>
            <small>{tier.name} tier · season {status.week}</small>
            <div className="arena-rating">{status.rating}</div>
            <div className="arena-progress">
              <div style={{ width: `${Math.min(100, progress * 100)}%` }} />
            </div>
            <small className="muted">{next ? `${next.minRating - status.rating} to ${next.icon} ${next.name}` : 'Top tier!'}</small>
          </div>
        </div>
        <div className="arena-stats">
          <div>
            <b>#{status.rank}</b>
            <span>Rank</span>
          </div>
          <div>
            <b>
              {status.wins}–{status.losses}
            </b>
            <span>W–L</span>
          </div>
          <div>
            <b>
              🎟️ {status.tickets}/{status.maxTickets}
            </b>
            <span>Tickets today</span>
          </div>
        </div>
        <p className="small muted arena-weekly">
          Weekly reward for {tier.icon} {tier.name}: <RewardList reward={tier.reward} />
        </p>
      </section>

      {status.seasonReward && (
        <section className="panel season-banner">
          🏆 Last week you finished in <b>{status.seasonReward.icon} {status.seasonReward.tier}</b> and earned{' '}
          <RewardList reward={status.seasonReward.reward} />. Your rating was reset to {status.seasonReward.ratingAfterReset}.
        </section>
      )}

      <div className="arena-grid">
        <section className="panel">
          <div className="panel-head">
            <h3>Opponents</h3>
            <button className="btn small" disabled={busy} onClick={refresh}>
              ↻ New opponents
            </button>
          </div>
          {status.opponents.length === 0 && <p className="muted">No opponents left. Get a new list.</p>}
          {status.opponents.map((o) => (
            <div key={o.id} className="opponent">
              <div className="opponent-info">
                <b>{o.name}</b>
                {o.isBot && <span className="tag">Bot</span>}
                <div className="small muted">
                  {tierFor(o.rating, tiers).icon} {o.rating} · ⚡ {o.power.toLocaleString()} power
                </div>
                <div className="opponent-team">
                  {o.team.map((m, i) => {
                    const c = content.charactersById[m.id];
                    return (
                      <span key={i} title={`${c?.name ?? m.id} Lv${m.level}`}>
                        {c?.sprite ? <UnitArt sprite={c.sprite} emoji={c.emoji} height="26px" flip /> : <PixelEmoji emoji={c?.emoji ?? '❔'} />}
                        <sub>{m.level}</sub>
                      </span>
                    );
                  })}
                </div>
              </div>
              <button
                className="btn primary"
                disabled={status.tickets <= 0}
                onClick={() => {
                  sfx.click();
                  navigate(`/arena/fight/${encodeURIComponent(o.id)}`, { state: { name: o.name } });
                }}
              >
                ⚔️ Fight
              </button>
            </div>
          ))}
          {status.tickets <= 0 && <p className="small warn-text">Out of tickets. They refresh at 00:00 UTC.</p>}
          <p className="small muted">
            Win: +{content.settings.arenaWinGold} 🪙 +{content.settings.arenaWinGems} 💎. Your attack team is your main team from the
            Roster.
          </p>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h3>Defense team</h3>
            {!editing ? (
              <button className="btn small" onClick={() => setEditing(true)}>
                Edit
              </button>
            ) : (
              <div className="ed-actions">
                <button className="btn small" onClick={() => setDefense(profile.team)}>
                  Use main team
                </button>
                <button className="btn small primary" disabled={!defense.length} onClick={saveDefense}>
                  Save
                </button>
              </div>
            )}
          </div>
          <p className="small muted">Other players fight these heroes. The AI plays them, using their current levels and gear.</p>
          {editing ? (
            <MultiPick values={defense} onChange={setDefense} options={ownedOptions} max={content.settings.maxTeamSize} />
          ) : (
            <div className="defense-team">
              {status.defense.map((id) => {
                const c = content.charactersById[id];
                const lvl = profile.roster.find((r) => r.id === id)?.level ?? 1;
                return (
                  <span key={id} className="defense-hero">
                    <span>{c?.sprite ? <UnitArt sprite={c.sprite} emoji={c.emoji} height="30px" /> : c && <PixelEmoji emoji={c.emoji} />}</span>
                    <small>
                      {c?.name} Lv{lvl}
                    </small>
                  </span>
                );
              })}
              {!status.defense.length && <span className="muted">No defense set. Others can't challenge you.</span>}
            </div>
          )}
          <div className="small muted">⚡ {status.defensePower.toLocaleString()} power</div>

          <h3 className="mt">Battle log</h3>
          {status.history.length === 0 && <p className="muted small">No arena battles yet.</p>}
          <div className="arena-history">
            {status.history.map((h) => (
              <div key={h.id} className={`history-row ${h.youWon ? 'won' : 'lost'}`}>
                <span>{h.youAttacked ? '⚔️' : '🛡️'}</span>
                <span>
                  {h.youAttacked ? 'You attacked' : 'Attacked by'} <b>{h.opponentName}</b>
                </span>
                <span className="result">{h.youWon ? 'Win' : 'Loss'}</span>
                <span className="delta">
                  {h.delta >= 0 ? '+' : ''}
                  {h.delta}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <h3>Leaderboard</h3>
          <table className="leaderboard">
            <tbody>
              {board.map((e) => (
                <tr key={e.rank} className={e.isYou ? 'you' : ''}>
                  <td className="rank">{e.rank <= 3 ? ['🥇', '🥈', '🥉'][e.rank - 1] : `#${e.rank}`}</td>
                  <td>{e.name}</td>
                  <td className="muted">{tierFor(e.rating, tiers).icon}</td>
                  <td className="rating">{e.rating}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!board.length && <p className="muted small">No ranked players yet.</p>}
        </section>
      </div>
    </div>
  );
}
