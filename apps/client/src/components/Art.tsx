import { ICON_COLUMNS, ICON_COUNT, SPRITES, type SpriteClip } from '@gacha/shared';
import { useEffect, useState, type CSSProperties } from 'react';
import './art.css';

const SPRITE_BASE = '/assets/sprites';
const ICON_SHEET = '/assets/icons/raven-16.png';
const ICON_SOURCE = 16;

/** Milliseconds per frame for each clip at 1x speed. */
const FRAME_MS: Record<SpriteClip, number> = {
  idle: 130,
  walk: 90,
  attack1: 70,
  attack2: 70,
  attack3: 60,
  hurt: 80,
  death: 120,
};

const ONE_SHOT: SpriteClip[] = ['attack1', 'attack2', 'attack3', 'hurt', 'death'];

/** Falls back to a clip the sprite actually has (e.g. attack3 → attack2 → attack1). */
function resolveClip(clips: Partial<Record<SpriteClip, number>>, clip: SpriteClip): SpriteClip {
  const chain: Record<SpriteClip, SpriteClip[]> = {
    idle: ['idle'],
    walk: ['walk', 'idle'],
    attack1: ['attack1', 'idle'],
    attack2: ['attack2', 'attack1', 'idle'],
    attack3: ['attack3', 'attack2', 'attack1', 'idle'],
    hurt: ['hurt', 'idle'],
    death: ['death', 'idle'],
  };
  return chain[clip].find((c) => clips[c]) ?? 'idle';
}

// ---------- pixel emoji ----------

const EMOJI_PX = 18;
const OUTLINE = [26, 16, 32];
const emojiCache = new Map<string, string>();

/**
 * An emoji redrawn as pixel art: rendered tiny on a canvas, alpha hardened,
 * colours posterised and outlined in dark like the Tiny RPG sprites, then
 * scaled up without smoothing. Cached per emoji as a data URL.
 */
