import { SPRITES } from '@gacha/shared';
import type { CSSProperties } from 'react';
import { stripTiming } from '../components/Art';
import type { Slot } from './formation';

/** One attack effect from a sprite pack: a projectile in flight, or an effect playing on a target. */
export interface SpellFx {
  id: number;
  /** The caster's sprite id: effects are drawn at its pixel scale. */
  sprite: string;
  clip: 'attack1' | 'attack2' | 'attack3';
  kind: 'missile' | 'impact';
  frames: number;
  /** Where it plays (impact) or lands (missile). */
  at: Slot;
  /** Missile start, plus its travel in cqw. */
  from?: Slot;
  dx?: number;
  dy?: number;
  /** Enemy casters face left. */
  flip: boolean;
  /** Visual height of a character at this scale. */
  height: string;
  durationMs: number;
}

export function SpellFxView({ fx }: { fx: SpellFx }) {
  const def = SPRITES[fx.sprite];
  if (!def) return null;
  const slot = fx.kind === 'missile' ? fx.from! : fx.at;
  const frame = {
    '--h': fx.height,
    '--src-h': def.height,
    '--frame': def.frame,
    '--frames': fx.frames,
    // Pack effects are drawn in the caster's frame (an arrow sits at bow height), so they share its anchor.
    '--ax': def.anchorX,
    '--ay': def.anchorY,
    '--dur': `${fx.durationMs}ms`,
    backgroundImage: `url(/assets/sprites/${def.id}/fx-${fx.clip}.png)`,
    ...stripTiming(fx.frames, true),
  } as CSSProperties;
  return (
    <div
      className={`spell-fx ${fx.kind}`}
      style={
        {
          left: `${slot.x}%`,
          top: `${slot.y}%`,
          zIndex: 400,
          '--dx': `${fx.dx ?? 0}cqw`,
          '--dy': `${fx.dy ?? 0}cqw`,
          '--dur': `${fx.durationMs}ms`,
        } as CSSProperties
      }
    >
      <span className="unit-art pixel" style={{ '--h': fx.height } as CSSProperties}>
        <span className={`unit-art-frame ${fx.kind === 'impact' ? 'once' : ''} ${fx.flip ? 'mirrored' : ''}`} style={frame} />
      </span>
    </div>
  );
}
