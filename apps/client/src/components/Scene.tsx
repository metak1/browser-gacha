import { seededRandom, type SceneTheme } from '@gacha/shared';
import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { sceneImage } from './pixelScene';
import './scene.css';

/**
 * Pixel-art backdrops: a low-resolution procedural painting per theme (see
 * pixelScene.ts), scaled up with crisp pixels and anchored to the bottom so
 * units stand on the ground. Weather (snow, embers, rain, bubbles) drifts on
 * top as square pixel particles.
 */
type Rng = () => number;

const THEME_SEED: Record<SceneTheme, number> = {
  meadow: 11,
  ember: 23,
  frost: 37,
  cosmos: 51,
  storm: 63,
  deep: 77,
  kingdom: 89,
  village: 97,
  forest: 103,
  ruins: 113,
  camp: 127,
};

interface Particle {
  left: number;
  top: number;
  size: number;
  duration: number;
  delay: number;
}

function makeParticles(rng: Rng, count: number, duration: [number, number]): Particle[] {
  return Array.from({ length: count }, () => ({
    left: rng() * 100,
    top: rng() * 100,
    // Whole multiples of the backdrop's pixel size read as pixels, not dots.
    size: 3 * (1 + Math.floor(rng() * 2)),
    duration: duration[0] + rng() * (duration[1] - duration[0]),
    delay: -rng() * duration[1],
  }));
}

const PARTICLES: Record<SceneTheme, { count: number; duration: [number, number] }> = {
  meadow: { count: 22, duration: [9, 18] },
  ember: { count: 40, duration: [5, 11] },
  frost: { count: 60, duration: [7, 16] },
  cosmos: { count: 24, duration: [10, 22] },
  storm: { count: 50, duration: [0.7, 1.3] },
  deep: { count: 30, duration: [6, 14] },
  kingdom: { count: 20, duration: [9, 16] },
  village: { count: 24, duration: [10, 18] },
  forest: { count: 26, duration: [6, 12] },
  ruins: { count: 22, duration: [8, 15] },
  camp: { count: 26, duration: [4, 8] },
};

/**
 * `still` draws the backdrop without weather (for the always-on app background), and
 * `weather` scales the particle count (smaller scenes such as map thumbnails need fewer).
 * Weather also pauses while the scene is scrolled out of view, so long pages of
 * scenes (the campaign map) only animate what you can see.
 */
function SceneImpl({ theme, className = '', still = false, weather = 1 }: { theme: SceneTheme; className?: string; still?: boolean; weather?: number }) {
  const image = useMemo(() => sceneImage(theme), [theme]);
  const particles = useMemo(
    () => (still ? [] : makeParticles(seededRandom(THEME_SEED[theme]), Math.round(PARTICLES[theme].count * weather), PARTICLES[theme].duration)),
    [theme, still, weather],
  );
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || still || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)));
    io.observe(el);
    return () => io.disconnect();
  }, [still]);

  return (
    <div ref={ref} className={`scene scene-${theme} ${visible ? '' : 'paused'} ${className}`} aria-hidden>
      {image && <img className="scene-img" src={image} alt="" draggable={false} />}
      {theme === 'storm' && !still && <div className="storm-flash" />}
      <div className="particles">
        {particles.map((pt, i) => (
          <span
            key={i}
            style={
              {
                left: `${pt.left}%`,
                top: `${pt.top}%`,
                width: pt.size,
                height: pt.size,
                animationDuration: `${pt.duration}s`,
                animationDelay: `${pt.delay}s`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className="scene-vignette" />
    </div>
  );
}

export const Scene = memo(SceneImpl);
