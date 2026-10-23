import type { ProfileDTO } from '@gacha/shared';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, errorMessage } from '../api';
import { useToast } from './toast';

interface ProfileContextValue {
  profile: ProfileDTO;
  setProfile: (p: ProfileDTO) => void;
  /** Runs an API call that returns a fresh profile, surfacing errors as toasts. */
  mutate: (call: () => Promise<ProfileDTO>, success?: string) => Promise<boolean>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

// Shared across StrictMode's double-mount so only one guest is ever created.
let bootPromise: Promise<ProfileDTO> | null = null;

async function boot(): Promise<ProfileDTO> {
  try {
    return await api.me();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return api.guest();
    throw err;
  }
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<ProfileDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(() => {
    setError(null);
    bootPromise ??= boot();
    bootPromise.then(setProfile, (err) => {
      bootPromise = null;
      setError(errorMessage(err));
    });
  }, []);

  useEffect(load, [load]);

  const mutate = useCallback<ProfileContextValue['mutate']>(
    async (call, success) => {
      try {
        setProfile(await call());
        if (success) toast(success);
        return true;
      } catch (err) {
        toast(errorMessage(err), 'error');
        return false;
      }
    },
    [toast],
  );

  if (error) {
    return (
      <div className="boot">
        <p>Couldn't reach the server: {error}</p>
        <button className="btn primary" onClick={load}>
          Retry
        </button>
      </div>
    );
  }
  if (!profile) return <div className="boot">Loading…</div>;

  return <ProfileContext.Provider value={{ profile, setProfile, mutate }}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used inside ProfileProvider');
  return ctx;
}
