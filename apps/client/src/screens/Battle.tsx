import {
  chapterOf,
  FEATURE_INFO,
  newlyUnlocked,
  staminaCost,
  currentActor,
  isHardUnlocked,
  isStageUnlocked,
  nextStage,
  skillFor,
  validTargets,
  type ActionKind,
  type CompleteBattleResponse,
  type DungeonDef,
  type EventDef,
  type Feature,
  type SceneTheme,
  type StageDef,
  type StartBattleResponse,
  UI_ICONS,
  guideStep,
  towerFloor,
  describeTrial,
} from '@gacha/shared';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { music } from '../audio/music';
import { sfx } from '../audio/sfx';
import { BattleStage } from '../battle/BattleStage';
import { Hud } from '../battle/Hud';
import { BattleTutorial } from '../battle/Tutorial';
import { useBattleSession } from '../battle/sessions';
import { useBattle, type LogLine } from '../battle/useBattle';
import '../battle/battle.css';
import { Icon } from '../components/Art';
import { GearChip } from '../components/Gear';
import { MaterialChip } from '../components/Materials';
import { ObjectiveList, Stars } from '../components/Stars';
import { useContent } from '../state/content';
import { useProfile } from '../state/profile';
import { useSettings } from '../state/settings';

/** Where a battle comes from: a campaign stage (maybe on hard), an arena opponent or a dungeon tier. */
type BattleSource =
  | { kind: 'campaign'; stage: StageDef; hard: boolean; friendId?: string }
  | { kind: 'arena'; opponentId: string; opponentName: string }
  | { kind: 'dungeon'; dungeon: DungeonDef; tier: number }
  | { kind: 'event'; event: EventDef; stage: number; friendId?: string }
  | { kind: 'guild'; boss: string }
  | { kind: 'tower'; floor: number };

export function BattleScreen() {
  const { stageId = '' } = useParams();
  const [params] = useSearchParams();
  const hard = params.get('hard') === '1';
  const friend = params.get('friend') ?? undefined;
  const [attempt, setAttempt] = useState(0);
  const [autoNext, setAutoNext] = useState(false);
  const session = useBattleSession();
  const stage = useContent().stagesById[stageId];
  if (!stage) {
    return (
      <p className="center muted">
        Unknown stage. <Link to="/campaign">Back to campaign</Link>
      </p>
    );
  }
  // Remounting on retry (or a new stage) gives a fresh server battle.
  return (
    <BattleRunner
      key={`${stage.id}#${hard}#${attempt}`}
      // A friend's hero can be borrowed once a day, so only the first attempt brings them.
      source={{ kind: 'campaign', stage, hard, friendId: attempt === 0 ? friend : undefined }}
      autoStart={autoNext}
      onRetry={(auto = false) => {
        setAutoNext(auto);
        setAttempt((a) => a + 1);
      }}
      onAdvance={(to, auto) => {
        setAutoNext(auto);
        setAttempt(0);
        session.moveTo(to);
      }}
    />
  );
}

export function EventBattleScreen() {
  const { eventId = '', stage = '0' } = useParams();
  const [params] = useSearchParams();
  const friend = params.get('friend') ?? undefined;
  const [attempt, setAttempt] = useState(0);
  const [autoNext, setAutoNext] = useState(false);
  const event = useContent().bundle.events.find((e) => e.id === eventId);
  const s = Number(stage);
  if (!event || !event.stages[s]) {
    return (
      <p className="center muted">
        Unknown event stage. <Link to="/events">Back to events</Link>
      </p>
    );
  }
  return (
    <BattleRunner
      key={`${eventId}#${s}#${attempt}`}
      source={{ kind: 'event', event, stage: s, friendId: attempt === 0 ? friend : undefined }}
      autoStart={autoNext}
      onRetry={(auto = false) => {
        setAutoNext(auto);
        setAttempt((a) => a + 1);
      }}
    />
  );
}

export function GuildBattleScreen() {
  const boss = useParams().boss ?? '';
  return <BattleRunner source={{ kind: 'guild', boss }} />;
}