function pixelEmojiUrl(emoji: string): string | null {
  const hit = emojiCache.get(emoji);
  if (hit) return hit;
  if (typeof document === 'undefined') return null;
  const size = EMOJI_PX + 4;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext('2d', { willReadFrequently: true });
  if (!c) return null;
  c.font = `${EMOJI_PX - 2}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(emoji, size / 2, size / 2 + 1);
  const img = c.getImageData(0, 0, size, size);
  const d = img.data;
  const solid = new Uint8Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const a = d[i * 4 + 3]!;
    if (a < 110) {
      d[i * 4 + 3] = 0;
      continue;
    }
    solid[i] = 1;
    d[i * 4 + 3] = 255;
    // Undo premultiplied fade on edge pixels, then snap to a 6-level palette.
    for (let k = 0; k < 3; k++) d[i * 4 + k] = Math.round(Math.min(255, (d[i * 4 + k]! * 255) / a) / 51) * 51;
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (solid[i]) continue;
      const near = (dx: number, dy: number) => {
        const nx = x + dx;
        const ny = y + dy;
        return nx >= 0 && ny >= 0 && nx < size && ny < size && solid[ny * size + nx] === 1;
      };
      if (near(1, 0) || near(-1, 0) || near(0, 1) || near(0, -1)) {
        d.set([...OUTLINE, 255], i * 4);
      }
    }
  }
  c.putImageData(img, 0, 0);
  const url = canvas.toDataURL('image/png');
  emojiCache.set(emoji, url);
  return url;
}

/** A unit's emoji drawn as pixel art, sized to the surrounding font (1em). */
export function PixelEmoji({ emoji, flip, className = '' }: { emoji: string; flip?: boolean; className?: string }) {
  const url = pixelEmojiUrl(emoji);
  if (!url) return <span className={className}>{emoji}</span>;
  return <img className={`pixel-emoji ${flip ? 'mirrored' : ''} ${className}`} src={url} alt={emoji} draggable={false} />;
}

/**
 * Step timing for a sprite strip animated by background-position percentages (see art.css).
 * Integer step counts are set here rather than via calc() in CSS, for browser support.
 *
 * - One-shots: steps(n, jump-none) yields n values from 0% to 100%, i.e. exactly frames 0..n-1,
 *   ending (and holding) on the last frame.
 * - Loops: steps(n, jump-end) towards one frame past the end (--end), so each frame shows for an
 *   equal share and the wrap back to frame 0 is seamless.
 */
export function stripTiming(frames: number, oneShot: boolean): CSSProperties {
  if (frames <= 1) return { animationName: 'none' };
  if (oneShot) return { animationTimingFunction: `steps(${frames}, jump-none)` };
  return { animationTimingFunction: `steps(${frames}, jump-end)`, '--end': `${(frames / (frames - 1)) * 100}%` } as CSSProperties;
}

interface UnitArtProps {
  sprite: string | null | undefined;
  emoji: string;
  /** Visual height of the character (any CSS length). Sprites of any pixel size are scaled to it. */
  height: string;
  clip?: SpriteClip;
  /** Change to replay the same clip. */
  playKey?: number | string;
  /** Mirror horizontally (sprites face right by default). */
  flip?: boolean;
  /** Animation speed multiplier (battle speed). */
  speed?: number;
  className?: string;
}

/**
 * A unit's art: an animated pixel sprite when one is assigned (and imported),
 * otherwise its emoji. One-shot clips (attacks, hurt) return to idle when done;
 * death holds its last frame.
 */
export function UnitArt({ sprite, emoji, height, clip = 'idle', playKey, flip, speed = 1, className = '' }: UnitArtProps) {
  const def = sprite ? SPRITES[sprite] : undefined;
  const [active, setActive] = useState<SpriteClip>(clip);
  useEffect(() => setActive(clip), [clip, playKey]);

  if (!def) {
    return (
      <span className={`unit-art emoji ${className}`} style={{ fontSize: height }}>
        <PixelEmoji emoji={emoji} />
      </span>
    );
  }

  const current = resolveClip(def.clips, active);
  const frames = def.clips[current] ?? 1;
  const oneShot = ONE_SHOT.includes(current);
  const style = {
    '--h': height,
    '--src-h': def.height,
    '--frame': def.frame,
    '--frames': frames,
    '--ax': def.anchorX,
    '--ay': def.anchorY,
    '--dur': `${(frames * FRAME_MS[current]) / speed}ms`,
    backgroundImage: `url(${SPRITE_BASE}/${def.id}/${current}.png)`,
    ...stripTiming(frames, oneShot),
  } as CSSProperties;

  return (
    <span className={`unit-art pixel ${className}`} style={{ '--h': height } as CSSProperties}>
      <span
        key={`${current}-${String(playKey)}`}
        className={`unit-art-frame ${oneShot ? 'once' : 'loop'} ${flip ? 'mirrored' : ''}`}
        style={style}
        onAnimationEnd={() => {
          if (current !== 'death' && current !== 'idle') setActive('idle');
        }}
      />
    </span>
  );
}

/** One icon from the 16px icon sheet, scaled by whole pixels so it stays crisp. */
export function Icon({ id, size = 32, title, className = '' }: { id: number | null | undefined; size?: number; title?: string; className?: string }) {
  if (!id || id < 1 || id > ICON_COUNT) return null;
  const i = id - 1;
  const col = i % ICON_COLUMNS;
  const row = Math.floor(i / ICON_COLUMNS);
  const scale = size / ICON_SOURCE;
  return (
    <span
      className={`icon ${className}`}
      title={title}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${ICON_SHEET})`,
        backgroundSize: `${ICON_COLUMNS * ICON_SOURCE * scale}px auto`,
        backgroundPosition: `-${col * size}px -${row * size}px`,
      }}
    />
  );
}

/** Icon if set, else the emoji (for content that may or may not have art). */
export function IconOr({ icon, emoji, size = 32, title }: { icon: number | null | undefined; emoji: string; size?: number; title?: string }) {
  return icon ? <Icon id={icon} size={size} title={title} /> : <span style={{ fontSize: size * 0.8, lineHeight: 1 }}>{emoji}</span>;
}
