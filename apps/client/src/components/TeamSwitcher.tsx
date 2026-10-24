import { ELEMENTS } from '@gacha/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { sfx } from '../audio/sfx';
import { useContent } from '../state/content';
import { useProfile } from '../state/profile';
import { UnitArt } from './Art';
import './teams.css';

/** Small portraits of a team's members. */
function Faces({ members }: { members: string[] }) {
  const content = useContent();
  return (
    <span className="team-faces">
      {members.map((id) => {
        const c = content.charactersById[id];
        return c ? (
          <span key={id} className="team-face" style={{ borderColor: ELEMENTS[c.element].color }} title={c.name}>
            <UnitArt sprite={c.sprite} emoji={c.emoji} height="22px" />
          </span>
        ) : null;
      })}
    </span>
  );
}

/** Element mix of a team, e.g. "🔥🔥💧", to tell presets apart at a glance. */
const elementsOf = (members: string[], content: ReturnType<typeof useContent>) =>
  members.map((id) => content.charactersById[id] && ELEMENTS[content.charactersById[id]!.element].icon).join('');

/**
 * Picks the active team before a battle. Switching saves the current team into
 * its own preset first, so nothing is lost.
 */
export function TeamSwitcher() {
  const { profile, mutate } = useProfile();
  const content = useContent();
  const switchTo = (slot: number) => {
    sfx.click();
    void mutate(() => api.activateTeam(slot), `Team: ${profile.teams[slot]?.name}`);
  };
  return (
    <div className="team-switch">
      <label className="small muted">
        Team{' '}
        <select className="sort-select" value={profile.activeTeam} onChange={(e) => switchTo(Number(e.target.value))}>
          {profile.teams.map((t) => (
            <option key={t.slot} value={t.slot}>
              {t.name} {t.members.length ? elementsOf(t.members, content) : '(new)'}
            </option>
          ))}
        </select>
      </label>
      <Faces members={profile.team} />
      <Link to="/roster" className="small team-edit">
        Edit
      </Link>
    </div>
  );
}

/** Roster: every preset as a tab, with renaming for the active one. */
export function TeamTabs() {
  const { profile, mutate } = useProfile();
  const content = useContent();
  const [editing, setEditing] = useState<string | null>(null);
  const active = profile.teams[profile.activeTeam];

  async function rename() {
    if (editing === null) return;
    const name = editing;
    setEditing(null);
    if (name.trim() && name.trim() !== active?.name) await mutate(() => api.renameTeam(profile.activeTeam, name), 'Team renamed');
  }

  return (
    <div className="team-tabs">
      {profile.teams.map((t) =>
        t.slot === profile.activeTeam && editing !== null ? (
          <input
            key={t.slot}
            className="team-tab editing"
            value={editing}
            maxLength={20}
            autoFocus
            onChange={(e) => setEditing(e.target.value)}
            onBlur={() => void rename()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void rename();
              if (e.key === 'Escape') setEditing(null);
            }}
          />
        ) : (
          <button
            key={t.slot}
            className={`team-tab ${t.slot === profile.activeTeam ? 'active' : ''} ${t.members.length ? '' : 'empty'}`}
            onClick={() => (t.slot === profile.activeTeam ? setEditing(t.name) : void mutate(() => api.activateTeam(t.slot), `Team: ${t.name}`))}
            title={
              t.slot === profile.activeTeam ? 'Click to rename' : t.members.length ? `Switch to ${t.name}` : 'New team (starts as a copy of the current one)'
            }
          >
            <span className="team-tab-name">{t.name}</span>
            <small>{t.members.length ? elementsOf(t.members, content) : '+ new'}</small>
            {t.slot === profile.activeTeam && (
              <span className="team-tab-edit" aria-hidden>
                ✏️
              </span>
            )}
          </button>
        ),
      )}
    </div>
  );
}