export function TowerBattleScreen() {
  const floor = Number(useParams().floor ?? '1');
  const [attempt, setAttempt] = useState(0);
  const [autoNext, setAutoNext] = useState(false);
  const session = useBattleSession();
  return (
    <BattleRunner
      key={`${floor}#${attempt}`}
      source={{ kind: 'tower', floor }}
      autoStart={autoNext}
      onRetry={() => setAttempt((a) => a + 1)}
      onAdvance={(to, auto) => {
        setAutoNext(auto);
        setAttempt(0);
        session.moveTo(to);
      }}
    />
  );
}

export function DungeonBattleScreen() {
  const { dungeonId = '', tier = '0' } = useParams();
  const [attempt, setAttempt] = useState(0);
  const [autoNext, setAutoNext] = useState(false);
  const dungeon = useContent().dungeonsById[dungeonId];
  const t = Number(tier);
  if (!dungeon || !dungeon.tiers[t]) {
    return (
      <p className="center muted">
        Unknown dungeon. <Link to="/dungeons">Back to dungeons</Link>
      </p>
    );
  }
  return (
    <BattleRunner
      key={`${dungeonId}#${t}#${attempt}`}
      source={{ kind: 'dungeon', dungeon, tier: t }}
      autoStart={autoNext}
      onRetry={(auto = false) => {
        setAutoNext(auto);
        setAttempt((a) => a + 1);
      }}
    />
  );
}

export function ArenaBattleScreen() {
  const { opponentId = '' } = useParams();
  const location = useLocation();
  const opponentName = (location.state as { name?: string } | null)?.name ?? 'Arena rival';
  return <BattleRunner key={opponentId} source={{ kind: 'arena', opponentId, opponentName }} />;
}

/** A follow-up run queued after a victory: the same battle again (repeat) or the next stage or floor (continue). */
type Queued = { kind: 'repeat'; in: number } | { kind: 'advance'; in: number; label: string; to: string };

