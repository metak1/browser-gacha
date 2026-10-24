import { FEATURE_INFO, towerBest, isDungeonOpen, isEventActive, isFeatureUnlocked, isStageUnlocked, type Feature } from '@gacha/shared';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { sfx } from '../audio/sfx';
import { useContent } from '../state/content';
import { useProfile } from '../state/profile';
import { useSettings } from '../state/settings';
import './nav.css';

interface ModeItem {
  to: string;
  icon: string;
  label: string;
  /** One line of status under the label. */
  status: string;
  badge?: string;
  locked?: boolean;
}

/** Game modes for the Play menu, with live status lines and lock state. */
function usePlayModes(): ModeItem[] {
  const content = useContent();
  const { profile } = useProfile();
  const settings = content.settings;
  const now = Date.now();
  const cleared = new Set(profile.clearedStages);
  const lock = (f: Feature) => (isFeatureUnlocked(settings, f, cleared) ? null : settings.unlocks[f]);

  const next = content.stages.find((s) => !cleared.has(s.id) && isStageUnlocked(content, s.id, cleared));
  const items: ModeItem[] = [
    { to: '/campaign', icon: '⚔️', label: 'Campaign', status: next ? `Next: ${next.id} · ${next.name}` : 'All stages cleared · try hard mode' },
  ];
  const ev = content.bundle.events.find((e) => isEventActive(e, now));
  if (ev) {
    items.push({
      to: '/events',
      icon: ev.emoji,
      label: ev.name,
      status: `${ev.currency.emoji} ${(profile.events[ev.id]?.currency ?? 0).toLocaleString()} ${ev.currency.name}`,
      badge: 'Event',
    });
  }
  const dl = lock('dungeons');
  const open = content.bundle.dungeons.filter((d) => isDungeonOpen(d, now));
  items.push({
    to: '/dungeons',
    icon: '🗝️',
    label: 'Dungeons',
    status: dl ? `Unlocks after ${dl}` : open.length ? open.map((d) => d.name).join(', ') : 'Closed today',
    locked: Boolean(dl),
  });
  const tl = lock('tower');
  const best = towerBest(cleared);
  items.push({
    to: '/tower',
    icon: '🗼',
    label: 'Endless Tower',
    status: tl ? `Unlocks after ${tl}` : best ? `Best floor ${best} · next ${best + 1}` : 'Start climbing at floor 1',
    locked: Boolean(tl),
  });
  const al = lock('arena');
  items.push({ to: '/arena', icon: '🏟️', label: 'Arena', status: al ? `Unlocks after ${al}` : FEATURE_INFO.arena.blurb, locked: Boolean(al) });
  return items;
}

/** Badge counts for the main sections. */
function useBadges() {
  const { profile } = useProfile();
  return {
    home: profile.dailyAvailable ? '!' : undefined,
    missions: profile.missionsReady > 0 ? String(profile.missionsReady) : undefined,
    social:
      profile.notices.friendRequests + profile.notices.guildAttacksLeft > 0
        ? String(profile.notices.friendRequests + profile.notices.guildAttacksLeft)
        : undefined,
  };
}

const Badge = ({ value }: { value?: string }) => (value ? <span className="nav-badge">{value}</span> : null);

/** A click-to-open menu that closes on outside clicks, Escape and navigation. */
function useMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname, location.search]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

function ModeList({ items }: { items: ModeItem[] }) {
  return (
    <div className="mode-list">
      {items.map((m) => (
        <Link key={m.to} to={m.to} className={`mode-item ${m.locked ? 'locked' : ''}`} onClick={() => sfx.click()}>
          <span className="mode-icon">{m.locked ? '🔒' : m.icon}</span>
          <span className="mode-text">
            <b>
              {m.label} {m.badge && <span className="mode-badge">{m.badge}</span>}
            </b>
            <small>{m.status}</small>
          </span>
        </Link>
      ))}
    </div>
  );
}

function SettingsList() {
  const { muted, setMuted, music, setMusic, largeText, setLargeText } = useSettings();
  const { profile } = useProfile();
  return (
    <div className="mode-list">
      <button className="mode-item" onClick={() => setMusic(!music)}>
        <span className="mode-icon">🎵</span>
        <span className="mode-text">
          <b>Music</b>
          <small>{music && !muted ? 'On' : 'Off'}</small>
        </span>
      </button>
      <button className="mode-item" onClick={() => setMuted(!muted)}>
        <span className="mode-icon">{muted ? '🔇' : '🔊'}</span>
        <span className="mode-text">
          <b>Sound</b>
          <small>{muted ? 'Muted' : 'On'}</small>
        </span>
      </button>
      <button className="mode-item" onClick={() => setLargeText(!largeText)}>
        <span className="mode-icon">🔍</span>
        <span className="mode-text">
          <b>Larger text</b>
          <small>{largeText ? 'On' : 'Off'}</small>
        </span>
      </button>
      <Link to="/account" className="mode-item">
        <span className="mode-icon">👤</span>
        <span className="mode-text">
          <b>Account</b>
          <small>
            Lv {profile.account.level} · {profile.user.username ?? 'Guest'}
            {profile.account.title ? ` · ${profile.account.title}` : ''}
          </small>
        </span>
      </Link>
      {profile.user.role === 'admin' && (
        <Link to="/admin" className="mode-item">
          <span className="mode-icon">🛠️</span>
          <span className="mode-text">
            <b>Admin</b>
            <small>Edit game content</small>
          </span>
        </Link>
      )}
    </div>
  );
}

