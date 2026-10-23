import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Routes, useLocation, useNavigate, type Location } from 'react-router-dom';

/** Routes that open a battle (not the lobby screens that list them). */
export const isBattlePath = (path: string) => /^\/(battle|dungeon|event|guild-battle|tower|arena\/fight)\//.test(path);

interface Session {
  id: number;
  /** The route the battle was opened from; it keeps rendering against it while minimized. */
  location: Location;
  /** The fight is over (its results are up), or it never started. */
  finished: boolean;
  /** It's the player's turn and auto is off, so the battle waits for them. */
  waiting: boolean;
}

interface SessionApi {
  /** Shown full size (not minimized in the corner). */
  main: boolean;
  /** Abandons this battle. */
  close: () => void;
  /** Moves this battle on to another battle route (the next stage), minimized or not. */
  moveTo: (to: string) => void;
  report: (status: { finished: boolean; waiting: boolean }) => void;
}

const SessionContext = createContext<SessionApi>({ main: true, close: () => {}, moveTo: () => {}, report: () => {} });

/** The battle a component is part of. */
export const useBattleSession = () => useContext(SessionContext);

const samePlace = (a: Location, b: Location) => a.pathname === b.pathname && a.search === b.search;

let nextId = 1;
const fresh = (location: Location): Session => ({ id: nextId++, location, finished: false, waiting: false });

/**
 * Keeps the player's battle alive across navigation. Only one battle runs at a time: at its
 * URL it fills the page, anywhere else it keeps playing in a small window in the corner, and
 * tapping that brings it back. Opening another battle while it's unfinished asks the player to
 * return to it or abandon it. A finished battle closes once the player moves on from its results.
 *
 * `routes` are the battle routes; the main router renders nothing for them.
 */
export function BattleHost({ routes }: { routes: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const onBattlePath = isBattlePath(location.pathname);
  const main = Boolean(session && onBattlePath && samePlace(session.location, location));
  const blocked = Boolean(session && onBattlePath && !main && !session.finished);

  useEffect(() => {
    setSession((s) => {
      if (!isBattlePath(location.pathname)) return s?.finished ? null : s;
      if (!s || (s.finished && !samePlace(s.location, location))) return fresh(location);
      return s;
    });
  }, [location]);

  const update = useCallback((id: number, patch: Partial<Session>) => {
    setSession((s) => {
      if (!s || s.id !== id || Object.entries(patch).every(([k, v]) => s[k as keyof Session] === v)) return s;
      return { ...s, ...patch };
    });
  }, []);
  const close = useCallback((id: number) => setSession((s) => (s?.id === id ? null : s)), []);
  const moveTo = useCallback(
    (id: number, to: string, main: boolean) => {
      const url = new URL(to, window.location.origin);
      const next = { pathname: url.pathname, search: url.search, hash: '', state: null, key: `moved-${nextId++}` } as Location;
      setSession((s) => (s?.id === id ? { ...s, location: next, finished: false, waiting: false } : s));
      // On screen, the address follows; minimized, the battle moves on quietly in the corner.
      if (main) navigate(to, { replace: true });
    },
    [navigate],
  );

  if (!session) return null;
  const open = () => navigate(session.location.pathname + session.location.search, { state: session.location.state });
  return (
    <>
      {blocked && (
        <div className="panel narrow center battle-busy">
          <h2>You're already in a battle</h2>
          <p className="muted">Only one battle can be played at a time. Finish the one in the corner, or abandon it to start this one.</p>
          <div className="modal-actions">
            <button className="btn primary" onClick={open}>
              Return to battle
            </button>
            <button className="btn" onClick={() => setSession(fresh(location))}>
              Abandon it and start this one
            </button>
          </div>
        </div>
      )}
      <div key={session.id} className={`battle-session ${main ? 'main' : 'pip'}`}>
        <SessionProvider id={session.id} main={main} close={close} moveTo={moveTo} update={update}>
          <Routes location={session.location}>{routes}</Routes>
        </SessionProvider>
        {!main && (
          <>
            <button className="pip-open" onClick={open} title="Back to the battle">
              <span className={`pip-status ${session.finished ? 'done' : session.waiting ? 'waiting' : ''}`}>
                {session.finished ? 'Battle over · see results' : session.waiting ? 'Your turn!' : 'Tap to return'}
              </span>
            </button>
            <button className="pip-close icon-mini" onClick={() => close(session.id)} title="Abandon this battle">
              ✕
            </button>
          </>
        )}
      </div>
    </>
  );
}

function SessionProvider({
  id,
  main,
  close,
  moveTo,
  update,
  children,
}: {
  id: number;
  main: boolean;
  close: (id: number) => void;
  moveTo: (id: number, to: string, main: boolean) => void;
  update: (id: number, patch: Partial<Session>) => void;
  children: ReactNode;
}) {
  const ref = useRef({ close, moveTo, update });
  ref.current = { close, moveTo, update };
  const api = useMemo<SessionApi>(
    () => ({
      main,
      close: () => ref.current.close(id),
      moveTo: (to) => ref.current.moveTo(id, to, main),
      report: (status) => ref.current.update(id, status),
    }),
    [id, main],
  );
  return <SessionContext.Provider value={api}>{children}</SessionContext.Provider>;
}
