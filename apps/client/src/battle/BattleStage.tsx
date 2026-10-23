import { ELEMENTS, getUnit, predictTurnOrder, type BattleState, type SceneTheme } from '@gacha/shared';
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { UnitArt, PixelEmoji } from '../components/Art';
import { Scene } from '../components/Scene';
import type { Slot } from './formation';
import { Sprite } from './Sprite';
import { SpellFxView, type SpellFx } from './SpellFx';
import type { Banner, BossAlert, Cutin, FxItem, Popup, UltimateShow, UnitAnim } from './useBattle';

interface Props {
  state: BattleState;
  theme: SceneTheme;
  slots: Record<string, Slot>;
  anims: Record<string, UnitAnim>;
  fx: FxItem[];
  spells: SpellFx[];
  popups: Popup[];
  cutin: Cutin | null;
  ultimate: UltimateShow | null;
  banner: Banner;
  alert?: BossAlert | null;
  targetIds: Set<string>;
  speed: number;
  onSelect: (uid: string) => void;
  registerShake: (fn: () => void) => void;
  /** Overlay controls rendered in the top-right corner. */
  controls: ReactNode;
  title: ReactNode;
}

export function BattleStage(props: Props) {
  const { state, theme, slots, anims, fx, spells, popups, cutin, ultimate, banner, targetIds, speed, onSelect, registerShake } = props;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    registerShake(() => {
      const el = ref.current;
      if (!el) return;
      el.classList.remove('shake');
      void el.offsetWidth; // restart the animation
      el.classList.add('shake');
    });
  }, [registerShake]);

  return (
    <div className="battle-stage" style={{ '--spd': speed } as CSSProperties}>
      <div className="stage-camera" ref={ref}>
        <Scene theme={theme} />
        <div className="stage-units">
          {state.units.map((u) => (
            <Sprite
              key={u.uid}
              unit={u}
              slot={slots[u.uid] ?? { x: 50, y: 70 }}
              anim={anims[u.uid]}
              acting={u.uid === state.actorUid}
              targetable={targetIds.has(u.uid)}
              fx={fx.filter((f) => f.uid === u.uid)}
              popups={popups.filter((p) => p.uid === u.uid)}
              onSelect={() => onSelect(u.uid)}
              speed={speed}
            />
          ))}
          {spells.map((s) => (
            <SpellFxView key={s.id} fx={s} />
          ))}
        </div>
      </div>

      <div className="stage-top">
        <div className="stage-title">{props.title}</div>
        <TurnOrder state={state} />
        <div className="stage-controls">{props.controls}</div>
      </div>

      {cutin && (
        <div
          key={cutin.id}
          className={`cutin ${cutin.side}`}
          style={{ '--el': ELEMENTS[cutin.element].color } as CSSProperties}
        >
          <div className="cutin-band">
            {cutin.sprite ? (
              <span className="cutin-emoji art">
                <UnitArt sprite={cutin.sprite} emoji={cutin.emoji} height="10cqw" clip="attack2" flip={cutin.side === 'enemy'} speed={speed} />
              </span>
            ) : (
              <span className="cutin-emoji"><PixelEmoji emoji={cutin.emoji} /></span>
            )}
            <div className="cutin-text">
              <small>{cutin.actorName}</small>
              <b>{cutin.skillName}</b>
            </div>
          </div>
        </div>
      )}

      {ultimate && (
        <div key={ultimate.id} className={`ult ${ultimate.side}`} style={{ '--el': ELEMENTS[ultimate.element].color } as CSSProperties}>
          <div className="ult-burst" />
          <div className="ult-lines" />
          {ultimate.sprite ? (
            <span className="ult-emoji art">
              <UnitArt sprite={ultimate.sprite} emoji={ultimate.emoji} height="24cqw" clip="attack3" flip={ultimate.side === 'enemy'} speed={speed} />
            </span>
          ) : (
            <span className="ult-emoji"><PixelEmoji emoji={ultimate.emoji} /></span>
          )}
          <div className="ult-text">
            <small>Ultimate · {ultimate.actorName}</small>
            <b>{ultimate.skillName}</b>
          </div>
          <div className="ult-flash" />
        </div>
      )}

      {props.alert && (
        <div key={props.alert.id} className={`boss-alert ${props.alert.kind}`} role="status">
          <b>{props.alert.title}</b>
          <small>{props.alert.text}</small>
        </div>
      )}

      {banner && (
        <div className={`stage-banner ${typeof banner === 'object' ? 'wave' : banner}`}>
          <div className="stage-banner-rays" />
          <span>
            {typeof banner === 'object'
              ? `Wave ${banner.wave}/${banner.of}`
              : banner === 'start'
                ? 'Battle Start'
                : banner === 'victory'
                  ? 'Victory'
                  : 'Defeat'}
          </span>
        </div>
      )}
    </div>
  );
}

function TurnOrder({ state }: { state: BattleState }) {
  if (state.outcome !== 'ongoing' || !state.actorUid) return <div className="turn-order" />;
  const order = predictTurnOrder(state, 7);
  return (
    <div className="turn-order" aria-label="Turn order">
      {order.map((uid, i) => {
        const u = getUnit(state, uid)!;
        return (
          <span key={`${i}-${uid}`} className={`turn-chip ${u.side} ${i === 0 ? 'now' : ''}`} title={u.name}>
            {u.sprite ? <UnitArt sprite={u.sprite} emoji={u.emoji} height="22px" flip={u.side === 'enemy'} /> : <PixelEmoji emoji={u.emoji} />}
          </span>
        );
      })}
    </div>
  );
}