const PLAY_ROUTES = /^\/(campaign|events|dungeons|tower|arena|battle|event|dungeon|guild-battle)(\/|$)/;

/** Desktop navigation: main sections plus a Play menu of game modes. */
export function DesktopNav() {
  const location = useLocation();
  const play = useMenu();
  const modes = usePlayModes();
  const badges = useBadges();
  const inPlay = PLAY_ROUTES.test(location.pathname);

  return (
    <nav className="nav main-nav">
      <NavLink to="/" end className="nav-link">
        <span aria-hidden>🏠</span> Home
        <Badge value={badges.home} />
      </NavLink>
      <div className="nav-menu" ref={play.ref}>
        <button className={`nav-link ${inPlay ? 'active' : ''}`} aria-expanded={play.open} onClick={() => play.setOpen(!play.open)}>
          <span aria-hidden>⚔️</span> Play ▾
        </button>
        {play.open && (
          <div className="nav-dropdown" role="menu">
            <ModeList items={modes} />
          </div>
        )}
      </div>
      <NavLink to="/summon" className="nav-link">
        <span aria-hidden>✦</span> Summon
      </NavLink>
      <NavLink to="/roster" className="nav-link">
        <span aria-hidden>👥</span> Heroes
      </NavLink>
      <NavLink to="/missions" className="nav-link">
        <span aria-hidden>📜</span> Missions
        <Badge value={badges.missions} />
      </NavLink>
      <NavLink to="/social" className="nav-link">
        <span aria-hidden>🤝</span> Social
        <Badge value={badges.social} />
      </NavLink>
    </nav>
  );
}

/** The ⚙ menu: music, sound, account and admin. */
export function SettingsMenu() {
  const menu = useMenu();
  return (
    <div className="nav-menu settings-menu" ref={menu.ref}>
      <button className="mute-btn" aria-expanded={menu.open} onClick={() => menu.setOpen(!menu.open)} title="Settings">
        ⚙
      </button>
      {menu.open && (
        <div className="nav-dropdown right" role="menu">
          <SettingsList />
        </div>
      )}
    </div>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <b>{title}</b>
          <button className="icon-mini" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Phones: a bottom tab bar, with Play and More opening sheets. */
export function MobileTabs() {
  const location = useLocation();
  const [sheet, setSheet] = useState<'play' | 'more' | null>(null);
  const modes = usePlayModes();
  const badges = useBadges();
  useEffect(() => setSheet(null), [location.pathname, location.search]);
  const inPlay = PLAY_ROUTES.test(location.pathname);
  const inMore = /^\/(missions|social|account|admin)/.test(location.pathname);
  const moreBadge = [badges.missions, badges.social].filter(Boolean).length ? '!' : undefined;

  return (
    <>
      <nav className="mobile-tabs" aria-label="Main">
        <NavLink to="/" end className="tab">
          <span>🏠</span>
          <small>Home</small>
          <Badge value={badges.home} />
        </NavLink>
        <button className={`tab ${inPlay ? 'active' : ''}`} onClick={() => setSheet(sheet === 'play' ? null : 'play')}>
          <span>⚔️</span>
          <small>Play</small>
        </button>
        <NavLink to="/summon" className="tab">
          <span>✦</span>
          <small>Summon</small>
        </NavLink>
        <NavLink to="/roster" className="tab">
          <span>👥</span>
          <small>Heroes</small>
        </NavLink>
        <button className={`tab ${inMore ? 'active' : ''}`} onClick={() => setSheet(sheet === 'more' ? null : 'more')}>
          <span>☰</span>
          <small>More</small>
          <Badge value={moreBadge} />
        </button>
      </nav>
      {sheet === 'play' && (
        <Sheet title="Play" onClose={() => setSheet(null)}>
          <ModeList items={modes} />
        </Sheet>
      )}
      {sheet === 'more' && (
        <Sheet title="More" onClose={() => setSheet(null)}>
          <div className="mode-list">
            <Link to="/missions" className="mode-item">
              <span className="mode-icon">📜</span>
              <span className="mode-text">
                <b>
                  Missions <Badge value={badges.missions} />
                </b>
                <small>Daily and one-time goals</small>
              </span>
            </Link>
            <Link to="/social" className="mode-item">
              <span className="mode-icon">🤝</span>
              <span className="mode-text">
                <b>
                  Social <Badge value={badges.social} />
                </b>
                <small>Friends and your guild</small>
              </span>
            </Link>
          </div>
          <SettingsList />
        </Sheet>
      )}
    </>
  );
}