function BattleRunner({
  source,
  onRetry,
  onAdvance,
  autoStart = false,
}: {
  source: BattleSource;
  onRetry?: (auto?: boolean) => void;
  /** Moves on to the next battle at this route (with auto battle on or off). */
  onAdvance?: (to: string, auto: boolean) => void;
  autoStart?: boolean;
}) {
  const navigate = useNavigate();
  const { profile, setProfile } = useProfile();
  const { speed, setSpeed, muted, setMuted, repeat, setRepeat, advance, setAdvance } = useSettings();
  // Progress before this battle, to celebrate features it unlocks.
  const clearedBefore = useRef(profile.clearedStages);
  const [tutorialDone, setTutorialDone] = useState(false);
  const [queued, setQueued] = useState<Queued | null>(null);
  const content = useContent();
  const [battle, setBattle] = useState<StartBattleResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompleteBattleResponse | null>(null);
  const [mode, setMode] = useState<ActionKind>('basic');
  const started = useRef(false);
  const submitted = useRef(false);
  const b = useBattle(battle?.setup ?? null, speed, autoStart);
  const session = useBattleSession();

  const theme: SceneTheme =
    source.kind === 'tower'
      ? towerFloor(content, source.floor).theme
      : source.kind === 'arena' || source.kind === 'guild'
      ? 'cosmos'
      : source.kind === 'dungeon'
        ? source.dungeon.theme
        : source.kind === 'event'
          ? source.event.theme
          : (chapterOf(content, source.stage.id)?.theme ?? 'meadow');
  const exitTo = { arena: '/arena', dungeon: '/dungeons', event: '/events', guild: '/social?tab=guild', campaign: '/campaign', tower: '/tower' }[source.kind];

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const start =
      source.kind === 'arena'
        ? api.arena.start(source.opponentId)
        : source.kind === 'dungeon'
          ? api.startDungeon(source.dungeon.id, source.tier)
          : source.kind === 'event'
            ? api.startEvent(source.event.id, source.stage, source.friendId)
            : source.kind === 'guild'
              ? api.guild.attack()
              : source.kind === 'tower'
                ? api.startTower(source.floor)
                : api.startBattle(source.stage.id, source.hard, source.friendId);
    start.then(setBattle, (err) => setError(errorMessage(err)));
  }, [source]);

  // Boss fights get the tense track.
  useEffect(() => {
    const lineup =
      source.kind === 'campaign'
        ? [...source.stage.enemies, ...source.stage.waves.flat()]
        : source.kind === 'dungeon'
          ? [...source.dungeon.tiers[source.tier]!.enemies, ...source.dungeon.tiers[source.tier]!.waves.flat()]
          : source.kind === 'event'
            ? [...source.event.stages[source.stage]!.enemies, ...source.event.stages[source.stage]!.waves.flat()]
            : source.kind === 'tower'
              ? towerFloor(content, source.floor).encounter.enemies
              : [];
    // A minimized battle leaves the music to whatever is on screen.
    if (session.main) music.play(source.kind === 'guild' || lineup.some((e) => content.enemiesById[e.id]?.boss) ? 'boss' : 'battle');
  }, [source, content, session.main]);

  // Tell the corner window how this battle is doing.
  const waitingForPlayer = (() => {
    const v = b.view;
    const a = v && currentActor(v);
    return Boolean(a && a.side === 'ally' && !b.auto && !b.busy && v.outcome === 'ongoing');
  })();
  const { report } = session;
  useEffect(() => report({ finished: Boolean(result || error), waiting: waitingForPlayer }), [report, result, error, waitingForPlayer]);

  // Read inside the async result handler, where state would be stale.
  const repeatRef = useRef(repeat);
  repeatRef.current = repeat;
  const advanceRef = useRef(advance);
  advanceRef.current = advance;
  const autoRef = useRef(b.auto);
  autoRef.current = b.auto;

  // Countdown to the queued run.
  useEffect(() => {
    if (!queued) return;
    if (queued.in <= 0) {
      if (queued.kind === 'repeat') onRetry?.(true);
      else onAdvance?.(queued.to, autoRef.current);
      return;
    }
    const t = setTimeout(() => setQueued((q) => (q ? { ...q, in: q.in - 1 } : null)), 1000);
    return () => clearTimeout(t);
  }, [queued, onRetry, onAdvance]);

  // Default to the basic attack at the start of each turn.
  useEffect(() => setMode('basic'), [b.view?.actorUid]);

  // Report the result once the fight ends; the server replays it to verify.
  const outcome = b.view?.outcome;
  useEffect(() => {
    if (!battle || !outcome || outcome === 'ongoing' || submitted.current) return;
    submitted.current = true;
    const shownAt = Date.now();
    api.completeBattle(battle.battleId, b.director.actions).then(
      (res) => {
        // Let the victory/defeat banner play before the results card.
        setTimeout(() => {
          setProfile(res.profile);
          setResult(res);
          if (res.rewards.gold) sfx.coins();
          // Repeat mode: queue the next auto run while it's affordable.
          const settings = content.settings;
          const affordable =
            source.kind === 'campaign'
              ? res.profile.stamina.current >= staminaCost(settings.stamina, source.hard)
              : source.kind === 'event'
                ? res.profile.stamina.current >= staminaCost(settings.stamina, false)
                : source.kind === 'tower' || (source.kind === 'dungeon' && (res.dungeon?.runsLeft ?? 0) > 0);
          // The tower costs nothing, but a cleared floor can't be fought again: it can only go on, not repeat.
          if (res.outcome !== 'victory' || !affordable) return;
          // Continue mode: on to the next stage (or floor) after any win, manual or auto.
          if (advanceRef.current && onAdvance && (source.kind === 'campaign' || source.kind === 'tower')) {
            const step = nextBattle(content, source, res.profile.clearedStages);
            if (step) setQueued({ kind: 'advance', in: 3, ...step });
          } else if (repeatRef.current && autoRef.current && onRetry && source.kind !== 'tower') {
            setQueued({ kind: 'repeat', in: 3 });
          }
        }, Math.max(0, 1500 - (Date.now() - shownAt)));
      },
      (err) => setError(errorMessage(err)),
    );
  }, [battle, outcome, b.director, setProfile, content, source, onRetry, onAdvance]);

  if (error) {
    return (
      <div className="center">
        <p className="error-text">{error}</p>
        <Link className="btn" to={exitTo}>
          Back
        </Link>
      </div>
    );
  }
  const state = b.view;
  if (!state) return <p className="center muted">Preparing battle…</p>;

  const actor = currentActor(state);
  const playerTurn = Boolean(actor && actor.side === 'ally' && !b.auto && !b.busy && state.outcome === 'ongoing');
  const activeSkill = actor && playerTurn ? skillFor(actor, mode) : null;
  const targetIds = new Set(
    actor && activeSkill && activeSkill.targeting !== 'none' ? validTargets(state, actor, activeSkill).map((u) => u.uid) : [],
  );
  const select = (uid: string) => {
    if (targetIds.has(uid)) void b.director.perform({ kind: mode, target: uid });
  };

  const waitingText =
    state.outcome !== 'ongoing'
      ? state.outcome === 'victory'
        ? 'Victory!'
        : 'Defeat…'
      : b.auto
        ? 'Auto battle…'
        : actor
          ? actor.side === 'enemy'
            ? `${actor.emoji} ${actor.name} is acting…`
            : `${actor.emoji} ${actor.name}…`
          : '…';

  return (
    <div className="battle">
      <BattleStage
        state={state}
        theme={theme}
        slots={b.director.slots}
        anims={b.anims}
        fx={b.fx}
        spells={b.spells}
        popups={b.popups}
        cutin={b.cutin}
        ultimate={b.ultimate}
        banner={b.banner}
        alert={b.alert}
        targetIds={targetIds}
        speed={speed}
        onSelect={select}
        registerShake={b.director.setShake}
        title={
          <>
            <button
              className="icon-btn"
              onClick={() => {
                session.close();
                navigate(exitTo);
              }}
              title="Retreat"
            >
              ←
            </button>
            <button className="icon-btn" onClick={() => navigate(exitTo)} title="Minimize: keep this battle going in the corner">
              ▾
            </button>
            <span>
              {source.kind === 'arena' ? (
                <>
                  <b>🏟️ Arena</b> vs {source.opponentName}
                </>
              ) : source.kind === 'dungeon' ? (
                <>
                  <b>
                    {source.dungeon.emoji} {source.dungeon.name}
                  </b>{' '}
                  {source.dungeon.tiers[source.tier]!.name}
                </>
              ) : source.kind === 'event' ? (
                <>
                  <b>
                    {source.event.emoji} {source.event.name}
                  </b>{' '}
                  {source.event.stages[source.stage]!.name}
                </>
              ) : source.kind === 'tower' ? (
                <>
                  <b>🗼 Tower</b> Floor {source.floor}
                  {towerFloor(content, source.floor).trial && <span className="wave-chip">{describeTrial(towerFloor(content, source.floor).trial!).name}</span>}
                </>
              ) : source.kind === 'guild' ? (
                <>
                  <b>🛡️ Guild boss</b> {content.enemiesById[source.boss]?.name}
                  <span className="wave-chip">
                    Turn {Math.min(state.turns, state.turnLimit)}/{state.turnLimit}
                  </span>
                </>
              ) : (
                <>
                  <b>{source.stage.id}</b> {source.stage.name}
                  {source.hard && <span className="hard-chip">HARD</span>}
                </>
              )}
              {state.waves > 1 && (
                <span className="wave-chip">
                  Wave {state.wave}/{state.waves}
                </span>
              )}
            </span>
          </>
        }
        controls={
          <>
            <button className={`icon-btn ${b.auto ? 'on' : ''}`} onClick={() => b.setAuto(!b.auto)} title="Auto battle">
              AUTO
            </button>
            <button className={`icon-btn ${speed > 1 ? 'on' : ''}`} onClick={() => setSpeed(speed === 3 ? 1 : speed === 2 ? 3 : 2)} title="Battle speed">
              {speed}×
            </button>
            {(source.kind === 'campaign' || source.kind === 'tower') && (
              <button
                className={`icon-btn ${advance ? 'on' : ''}`}
                onClick={() => setAdvance(!advance)}
                title={`Continue: after each victory, go on to the next ${source.kind === 'tower' ? 'floor' : 'stage'} automatically${source.kind === 'campaign' ? ' (while you have stamina)' : ''}`}
              >
                ⏭
              </button>
            )}
            {source.kind !== 'arena' && source.kind !== 'guild' && source.kind !== 'tower' && (
              <button
                className={`icon-btn ${repeat ? 'on' : ''}`}
                onClick={() => setRepeat(!repeat)}
                title="Repeat: after an auto victory, start the next run automatically (while you have stamina or runs)"
              >
                🔁
              </button>
            )}
            <button className="icon-btn" onClick={() => setMuted(!muted)} title={muted ? 'Unmute' : 'Mute'}>
              {muted ? '🔇' : '🔊'}
            </button>
          </>
        }
      />

      <Hud
        state={state}
        actor={actor}
        playerTurn={playerTurn}
        mode={mode}
        activeSkill={activeSkill}
        targetIds={targetIds}
        waitingText={waitingText}
        onMode={setMode}
        onInstant={(kind) => void b.director.perform({ kind })}
        onSelect={select}
      />

      <BattleLog lines={b.log} />

      {source.kind === 'campaign' &&
        !source.hard &&
        source.stage.id === content.stages[0]?.id &&
        !profile.flags.includes('tutorial-battle') &&
        !tutorialDone &&
        playerTurn && (
          <BattleTutorial
            onDone={() => {
              setTutorialDone(true);
              api.addFlag('tutorial-battle').then(setProfile, () => {});
            }}
          />
        )}

      {result && (
        <ResultModal
          result={result}
          source={source}
          onRetry={onRetry}
          unlocked={newlyUnlocked(content.settings, clearedBefore.current, result.profile.clearedStages)}
          queued={queued}
          onStopQueued={() => setQueued(null)}
        />
      )}
    </div>
  );
}

