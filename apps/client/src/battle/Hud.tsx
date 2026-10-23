import { describeSkill, ENERGY, type ActionKind, type BattleState, type BattleUnit, type Skill } from '@gacha/shared';
import { useEffect, type CSSProperties } from 'react';
import { sfx } from '../audio/sfx';
import { Icon, UnitArt, PixelEmoji } from '../components/Art';

interface Props {
  state: BattleState;
  actor: BattleUnit | null;
  playerTurn: boolean;
  mode: ActionKind;
  activeSkill: Skill | null;
  targetIds: Set<string>;
  waitingText: string;
  onMode: (mode: ActionKind) => void;
  /** Used for skills/ultimates that don't need a target. */
  onInstant: (kind: ActionKind) => void;
  onSelect: (uid: string) => void;
}

/** Party portraits and action buttons under the battle stage. */
export function Hud({ state, actor, playerTurn, mode, activeSkill, targetIds, waitingText, onMode, onInstant, onSelect }: Props) {
  const allies = state.units.filter((u) => u.side === 'ally');
  const skillReady = Boolean(actor?.skill && actor.cooldown === 0);
  const ultReady = Boolean(actor?.ultimate && actor.energy >= ENERGY.max);

  const choose = (kind: ActionKind) => {
    if (!actor) return;
    const skill = kind === 'skill' ? actor.skill : kind === 'ultimate' ? actor.ultimate : actor.basic;
    if (!skill || (kind === 'skill' && !skillReady) || (kind === 'ultimate' && !ultReady)) return;
    sfx.click();
    if (skill.targeting === 'none') onInstant(kind);
    else onMode(kind);
  };

  // Keyboard: Q = basic, E = skill, R = ultimate.
  useEffect(() => {
    if (!playerTurn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const key = e.key.toLowerCase();
      if (key === 'q') choose('basic');
      if (key === 'e') choose('skill');
      if (key === 'r') choose('ultimate');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const hint = activeSkill?.targeting === 'enemy' ? 'Tap an enemy' : activeSkill?.targeting === 'ally' ? 'Tap an ally' : '';

  return (
    <div className="hud">
      <div className="hud-party">
        {allies.map((u) => {
          const dead = u.hp <= 0;
          const targetable = targetIds.has(u.uid);
          return (
            <div
              key={u.uid}
              className={`portrait ${u.uid === state.actorUid ? 'acting' : ''} ${dead ? 'dead' : ''} ${targetable ? 'targetable' : ''}`}
              onClick={targetable ? () => onSelect(u.uid) : undefined}
            >
              <span className="portrait-emoji">
                {u.sprite ? <UnitArt sprite={u.sprite} emoji={u.emoji} height="30px" /> : <PixelEmoji emoji={u.emoji} />}
              </span>
              <div className="portrait-info">
                <div className="portrait-name">
                  {u.friend && <span className="friend-badge" title={`Borrowed from ${u.friend}`}>🤝</span>}
                  {u.name}
                </div>
                <div className="portrait-hp">
                  <div className="fill" style={{ width: `${(u.hp / u.maxHp) * 100}%` }} />
                  {u.shield > 0 && <div className="shield" style={{ width: `${Math.min(100, (u.shield / u.maxHp) * 100)}%` }} />}
                </div>
                {u.ultimate && !dead && (
                  <div className={`portrait-energy ${u.energy >= ENERGY.max ? 'full' : ''}`}>
                    <div style={{ width: `${(u.energy / ENERGY.max) * 100}%` }} />
                  </div>
                )}
                <div className="portrait-num">
                  {u.hp}
                  {u.shield > 0 && <span className="shield-text"> +{u.shield}</span>}
                </div>
              </div>
              {u.skill && !dead && (
                <span className={`portrait-skill ${u.cooldown === 0 ? 'ready' : ''}`} title={u.cooldown ? `Skill ready in ${u.cooldown}` : 'Skill ready'}>
                  {u.cooldown || '✦'}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="hud-actions">
        {playerTurn && actor && activeSkill ? (
          <>
            <div className="hud-desc">
              <div>
                <b>{activeSkill.name}</b> {hint && <em>· {hint}</em>}
              </div>
              <span>{describeSkill(activeSkill)}</span>
            </div>
            <button className={`act-btn basic ${mode === 'basic' ? 'active' : ''}`} onClick={() => choose('basic')} title={`${actor.basic.name} (Q)`}>
              <span className="act-icon">{actor.basic.icon ? <Icon id={actor.basic.icon} size={32} /> : '⚔️'}</span>
              <span className="act-label">{actor.basic.name}</span>
              <kbd>Q</kbd>
            </button>
            {actor.skill && (
              <button
                className={`act-btn skill ${mode === 'skill' ? 'active' : ''} ${skillReady ? 'ready' : ''}`}
                disabled={!skillReady}
                onClick={() => choose('skill')}
                title={`${actor.skill.name} (E)`}
              >
                <span className="act-icon">{actor.skill.icon ? <Icon id={actor.skill.icon} size={32} /> : '✦'}</span>
                <span className="act-label">{actor.skill.name}</span>
                {!skillReady && <span className="act-cd">{actor.cooldown}</span>}
                <kbd>E</kbd>
              </button>
            )}
            {actor.ultimate && (
              <button
                className={`act-btn ultbtn ${mode === 'ultimate' ? 'active' : ''} ${ultReady ? 'ready' : ''}`}
                style={{ '--pct': `${(actor.energy / ENERGY.max) * 100}%` } as CSSProperties}
                disabled={!ultReady}
                onClick={() => choose('ultimate')}
                title={`${actor.ultimate.name} (R)`}
              >
                <span className="act-icon">{actor.ultimate.icon ? <Icon id={actor.ultimate.icon} size={32} /> : '💥'}</span>
                <span className="act-label">{actor.ultimate.name}</span>
                {!ultReady && <span className="act-energy">{actor.energy}%</span>}
                <kbd>R</kbd>
              </button>
            )}
          </>
        ) : (
          <div className="hud-wait">{waitingText}</div>
        )}
      </div>
    </div>
  );
}
