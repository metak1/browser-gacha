import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { useContent } from '../state/content';
import { useProfile } from '../state/profile';
import './admin.css';
import { ChaptersEditor, StagesEditor } from './editors/campaign';
import { BannersEditor } from './editors/gacha';
import { GearEditor } from './editors/gear';
import { MaterialsEditor } from './editors/materials';
import { DungeonsEditor } from './editors/dungeons';
import { EventsEditor } from './editors/events';
import { MissionsEditor } from './editors/missions';
import { SpellsEditor } from './editors/spells';
import { CharactersEditor, EnemiesEditor } from './editors/units';
import { DataPanel, PlayersPanel, SettingsPanel } from './panels';

const SECTIONS = [
  { path: 'units', label: 'Units', icon: '🧙', Component: CharactersEditor },
  { path: 'enemies', label: 'Enemies', icon: '👾', Component: EnemiesEditor },
  { path: 'spells', label: 'Spells', icon: '✨', Component: SpellsEditor },
  { path: 'chapters', label: 'Chapters', icon: '🗺️', Component: ChaptersEditor },
  { path: 'stages', label: 'Stages', icon: '⚔️', Component: StagesEditor },
  { path: 'dungeons', label: 'Dungeons', icon: '🗝️', Component: DungeonsEditor },
  { path: 'events', label: 'Events', icon: '🎃', Component: EventsEditor },
  { path: 'gear', label: 'Gear', icon: '🎒', Component: GearEditor },
  { path: 'materials', label: 'Materials', icon: '💠', Component: MaterialsEditor },
  { path: 'banners', label: 'Banners', icon: '🎰', Component: BannersEditor },
  { path: 'missions', label: 'Missions', icon: '📜', Component: MissionsEditor },
  { path: 'settings', label: 'Settings', icon: '⚙️', Component: SettingsPanel },
  { path: 'players', label: 'Players', icon: '👥', Component: PlayersPanel },
  { path: 'data', label: 'Import / Export', icon: '💾', Component: DataPanel },
];

/** The game's content management backend. Lazy-loaded; admins only. */
export default function AdminScreen() {
  const { profile } = useProfile();
  const content = useContent();

  if (profile.user.role !== 'admin') {
    return (
      <div className="panel narrow">
        <h2>Admins only</h2>
        <p className="muted">
          To make this account an admin, run <code>npm run make-admin</code> in a terminal, then reload the page.
        </p>
      </div>
    );
  }

  return (
    <div className="admin">
      <nav className="admin-nav">
        <div className="admin-nav-title">
          🛠️ Game admin
          <small className="muted">content v{content.bundle.version}</small>
        </div>
        {SECTIONS.map((s) => (
          <NavLink key={s.path} to={`/admin/${s.path}`} className="admin-nav-link">
            <span aria-hidden>{s.icon}</span> {s.label}
          </NavLink>
        ))}
      </nav>
      <div className="admin-body">
        <Routes>
          <Route index element={<Navigate to="units" replace />} />
          {SECTIONS.map((s) => (
            <Route key={s.path} path={s.path} element={<s.Component />} />
          ))}
          <Route path="*" element={<Navigate to="units" replace />} />
        </Routes>
      </div>
    </div>
  );
}
