import type { StaminaState } from '@gacha/shared';
import { useEffect, useState } from 'react';
import { api } from '../api';
import { useContent } from '../state/content';
import { useProfile } from '../state/profile';

/**
 * The profile's stamina, regenerated locally between server updates so the
 * number ticks up without refetching. The server stays the source of truth.
 */
export function useLiveStamina(): StaminaState {
  const { profile } = useProfile();
  const { regenMinutes } = useContent().settings.stamina;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);
  const s = profile.stamina;
  if (s.nextAt === null || now < s.nextAt) return s;
  const step = regenMinutes * 60_000;
  const gained = 1 + Math.floor((now - s.nextAt) / step);
  const current = Math.min(s.max, s.current + gained);
  return { current, max: s.max, nextAt: current >= s.max ? null : s.nextAt + gained * step };
}

const minutesUntil = (at: number) => Math.max(1, Math.ceil((at - Date.now()) / 60_000));

/** Top-bar stamina counter; clicking offers a gem refill. */
export function StaminaPill() {
  const s = useLiveStamina();
  const { refillGems, refillAmount } = useContent().settings.stamina;
  const { mutate } = useProfile();
  const title = `Stamina: campaign battles and sweeps use it. ${
    s.nextAt ? `+1 in ${minutesUntil(s.nextAt)} min.` : 'Full.'
  } Click to refill ${refillAmount} for ${refillGems} gems.`;
  return (
    <button
      className={`pill stamina-pill ${s.current < 12 ? 'low' : ''}`}
      title={title}
      onClick={() => {
        if (window.confirm(`Refill ${refillAmount} stamina for ${refillGems} gems?`)) void mutate(api.refillStamina, `+${refillAmount} stamina`);
      }}
    >
      ⚡ {s.current}
      <span className="stamina-max">/{s.max}</span>
    </button>
  );
}

/** Inline "not enough stamina" with a refill button. */
export function StaminaShort({ need }: { need: number }) {
  const s = useLiveStamina();
  const { refillGems, refillAmount } = useContent().settings.stamina;
  const { mutate } = useProfile();
  return (
    <span className="stamina-short small">
      Need ⚡{need} (have {s.current}
      {s.nextAt ? `, +1 in ${minutesUntil(s.nextAt)} min` : ''}){' '}
      <button className="btn small" onClick={() => void mutate(api.refillStamina, `+${refillAmount} stamina`)}>
        Refill 💎{refillGems}
      </button>
    </span>
  );
}
