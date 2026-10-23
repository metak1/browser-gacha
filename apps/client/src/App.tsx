import { UI_ICONS } from '@gacha/shared';
import { lazy, Suspense, useEffect } from 'react';
import { music as musicPlayer } from './audio/music';
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Icon } from './components/Art';
import { Guide } from './components/Guide';
import { DesktopNav, MobileTabs, SettingsMenu } from './components/Nav';
import { StaminaPill } from './components/Stamina';
import { Scene } from './components/Scene';
import { AccountScreen } from './screens/Account';
import { ArenaScreen } from './screens/Arena';
import { ArenaBattleScreen, BattleScreen, DungeonBattleScreen, EventBattleScreen, GuildBattleScreen, TowerBattleScreen } from './screens/Battle';
import { TowerScreen } from './screens/Tower';
import { EventsScreen } from './screens/Events';
import { SocialScreen } from './screens/Social';
import { CampaignScreen } from './screens/Campaign';
import { DungeonsScreen } from './screens/Dungeons';
import { HomeScreen } from './screens/Home';
import { MissionsScreen } from './screens/Missions';
import { RosterScreen } from './screens/Roster';
import { SummonScreen } from './screens/Summon';
import { ContentProvider } from './state/content';
import { ProfileProvider, useProfile } from './state/profile';
import { SettingsProvider } from './state/settings';
import { ToastProvider } from './state/toast';

export function App() {
  return (
    <BrowserRouter>
      <SettingsProvider>
        <ToastProvider>
          <ContentProvider>
            <ProfileProvider>
              <Layout />
            </ProfileProvider>
          </ContentProvider>
        </ToastProvider>
      </SettingsProvider>
    </BrowserRouter>
  );
}

// The admin panel is only downloaded by admins who open it.
const AdminScreen = lazy(() => import('./admin/AdminScreen'));

function Layout() {
  const { profile } = useProfile();
  const location = useLocation();
  // Battles pick their own track; everywhere else plays the calm lobby loop.
  const inBattle = /^\/(battle|dungeon|event|guild-battle|tower|arena\/fight)\//.test(location.pathname);
  useEffect(() => {
    if (!inBattle) musicPlayer.play('menu');
  }, [inBattle]);
  const { gems, gold, stardust } = profile.wallet;
  const section = location.pathname.split('/')[1] || 'home';
  const isAdmin = section === 'admin';

  return (
    <>
      {!isAdmin && (
        <div className="app-bg">
          <Scene theme="cosmos" still />
        </div>
      )}
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-star">✦</span> <span className="brand-text">Starlit Summons</span>
        </Link>
        <DesktopNav />
        <div className="wallet">
          <StaminaPill />
          <span className="pill" title="Gems: spend on summons">
            <Icon id={UI_ICONS.gems} size={16} /> {gems.toLocaleString()}
          </span>
          <span className="pill" title="Gold: spend on level ups">
            <Icon id={UI_ICONS.gold} size={16} /> {gold.toLocaleString()}
          </span>
          <span className="pill stardust-pill" title="Stardust: earned from duplicates">
            <Icon id={UI_ICONS.stardust} size={16} /> {stardust.toLocaleString()}
          </span>
        </div>
        <SettingsMenu />
        <NavLink to="/account" className={`account-chip ${profile.user.username ? '' : 'guest'}`} title={profile.account.title ?? undefined}>
          <span className="chip-level">Lv{profile.account.level}</span> {profile.user.username ?? 'Guest'}
        </NavLink>
      </header>
      {!isAdmin && <MobileTabs />}
      <Guide />
      <main className={isAdmin ? 'admin-main' : ''}>
        {/* Keyed by section so each screen animates in. */}
        <div key={section} className="page">
          <Routes location={location}>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/campaign" element={<CampaignScreen />} />
            <Route path="/battle/:stageId" element={<BattleScreen />} />
            <Route path="/dungeons" element={<DungeonsScreen />} />
            <Route path="/tower" element={<TowerScreen />} />
            <Route path="/tower/:floor" element={<TowerBattleScreen />} />
            <Route path="/events" element={<EventsScreen />} />
            <Route path="/event/:eventId/:stage" element={<EventBattleScreen />} />
            <Route path="/social" element={<SocialScreen />} />
            <Route path="/guild-battle/:boss" element={<GuildBattleScreen />} />
            <Route path="/dungeon/:dungeonId/:tier" element={<DungeonBattleScreen />} />
            <Route path="/arena" element={<ArenaScreen />} />
            <Route path="/arena/fight/:opponentId" element={<ArenaBattleScreen />} />
            <Route path="/summon" element={<SummonScreen />} />
            <Route path="/roster" element={<RosterScreen />} />
            <Route path="/account" element={<AccountScreen />} />
            <Route path="/missions" element={<MissionsScreen />} />
            <Route
              path="/admin/*"
              element={
                <Suspense fallback={<p className="center muted">Loading admin…</p>}>
                  <AdminScreen />
                </Suspense>
              }
            />
            <Route path="*" element={<p className="muted center">Page not found.</p>} />
          </Routes>
        </div>
      </main>
    </>
  );
}
