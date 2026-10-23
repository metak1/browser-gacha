import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { music as musicPlayer } from '../audio/music';
import { setMuted as setSfxMuted } from '../audio/sfx';

export type BattleSpeed = 1 | 2 | 3;

interface Settings {
  muted: boolean;
  setMuted: (v: boolean) => void;
  speed: BattleSpeed;
  setSpeed: (v: BattleSpeed) => void;
  /** Replay won auto battles back to back. */
  repeat: boolean;
  setRepeat: (v: boolean) => void;
  /** After a campaign victory, go on to the next stage. Can't be on together with `repeat`. */
  advance: boolean;
  setAdvance: (v: boolean) => void;
  /** Background music (sound effects are controlled by `muted`, which silences both). */
  music: boolean;
  setMusic: (v: boolean) => void;
  /** Scales all text up by 12.5% (see pixel-theme.css). */
  largeText: boolean;
  setLargeText: (v: boolean) => void;
}

const STORAGE_KEY = 'starlit-settings';

// Settings are a per-device convenience; storage may be unavailable (private mode).
function read(): { muted: boolean; speed: BattleSpeed; repeat: boolean; advance: boolean; music: boolean; largeText: boolean } {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as { muted?: unknown; speed?: unknown; repeat?: unknown; advance?: unknown; music?: unknown; largeText?: unknown };
    return {
      muted: raw.muted === true,
      speed: raw.speed === 3 ? 3 : raw.speed === 2 ? 2 : 1,
      repeat: raw.repeat === true,
      advance: raw.advance === true && raw.repeat !== true,
      music: raw.music !== false,
      largeText: raw.largeText === true,
    };
  } catch {
    return { muted: false, speed: 1, repeat: false, advance: false, music: true, largeText: false };
  }
}

const SettingsContext = createContext<Settings | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(read);
  const [muted, setMuted] = useState(initial.muted);
  const [speed, setSpeed] = useState<BattleSpeed>(initial.speed);
  const [repeat, setRepeatState] = useState(initial.repeat);
  const [advance, setAdvanceState] = useState(initial.advance);
  const setRepeat = (v: boolean) => {
    setRepeatState(v);
    if (v) setAdvanceState(false);
  };
  const setAdvance = (v: boolean) => {
    setAdvanceState(v);
    if (v) setRepeatState(false);
  };
  const [music, setMusic] = useState(initial.music);
  const [largeText, setLargeText] = useState(initial.largeText);

  useEffect(() => {
    setSfxMuted(muted);
    musicPlayer.setEnabled(music && !muted);
    document.documentElement.classList.toggle('large-text', largeText);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ muted, speed, repeat, advance, music, largeText }));
    } catch {
      // ignore
    }
  }, [muted, speed, repeat, advance, music, largeText]);

  return (
    <SettingsContext.Provider value={{ muted, setMuted, speed, setSpeed, repeat, setRepeat, advance, setAdvance, music, setMusic, largeText, setLargeText }}>{children}</SettingsContext.Provider>
  );
}

export function useSettings(): Settings {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