/** Where Continue goes after a win: the next stage in the same mode once it's unlocked, or the next tower floor. */
function nextBattle(content: ReturnType<typeof useContent>, source: BattleSource, cleared: string[]): { label: string; to: string } | null {
  if (source.kind === 'tower') return { label: `Floor ${source.floor + 1}`, to: `/tower/${source.floor + 1}` };
  if (source.kind !== 'campaign') return null;
  const next = nextStage(content, source.stage.id);
  if (!next) return null;
  if (source.hard) return isHardUnlocked(content, next.id, cleared) ? { label: `${next.id} ${next.name} (Hard)`, to: `/battle/${next.id}?hard=1` } : null;
  return isStageUnlocked(content, next.id, cleared) ? { label: `${next.id} ${next.name}`, to: `/battle/${next.id}` } : null;
}

function BattleLog({ lines }: { lines: LogLine[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [lines]);
  return (
    <details className="battle-log-wrap">
      <summary>Battle log</summary>
      <div className="battle-log" ref={ref}>
        {lines.map((l) => (
          <div key={l.id}>{l.text}</div>
        ))}
      </div>
    </details>
  );
}

function ResultModal({
  result,
  source,
  onRetry,
  unlocked,
  queued,
  onStopQueued,
}: {
  result: CompleteBattleResponse;
  source: BattleSource;
  onRetry?: (auto?: boolean) => void;
  unlocked: Feature[];
  queued: Queued | null;
  onStopQueued: () => void;
}) {
  const navigate = useNavigate();
  const content = useContent();
  const won = result.outcome === 'victory';
  const next = source.kind === 'campaign' && !source.hard ? nextStage(content, source.stage.id) : undefined;
  // After the first win, the new-player tutorial carries on in the roster.
  const { profile } = useProfile();
  const tutorial = won && guideStep(content, profile) === 'levelUp';
  const dungeon = result.dungeon;
  const arena = result.arena;

  return (
    <div className="modal-backdrop">
      {/* A guild attack is timed and can't be won: it ends when time runs out. */}
      <div className={`modal result ${won || source.kind === 'guild' ? 'victory' : 'defeat'}`}>
        <div className="result-icon">{source.kind === 'guild' ? '⚔️' : won ? '🏆' : '💀'}</div>
        <h2>{source.kind === 'guild' ? 'Attack complete!' : won ? 'Victory!' : 'Defeat'}</h2>
        <p className="muted">
          {source.kind === 'campaign'
            ? `${source.stage.id} · ${source.stage.name}${source.hard ? ' (Hard)' : ''}`
            : source.kind === 'dungeon'
              ? `${source.dungeon.name} · ${source.dungeon.tiers[source.tier]!.name}`
              : source.kind === 'event'
                ? `${source.event.name} · ${source.event.stages[source.stage]!.name}`
                : source.kind === 'guild'
                  ? 'Guild boss attack'
                  : source.kind === 'tower'
                    ? `Endless Tower · Floor ${source.floor}${result.tower && won ? ` · best ${result.tower.best}` : ''}`
                    : `Arena vs ${source.opponentName}`}
        </p>

        {arena && (
          <div className={`rating-change ${arena.delta >= 0 ? 'up' : 'down'}`}>
            <span>{arena.ratingBefore}</span>
            <span className="arrow">→</span>
            <b>{arena.ratingAfter}</b>
            <span className="delta">
              {arena.delta >= 0 ? '+' : ''}
              {arena.delta}
            </span>
          </div>
        )}

        {unlocked.map((f) => (
          <Link key={f} to={f === 'arena' ? '/arena' : '/dungeons'} className="unlock-banner">
            <span className="unlock-icon">{FEATURE_INFO[f].icon}</span>
            <span>
              <b>🔓 {FEATURE_INFO[f].label} unlocked!</b>
              <small>{FEATURE_INFO[f].blurb}</small>
            </span>
          </Link>
        ))}
        {queued && (
          <p className="repeat-note">
            {queued.kind === 'repeat' ? `🔁 Next run in ${queued.in}…` : `⏭ ${queued.label} in ${queued.in}…`}{' '}
            <button className="btn small" onClick={onStopQueued}>
              Stop
            </button>
          </p>
        )}
        {result.xp && <XpBar xp={result.xp} />}
        {result.guild && (
          <div className="guild-result">
            <div className="guild-damage">💥 {result.guild.damage.toLocaleString()} damage</div>
            <small className="muted">
              Guild total {result.guild.total.toLocaleString()} / {result.guild.pool.toLocaleString()} · {result.guild.attemptsLeft} attack
              {result.guild.attemptsLeft === 1 ? '' : 's'} left today
            </small>
          </div>
        )}
        {result.event && source.kind === 'event' && (
          <p className="event-gain">
            +{result.event.currency} {source.event.currency.emoji} {source.event.currency.name}
          </p>
        )}
        {dungeon && <p className="muted small">{dungeon.runsLeft} winning run{dungeon.runsLeft === 1 ? '' : 's'} left today</p>}
        {source.kind === 'campaign' && !source.hard && won && source.stage.objectives.length > 0 && (
          <div className="result-stars">
            <Stars value={result.stars} max={source.stage.objectives.length} size="lg" animate />
            {result.newBest && !result.firstClear && <span className="new-best">New best!</span>}
            <ObjectiveList objectives={source.stage.objectives} met={result.objectives} />
          </div>
        )}

        {won || source.kind === 'guild' ? (
          <div className="rewards">
            {result.firstClear && result.rewards.gems > 0 && <p className="r5-text first-clear">✦ First clear bonus ✦</p>}
            <div className="reward-row">
              {result.rewards.gems > 0 && (
                <span className="reward">
                  <Icon id={UI_ICONS.gems} size={32} />+{result.rewards.gems}
                </span>
              )}
              {result.rewards.gold > 0 && (
                <span className="reward" style={{ animationDelay: '0.15s' }}>
                  <Icon id={UI_ICONS.gold} size={32} />+{result.rewards.gold}
                </span>
              )}
            </div>
            {result.drops.length > 0 && (
              <div className="drops">
                <small className="muted">Loot</small>
                <div className="drop-row">
                  {result.drops.map((g, i) => (
                    <div key={g.id} className="drop" style={{ animationDelay: `${0.35 + i * 0.15}s` }}>
                      <GearChip item={g} />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {result.materials.length > 0 && (
              <div className="drop-row">
                {result.materials.map((m, i) => (
                  <span key={m.id} className="drop" style={{ animationDelay: `${0.5 + i * 0.12}s` }}>
                    <MaterialChip id={m.id} count={m.count} size={24} />
                  </span>
                ))}
              </div>
            )}
            {result.salvaged.count > 0 && (
              <p className="small muted">
                ♻️ Auto-salvaged {result.salvaged.count} item{result.salvaged.count === 1 ? '' : 's'} for 🪙 {result.salvaged.gold}
                {result.salvaged.stones > 0 && ` and 🔨 ${result.salvaged.stones}`}
              </p>
            )}
            {result.inventoryFull && <p className="warn-text small">Your gear bag is full, so some loot was lost. Salvage old gear in the Roster.</p>}
          </div>
        ) : (
          <p className="muted">
            {source.kind === 'arena' ? 'Strengthen your team and try another opponent.' : 'Level up and gear your heroes in the Roster, or try a different lineup.'}
          </p>
        )}

        <div className="modal-actions">
          {source.kind === 'campaign' ? (
            <>
              <button className="btn" onClick={() => onRetry?.()}>
                {won ? 'Fight again' : 'Retry'}
              </button>
              {tutorial ? (
                <button className="btn primary" onClick={() => navigate('/roster')}>
                  Continue tutorial ▶
                </button>
              ) : (
                won &&
                next && (
                  <button className="btn primary" onClick={() => navigate(`/battle/${next.id}`)}>
                    Next: {next.id} ▶
                  </button>
                )
              )}
              <button className="btn" onClick={() => navigate(won ? '/campaign' : '/roster')}>
                {won ? 'Campaign' : 'Roster'}
              </button>
            </>
          ) : source.kind === 'guild' ? (
            <button className="btn primary" onClick={() => navigate('/social?tab=guild')}>
              Back to guild
            </button>
          ) : source.kind === 'event' ? (
            <>
              <button className="btn" onClick={() => onRetry?.()}>
                {won ? 'Fight again' : 'Retry'}
              </button>
              <button className="btn primary" onClick={() => navigate('/events')}>
                Event
              </button>
            </>
          ) : source.kind === 'tower' ? (
            <>
              {won ? (
                <button className="btn primary" onClick={() => navigate(`/tower/${source.floor + 1}`)}>
                  Floor {source.floor + 1} ▶
                </button>
              ) : (
                <button className="btn primary" onClick={() => onRetry?.()}>
                  Retry
                </button>
              )}
              <button className="btn" onClick={() => navigate('/tower')}>
                Tower
              </button>
            </>
          ) : source.kind === 'dungeon' ? (
            <>
              <button className="btn" onClick={() => onRetry?.()} disabled={won && (dungeon?.runsLeft ?? 0) <= 0}>
                {won ? 'Run again' : 'Retry'}
              </button>
              <button className="btn primary" onClick={() => navigate('/dungeons')}>
                Dungeons
              </button>
            </>
          ) : (
            <button className="btn primary" onClick={() => navigate('/arena')}>
              Back to arena
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** XP from the battle, with a level-up flourish. */
function XpBar({ xp }: { xp: NonNullable<CompleteBattleResponse['xp']> }) {
  const { profile } = useProfile();
  const a = profile.account;
  const pct = a.xpNeed ? Math.round((a.xpInto / a.xpNeed) * 100) : 100;
  return (
    <div className={`xp-result ${xp.levelsGained ? 'up' : ''}`}>
      {xp.levelsGained > 0 && (
        <div className="level-up">
          ⬆ Level {xp.level}! <small>+{xp.reward.gems} 💎 · +{xp.reward.stamina} ⚡</small>
        </div>
      )}
      <div className="xp-line">
        <span>Lv {a.level}</span>
        <span className="xp-track">
          <span style={{ width: `${pct}%` }} />
        </span>
        <span className="muted">+{xp.gained} XP</span>
      </div>
    </div>
  );
}
