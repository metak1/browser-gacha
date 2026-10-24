import { ELEMENTS, ENERGY, hasStatus, STATUS_ICONS, STATUS_INFO, type BattleUnit } from '@gacha/shared';
import { Icon, UnitArt, PixelEmoji } from '../components/Art';
import type { CSSProperties } from 'react';
import type { Slot } from './formation';
import { FxView } from './Fx';
import type { FxItem, Popup, UnitAnim } from './useBattle';

interface Props {
  speed: number;
  unit: BattleUnit;
  slot: Slot;
  anim?: UnitAnim;
  acting: boolean;
  targetable: boolean;
  fx: FxItem[];
  popups: Popup[];
  onSelect: () => void;
}

export function Sprite({ unit, slot, anim, acting, targetable, fx, popups, onSelect, speed }: Props) {
  const el = ELEMENTS[unit.element];
  const dead = unit.hp <= 0;
  const hpPct = (unit.hp / unit.maxHp) * 100;
  const shieldPct = Math.min(100, (unit.shield / unit.maxHp) * 100);
  const className = [
    'sprite',
    unit.side,
    unit.sprite && 'has-art',
    unit.boss && 'boss',
    dead && 'dead',
    acting && 'acting',
    targetable && 'targetable',
    hasStatus(unit, 'taunt') && 'taunting',
    hasStatus(unit, 'burn') && 'burning',
    unit.mech?.charging && !dead && 'charging',
    unit.mech?.enraged && 'enraged',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={className}
      style={{ left: `${slot.x}%`, top: `${slot.y}%`, zIndex: Math.round(slot.y), '--el': el.color } as CSSProperties}
      onClick={targetable ? onSelect : undefined}
      role={targetable ? 'button' : undefined}
      tabIndex={targetable ? 0 : undefined}
      onKeyDown={targetable ? (e) => (e.key === 'Enter' || e.key === ' ') && onSelect() : undefined}
      aria-label={`${unit.name}, ${unit.hp} of ${unit.maxHp} HP`}
    >
      <div className="sprite-ground">
        <span className="sprite-shadow" />
        {(acting || targetable) && <span className="sprite-ring" />}
      </div>

      <div
        key={anim?.key ?? 0}
        className={`sprite-body anim-${anim?.name ?? 'none'}`}
        style={{ '--dx': `${anim?.dx ?? 0}cqw`, '--dy': `${anim?.dy ?? 0}cqw` } as CSSProperties}
      >
        <div className="sprite-idle" style={{ animationDelay: `${-(unit.uid.charCodeAt(1) % 4) * 0.45}s` }}>
          {unit.sprite ? (
            <UnitArt
              sprite={unit.sprite}
              emoji={unit.emoji}
              height={unit.boss ? '12cqw' : '8cqw'}
              clip={dead && !anim?.clip ? 'death' : (anim?.clip ?? 'idle')}
              playKey={anim?.key}
              flip={unit.side === 'enemy'}
              speed={speed}
              className="sprite-art"
            />
          ) : (
            <span className="sprite-emoji">
              <PixelEmoji emoji={unit.emoji} />
            </span>
          )}
          {unit.shield > 0 && !dead && <span className="sprite-bubble" />}
        </div>
      </div>

      {!dead && (
        <div className="sprite-hud">
          <div className="sprite-name">
            <span>{el.icon}</span> {unit.name} <span className="lv">Lv{unit.level}</span>
            {unit.mech?.enraged && <span title="Enraged: higher ATK and SPD"> 😡</span>}
          </div>
          <div className="sprite-hp">
            <div className="fill" style={{ width: `${hpPct}%` }} />
            {unit.shield > 0 && <div className="shield" style={{ width: `${shieldPct}%` }} />}
          </div>
          {unit.mech?.charging && (
            <div className="sprite-charge" title={`Deal ${unit.mech.charging.need} damage before its turn to break ${unit.mech.charging.skill.name}`}>
              <span>⚠ {unit.mech.charging.skill.name}</span>
              <div className="break-bar">
                <div style={{ width: `${Math.min(100, (unit.mech.charging.taken / Math.max(1, unit.mech.charging.need)) * 100)}%` }} />
              </div>
            </div>
          )}
          {unit.ultimate && (
            <div className={`sprite-energy ${unit.energy >= ENERGY.max ? 'full' : ''}`}>
              <div style={{ width: `${(unit.energy / ENERGY.max) * 100}%` }} />
            </div>
          )}
          {unit.statuses.length > 0 && (
            <div className="sprite-statuses">
              {unit.statuses.map((s) => {
                const info = STATUS_INFO[s.id];
                return (
                  <span key={s.id} className={info.buff ? 'buff' : 'debuff'} title={`${info.label}: ${info.description} (${s.turns} left)`}>
                    <Icon id={STATUS_ICONS[s.id]} size={16} />
                    <sub>{s.turns}</sub>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      {hasStatus(unit, 'stun') && !dead && <div className="sprite-stun">💫</div>}
      {targetable && <div className="sprite-arrow">▼</div>}

      <div className="sprite-fx">
        {fx.map((f) => (
          <FxView key={f.id} fx={f} />
        ))}
      </div>
      <div className="popups">
        {popups.map((p) => (
          <span key={p.id} className={`popup ${p.kind}`}>
            {p.text}
          </span>
        ))}
      </div>
    </div>
  );
}
