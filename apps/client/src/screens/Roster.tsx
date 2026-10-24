import { useState } from 'react';
import { useContent } from '../state/content';
import { useProfile } from '../state/profile';
import { GearTab } from './roster/GearTab';
import { HeroesTab } from './roster/HeroesTab';
import { MaterialsTab } from './roster/MaterialsTab';

export function RosterScreen() {
  const { profile } = useProfile();
  const [tab, setTab] = useState<'heroes' | 'gear' | 'materials'>('heroes');
  const content = useContent();
  return (
    <div className="roster">
      <div className="page-head">
        <h1>Roster</h1>
        <div className="filters tabs-inline">
          <button className={`chip ${tab === 'heroes' ? 'active' : ''}`} onClick={() => setTab('heroes')}>
            👥 Heroes {profile.roster.length}/{content.bundle.characters.length}
          </button>
          <button className={`chip ${tab === 'gear' ? 'active' : ''}`} onClick={() => setTab('gear')}>
            🎒 Gear {profile.gear.length}/{content.settings.gearInventoryCap}
          </button>
          <button className={`chip ${tab === 'materials' ? 'active' : ''}`} onClick={() => setTab('materials')}>
            💠 Materials
          </button>
        </div>
      </div>
      {tab === 'heroes' ? <HeroesTab /> : tab === 'gear' ? <GearTab /> : <MaterialsTab />}
    </div>
  );
}
