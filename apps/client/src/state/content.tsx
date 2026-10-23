import { indexContent, setUnitNames, type ContentBundle, type ContentIndex } from '@gacha/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, errorMessage } from '../api';

interface ContentContextValue {
  content: ContentIndex;
  /** Swap in a new bundle (e.g. the one an admin save returned). */
  setBundle: (bundle: ContentBundle) => void;
  reload: () => Promise<void>;
}

const ContentContext = createContext<ContentContextValue | null>(null);

// Shared across StrictMode's double-mount.
let bootPromise: Promise<ContentBundle> | null = null;

/**
 * Loads the game's content (units, spells, stages, settings...) from the
 * server. Everything the UI shows about the game comes from here, so admin
 * edits appear without a new client build.
 */
export function ContentProvider({ children }: { children: ReactNode }) {
  const [bundle, setBundle] = useState<ContentBundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    bootPromise ??= api.content();
    bootPromise.then(setBundle, (err) => {
      bootPromise = null;
      setError(errorMessage(err));
    });
  }, []);
  useEffect(load, [load]);

  const reload = useCallback(async () => setBundle(await api.content()), []);
  const content = useMemo(() => {
    if (!bundle) return null;
    // Spell descriptions name summoned units ("Summon 2 Spark Imps").
    setUnitNames(Object.fromEntries(bundle.enemies.map((e) => [e.id, e.name])));
    return indexContent(bundle);
  }, [bundle]);

  if (error) {
    return (
      <div className="boot">
        <p>Couldn't load game data: {error}</p>
        <button className="btn primary" onClick={load}>
          Retry
        </button>
      </div>
    );
  }
  if (!content) return <div className="boot">Loading…</div>;
  return <ContentContext.Provider value={{ content, setBundle, reload }}>{children}</ContentContext.Provider>;
}

export function useContentState(): ContentContextValue {
  const ctx = useContext(ContentContext);
  if (!ctx) throw new Error('useContent must be used inside ContentProvider');
  return ctx;
}

export const useContent = (): ContentIndex => useContentState().content;
