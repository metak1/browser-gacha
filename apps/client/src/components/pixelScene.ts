import { seededRandom, type SceneTheme } from '@gacha/shared';

/**
 * Procedural pixel-art backdrops, drawn once per theme at a low resolution and
 * scaled up with crisp pixels so they sit naturally behind the pixel sprites.
 * Everything comes from a fixed seed, so a theme always looks the same.
 */
export const SCENE_W = 320;
export const SCENE_H = 180;
/** Where the ground starts (units stand on it), as a row of the canvas. */
const GROUND = 103;

type Rng = () => number;
type Ctx = CanvasRenderingContext2D;

// 4x4 Bayer matrix for ordered dithering between colour bands.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dither = (x: number, y: number) => BAYER[(y % 4) * 4 + (x % 4)]!;

function px(c: Ctx, x: number, y: number, color: string, w = 1, h = 1) {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), w, h);
}

/** Vertical gradient quantised to the given colours, dithered where bands meet. */
function sky(c: Ctx, colors: string[], top: number, bottom: number) {
  const bands = colors.length - 1;
  for (let y = top; y < bottom; y++) {
    const t = ((y - top) / (bottom - top)) * bands;
    const i = Math.min(bands - 1, Math.floor(t));
    const f = t - i;
    for (let x = 0; x < SCENE_W; x++) px(c, x, y, f > dither(x, y) ? colors[i + 1]! : colors[i]!);
  }
}

function disc(c: Ctx, cx: number, cy: number, r: number, color: string) {
  for (let y = -r; y <= r; y++) {
    const w = Math.floor(Math.sqrt(r * r - y * y));
    px(c, cx - w, cy + y, color, w * 2 + 1, 1);
  }
}

/** A jagged ridge line: one height per column, from summed random waves. */
function ridge(rng: Rng, base: number, amp: number, roughness: number): number[] {
  const waves = Array.from({ length: 4 }, (_, i) => ({ f: (0.01 + rng() * 0.02) * (i + 1) * roughness, p: rng() * 10, a: amp / (i + 1.4) }));
  return Array.from({ length: SCENE_W }, (_, x) => Math.round(base - Math.abs(waves.reduce((s, w) => s + Math.sin(x * w.f + w.p) * w.a, 0))));
}

function fillRidge(c: Ctx, tops: number[], color: string, highlight?: string, bottom = SCENE_H) {
  tops.forEach((t, x) => {
    px(c, x, t, color, 1, bottom - t);
    if (highlight) px(c, x, t, highlight);
  });
}

/** Snow caps on the highest parts of a ridge. */
function snowCaps(c: Ctx, tops: number[], below: number, color: string) {
  tops.forEach((t, x) => {
    if (t < below) px(c, x, t, color, 1, Math.max(1, Math.round((below - t) / 2)));
  });
}

function cloud(c: Ctx, rng: Rng, cx: number, cy: number, size: number, light: string, shade: string) {
  const puffs = Array.from({ length: 4 + Math.floor(rng() * 3) }, (_, i) => ({ x: cx + (i - 2.5) * size * 0.9, r: size * (0.7 + rng() * 0.6) }));
  for (const p of puffs) disc(c, Math.round(p.x), Math.round(cy - p.r * 0.4), Math.round(p.r), light);
  px(c, cx - size * 3, cy, shade, size * 6, 1);
  px(c, cx - size * 3, cy + 1, light, size * 6, Math.max(1, Math.round(size / 2)));
}

function pine(c: Ctx, x: number, base: number, h: number, dark: string, light: string, snow?: string) {
  px(c, x, base - 2, '#3a2a22', 1, 3);
  for (let i = 0; i < h; i++) {
    const w = Math.floor((i / h) * (h / 2.2)) + 1;
    px(c, x - w, base - h + i - 2, i % 3 === 0 ? light : dark, w * 2 + 1, 1);
    if (snow && i % 3 === 0) px(c, x - w, base - h + i - 2, snow, Math.max(1, w), 1);
  }
}

function roundTree(c: Ctx, x: number, base: number, r: number, dark: string, light: string) {
  px(c, x, base - r, '#4a3424', 2, r);
  disc(c, x + 1, base - r * 1.6, r, dark);
  disc(c, x, base - r * 1.9, Math.max(1, r - 2), light);
}

function groundNoise(c: Ctx, rng: Rng, colors: string[], density: number, from = GROUND + 2) {
  for (let y = from; y < SCENE_H; y++) {
    for (let x = 0; x < SCENE_W; x++) if (rng() < density) px(c, x, y, colors[Math.floor(rng() * colors.length)]!);
  }
}

function stars(c: Ctx, rng: Rng, count: number, maxY: number, colors = ['#ffffff', '#cfd8ff', '#ffe9b0']) {
  for (let i = 0; i < count; i++) px(c, rng() * SCENE_W, rng() * maxY, colors[Math.floor(rng() * colors.length)]!);
}

/** A soft dithered blob of colour (nebulae, aurora, light). */
function haze(c: Ctx, cx: number, cy: number, rx: number, ry: number, color: string, strength: number) {
  for (let y = Math.max(0, cy - ry); y < Math.min(SCENE_H, cy + ry); y++) {
    for (let x = Math.max(0, cx - rx); x < Math.min(SCENE_W, cx + rx); x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d < 1 && (1 - d) * strength > dither(x, y)) px(c, x, y, color);
    }
  }
}

// ---------- medieval pieces ----------

/** A block of stone with a staggered brick pattern and a lit top edge. */
function stoneWall(c: Ctx, x: number, y: number, w: number, h: number, stone: string, mortar: string, light?: string) {
  px(c, x, y, stone, w, h);
  for (let row = 0; row * 4 < h; row++) {
    px(c, x, y + row * 4, mortar, w, 1);
    for (let bx = (row % 2) * 3; bx < w; bx += 6) px(c, x + bx, y + row * 4, mortar, 1, 4);
  }
  if (light) px(c, x, y, light, w, 1);
}

/** Merlons along the top of a wall. */
function crenels(c: Ctx, x: number, y: number, w: number, color: string, size = 3) {
  for (let bx = 0; bx < w; bx += size * 2) px(c, x + bx, y - size, color, Math.min(size, w - bx), size);
}

/** A cone roof on a tower, with a pennant on top. */
function coneRoof(c: Ctx, x: number, y: number, w: number, h: number, color: string, shade: string, flag?: string) {
  for (let i = 0; i < h; i++) {
    const half = Math.round(((i + 1) / h) * (w / 2 + 1));
    px(c, x + w / 2 - half, y - h + i, color, half, 1);
    px(c, x + w / 2, y - h + i, shade, half, 1);
  }
  if (flag) {
    px(c, x + w / 2, y - h - 6, '#3a2a22', 1, 6);
    px(c, x + w / 2 + 1, y - h - 6, flag, 4, 1);
    px(c, x + w / 2 + 1, y - h - 5, flag, 3, 1);
    px(c, x + w / 2 + 1, y - h - 4, flag, 1, 1);
  }
}

/** A hanging banner on a rod: a trim cross on the cloth and a swallow-tail at the bottom. */
function banner(c: Ctx, x: number, y: number, w: number, h: number, color: string, trim: string) {
  px(c, x - 1, y - 1, '#3a2a22', w + 2, 1);
  const tail = Math.min(3, Math.floor(w / 2));
  px(c, x, y, color, w, h - tail);
  // The last rows leave a widening gap in the middle.
  for (let k = 0; k < tail; k++) {
    const side = Math.floor(w / 2) - k - 1;
    px(c, x, y + h - tail + k, color, side, 1);
    px(c, x + w - side, y + h - tail + k, color, side, 1);
  }
  px(c, x + Math.floor(w / 2) - 1, y + 2, trim, 2, h - tail - 4);
  px(c, x + 1, y + Math.floor((h - tail) / 2) - 1, trim, w - 2, 1);
}

/** A thatched (or tiled) gable roof as a triangle with darker straw lines. */
function gableRoof(c: Ctx, x: number, y: number, w: number, h: number, color: string, dark: string) {
  for (let i = 0; i < h; i++) {
    const half = Math.round(((i + 1) / h) * (w / 2 + 2));
    px(c, x + w / 2 - half, y - h + i, i % 3 === 2 ? dark : color, half * 2, 1);
  }
}

function cottage(c: Ctx, x: number, base: number, w: number, h: number, roof: string, roofDark: string, smoke = true) {
  const wall = '#e6d3ad';
  const beam = '#6a4a2a';
  px(c, x, base - h, wall, w, h);
  // Timber frame.
  px(c, x, base - h, beam, w, 1);
  px(c, x, base - h, beam, 1, h);
  px(c, x + w - 1, base - h, beam, 1, h);
  px(c, x + Math.floor(w / 2), base - h, beam, 1, h);
  for (let k = 0; k < h; k++) px(c, x + Math.round((k / h) * (w / 2)), base - h + k, beam);
  px(c, x + 2, base - h + 3, '#ffd27a', 3, 3);
  px(c, x + w - 6, base - h + 3, '#ffd27a', 3, 3);
  px(c, x + Math.floor(w / 2) + 2, base - 6, '#4a3020', 3, 6);
  gableRoof(c, x, base - h, w, Math.round(w / 2.2), roof, roofDark);
  px(c, x + w - 5, base - h - Math.round(w / 2.2) + 1, '#7a6a5a', 3, 5);
  if (smoke) haze(c, x + w - 4, base - h - Math.round(w / 2.2) - 8, 6, 9, '#c9c4c8', 0.45);
}

function windmill(c: Ctx, x: number, base: number) {
  for (let y = base - 46; y < base; y++) {
    const half = 5 + Math.round(((y - (base - 46)) / 46) * 5);
    px(c, x - half, y, '#d6c6a4', half * 2, 1);
    px(c, x + half - 2, y, '#b8a682', 2, 1);
  }
  px(c, x - 2, base - 8, '#4a3020', 4, 8);
  px(c, x - 1, base - 30, '#ffd27a', 2, 3);
  coneRoof(c, x - 7, base - 46, 14, 8, '#7a4a2a', '#5a361e');
  // Four sails as a lattice X around the hub.
  const hx = x;
  const hy = base - 50;
  for (let t = 3; t < 26; t++) {
    for (const [dx, dy] of [[1, 1], [-1, -1], [1, -1], [-1, 1]] as const) {
      px(c, hx + dx * t * 0.8, hy + dy * t * 0.8, '#5a3a22');
      if (t > 8 && t % 2 === 0) px(c, hx + dx * t * 0.8 + dy * 2, hy + dy * t * 0.8 - dx * 2, '#f0e6d0', 2, 2);
    }
  }
  px(c, hx - 1, hy - 1, '#3a2a22', 3, 3);
}

function column(c: Ctx, x: number, base: number, h: number, stone: string, shade: string, broken: boolean, rng: Rng) {
  px(c, x - 1, base - 3, shade, 9, 3);
  px(c, x, base - h, stone, 7, h - 3);
  px(c, x + 5, base - h, shade, 2, h - 3);
  for (let fx = 2; fx < 5; fx += 2) px(c, x + fx, base - h + 2, shade, 1, h - 6);
  if (broken) {
    for (let k = 0; k < 7; k++) px(c, x + k, base - h - Math.round(rng() * 3), stone, 1, 3);
  } else {
    px(c, x - 1, base - h - 3, stone, 9, 3);
    px(c, x - 1, base - h - 1, shade, 9, 1);
  }
}

function tent(c: Ctx, x: number, base: number, w: number, h: number, color: string, stripe: string, flag?: string) {
  for (let i = 0; i < h; i++) {
    const half = Math.round(((i + 1) / h) * (w / 2));
    for (let k = -half; k < half; k++) px(c, x + k, base - h + i, Math.floor((k + w) / 4) % 2 ? color : stripe);
  }
  // Open flap.
  for (let i = 0; i < Math.round(h * 0.55); i++) px(c, x - Math.round(i * 0.35), base - Math.round(h * 0.55) + i, '#2a1a14', Math.max(1, Math.round(i * 0.7)), 1);
  px(c, x, base - h - 5, '#3a2a22', 1, 5);
  if (flag) {
    px(c, x + 1, base - h - 5, flag, 5, 2);
    px(c, x + 1, base - h - 3, flag, 3, 1);
  }
}

function campfire(c: Ctx, x: number, y: number) {
  haze(c, x, y - 2, 16, 9, '#ff8a2a', 0.5);
  px(c, x - 4, y, '#4a2a18', 9, 2);
  px(c, x - 3, y - 1, '#6a3a1e', 2, 1);
  px(c, x + 2, y - 1, '#6a3a1e', 2, 1);
  px(c, x - 2, y - 4, '#ff6a1a', 5, 3);
  px(c, x - 1, y - 7, '#ffb15a', 3, 3);
  px(c, x, y - 9, '#ffe28a', 1, 2);
  haze(c, x + 3, y - 24, 6, 14, '#6a6070', 0.35);
}

function torch(c: Ctx, x: number, y: number) {
  haze(c, x, y - 2, 7, 6, '#ffb15a', 0.45);
  px(c, x, y, '#4a3020', 1, 4);
  px(c, x - 1, y - 2, '#ff8a2a', 3, 2);
  px(c, x, y - 3, '#ffe28a', 1, 1);
}

function crow(c: Ctx, x: number, y: number, color = '#1a1220') {
  px(c, x - 2, y - 1, color, 2, 1);
  px(c, x, y, color, 1, 1);
  px(c, x + 1, y - 1, color, 2, 1);
}

// ---------- themes ----------

const DRAW: Record<SceneTheme, (c: Ctx, rng: Rng) => void> = {
  meadow(c, rng) {
    sky(c, ['#3d74d6', '#5a95e3', '#86b8ef', '#b7d8f5', '#ffe6b8'], 0, GROUND);
    disc(c, 252, 32, 13, '#fff6d8');
    disc(c, 252, 32, 10, '#fffbe9');
    for (let i = 0; i < 5; i++) cloud(c, rng, 20 + i * 68 + rng() * 20, 18 + rng() * 26, 3 + Math.floor(rng() * 2), '#ffffff', '#d6e6f7');
    const far = ridge(rng, 92, 18, 1);
    fillRidge(c, far, '#8fb0d6', '#b9d0ea', GROUND + 2);
    const mid = ridge(rng, 100, 6, 0.7);
    fillRidge(c, mid, '#4f9a5c', '#6db577', GROUND + 4);
    for (let i = 0; i < 14; i++) roundTree(c, Math.round(rng() * SCENE_W), 101 + Math.round(rng() * 3), 4 + Math.floor(rng() * 3), '#2f7a3e', '#4f9e52');
    px(c, 0, GROUND, '#6dbb5f', SCENE_W, 2);
    px(c, 0, GROUND + 2, '#5aa84f', SCENE_W, SCENE_H - GROUND - 2);
    groundNoise(c, rng, ['#4e9a46', '#68b85c', '#4a9142'], 0.18);
    for (let i = 0; i < 60; i++) {
      const x = rng() * SCENE_W;
      const y = GROUND + 6 + rng() * (SCENE_H - GROUND - 8);
      px(c, x, y, '#3e8a3e', 1, 2);
      px(c, x + 1, y - 1, '#3e8a3e');
      if (rng() < 0.3) px(c, x + 2, y - 1, ['#ffe25a', '#ff8fb0', '#ffffff'][Math.floor(rng() * 3)]!);
    }
  },

  ember(c, rng) {
    sky(c, ['#14040b', '#2c0812', '#4d101c', '#7a1d1d', '#c4471f'], 0, GROUND);
    stars(c, rng, 40, 60, ['#ff9a6a', '#ffcf9a']);
    disc(c, 66, 34, 14, '#e8442a');
    disc(c, 62, 30, 9, '#ff7a4a');
    const far = ridge(rng, 92, 28, 1.6);
    fillRidge(c, far, '#4a1a22', '#6a2630', GROUND + 2);
    // Volcano with a glowing crater and lava stream.
    for (let y = 40; y < GROUND + 2; y++) {
      const w = Math.round((y - 40) * 0.9) + 6;
      px(c, 238 - w, y, '#2a0b10', w * 2, 1);
    }
    px(c, 232, 38, '#ff7a2a', 13, 2);
    haze(c, 238, 36, 30, 14, '#ff6a1a', 0.6);
    for (let y = 40; y < GROUND + 4; y++) px(c, 238 + Math.round(Math.sin(y / 5) * 3), y, y % 2 ? '#ff6a1a' : '#ffb15a', 2, 1);
    const mid = ridge(rng, 101, 8, 0.8);
    fillRidge(c, mid, '#22090d', '#3a1214', GROUND + 4);
    px(c, 0, GROUND, '#4a2116', SCENE_W, SCENE_H - GROUND);
    groundNoise(c, rng, ['#3a1912', '#2a120c', '#552a1c'], 0.25);
    // Lava cracks.
    for (let i = 0; i < 9; i++) {
      let x = rng() * SCENE_W;
      let y = GROUND + 10 + rng() * 60;
      for (let s = 0; s < 14; s++) {
        px(c, x, y, s % 4 === 0 ? '#ffd27a' : '#ff6a1a');
        x += rng() < 0.7 ? 1 : 0;
        y += rng() < 0.5 ? 1 : rng() < 0.5 ? -1 : 0;
      }
    }
  },

  frost(c, rng) {
    sky(c, ['#081430', '#12285a', '#244a84', '#4c7cb8', '#9ccdee'], 0, GROUND);
    stars(c, rng, 70, 70);
    // Aurora ribbons.
    for (let x = 0; x < SCENE_W; x++) {
      const y1 = 26 + Math.round(Math.sin(x / 23) * 8 + Math.sin(x / 9) * 2);
      for (let k = 0; k < 7; k++) if ((7 - k) / 7 > dither(x, y1 + k)) px(c, x, y1 + k, k < 3 ? '#7ef2cc' : '#5ab6d8');
      const y2 = 16 + Math.round(Math.sin(x / 31 + 2) * 6);
      for (let k = 0; k < 4; k++) if ((4 - k) / 6 > dither(x, y2 + k)) px(c, x, y2 + k, '#a28bff');
    }
    disc(c, 70, 30, 9, '#f4fbff');
    disc(c, 73, 28, 7, '#dfeeff');
    const far = ridge(rng, 88, 30, 1.4);
    fillRidge(c, far, '#6f8fc0', '#8eacd6', GROUND + 2);
    snowCaps(c, far, 74, '#ffffff');
    // Castle.
    const castle = '#1b2d55';
    px(c, 222, 50, castle, 10, 52);
    px(c, 234, 62, castle, 26, 40);
    px(c, 246, 40, castle, 8, 24);
    px(c, 264, 56, castle, 9, 46);
    for (const [x, y, w] of [[222, 50, 10], [246, 40, 8], [264, 56, 9]] as const) {
      for (let k = 0; k < w / 2 + 2; k++) px(c, x - 1 + k, y - k, castle, w + 2 - k * 2, 1);
    }
    for (const [x, y] of [[226, 66], [250, 52], [267, 70], [240, 78], [252, 78]] as const) px(c, x, y, '#ffe9a8', 2, 3);
    const mid = ridge(rng, 101, 6, 0.6);
    fillRidge(c, mid, '#5c7fae', '#7e9ccc', GROUND + 4);
    for (let i = 0; i < 16; i++) pine(c, Math.round(rng() * SCENE_W), 102 + Math.round(rng() * 2), 10 + Math.floor(rng() * 8), '#2a4a6e', '#33587f', '#ffffff');
    px(c, 0, GROUND, '#f4f9ff', SCENE_W, SCENE_H - GROUND);
    groundNoise(c, rng, ['#dce9fb', '#c4d8f2', '#ffffff'], 0.2);
    for (let i = 0; i < 30; i++) px(c, rng() * SCENE_W, GROUND + 4 + rng() * 70, '#b0c8e8', 4 + Math.floor(rng() * 6), 1);
  },

  cosmos(c, rng) {
    sky(c, ['#04051a', '#0a0c2c', '#141a4a', '#22195a', '#3b2468'], 0, GROUND);
    haze(c, 84, 44, 70, 28, '#6b3dd6', 0.55);
    haze(c, 230, 56, 80, 30, '#2c6bd6', 0.45);
    haze(c, 160, 22, 50, 16, '#d63d9a', 0.35);
    stars(c, rng, 160, GROUND);
    for (let i = 0; i < 10; i++) {
      const x = rng() * SCENE_W;
      const y = rng() * 80;
      px(c, x - 1, y, '#ffffff', 3, 1);
      px(c, x, y - 1, '#ffffff', 1, 3);
    }
    // Ringed planet.
    disc(c, 258, 38, 14, '#7a5cff');
    disc(c, 254, 34, 9, '#9c84ff');
    for (let x = -26; x <= 26; x++) {
      const y = Math.round(38 + x * -0.25 + Math.sqrt(Math.max(0, 1 - (x / 26) ** 2)) * 4);
      if (Math.abs(x) > 10 || y > 40) px(c, 258 + x, y, '#e0d4ff');
    }
    const far = ridge(rng, 95, 12, 1.2);
    fillRidge(c, far, '#2a2060', '#3a2e80', GROUND + 2);
    px(c, 0, GROUND, '#140f38', SCENE_W, SCENE_H - GROUND);
    groundNoise(c, rng, ['#1c1548', '#0f0c2a', '#2a2066'], 0.25);
    // Rune circle on the ground.
    for (let a = 0; a < 360; a += 1.2) {
      const r = (a * Math.PI) / 180;
      px(c, 160 + Math.cos(r) * 84, 146 + Math.sin(r) * 20, Math.floor(a / 6) % 2 ? '#9b7bff' : '#6a50d0');
      if (Math.floor(a / 12) % 2) px(c, 160 + Math.cos(r) * 64, 146 + Math.sin(r) * 15, '#c9b6ff');
    }
  },

  storm(c, rng) {
    sky(c, ['#0b0f1f', '#161b33', '#232946', '#353b5e', '#555a80'], 0, GROUND);
    for (let i = 0; i < 6; i++) cloud(c, rng, 10 + i * 60 + rng() * 20, 14 + rng() * 22, 4 + Math.floor(rng() * 2), '#2b304e', '#1a1e36');
    const far = ridge(rng, 90, 24, 1.8);
    fillRidge(c, far, '#30365a', '#454c78', GROUND + 2);
    // The spire.
    const spire = '#151a30';
    px(c, 214, 32, spire, 14, 72);
    for (let k = 0; k < 9; k++) px(c, 214 + k * 0.8, 32 - k * 2, spire, 14 - k * 1.6, 2);
    px(c, 228, 64, spire, 18, 40);
    px(c, 202, 72, spire, 12, 32);
    px(c, 220, 14, '#9fd0ff', 2, 2);
    haze(c, 221, 15, 8, 6, '#9fd0ff', 0.5);
    for (const [x, y] of [[218, 50], [232, 74], [206, 80], [220, 84]] as const) px(c, x, y, '#9fd0ff', 2, 2);
    // A frozen lightning bolt with a glow.
    let lx = 120;
    for (let y = 8; y < 64; y++) {
      haze(c, lx, y, 4, 2, '#7d86c8', 0.35);
      px(c, lx - 1, y, '#bfd0ff', 3, 1);
      px(c, lx, y, '#ffffff');
      if (y % 6 === 0) lx += rng() < 0.5 ? -3 : 3;
    }
    const mid = ridge(rng, 101, 7, 0.9);
    fillRidge(c, mid, '#232842', '#30365a', GROUND + 4);
    px(c, 0, GROUND, '#3b3f58', SCENE_W, SCENE_H - GROUND);
    groundNoise(c, rng, ['#2e3248', '#454a66', '#34384f'], 0.28);
    for (let i = 0; i < 14; i++) {
      const x = rng() * SCENE_W;
      const y = GROUND + 8 + rng() * 60;
      px(c, x, y, '#5a6080', 4, 2);
      px(c, x + 1, y - 1, '#6d7396', 2, 1);
    }
  },

  deep(c, rng) {
    sky(c, ['#021a2a', '#043448', '#064a5e', '#0d6a7a', '#1b8a9a'], 0, GROUND);
    // Light shafts from the surface.
    for (const sx of [40, 110, 190, 260]) {
      for (let y = 0; y < GROUND; y++) {
        const x0 = sx + y * 0.35;
        for (let k = 0; k < 14; k++) if ((1 - y / GROUND) * 0.5 > dither(Math.round(x0 + k), y)) px(c, x0 + k, y, '#3fb8c8');
      }
    }
    const far = ridge(rng, 94, 14, 1);
    fillRidge(c, far, '#0b5566', '#126b7c', GROUND + 2);
    // Sunken temple.
    const stone = '#05303a';
    px(c, 196, 60, stone, 110, 6);
    for (let k = 0; k < 14; k++) px(c, 196 + k * 4, 60 - k, stone, 110 - k * 8, 1);
    for (const x of [200, 222, 244, 266, 288]) px(c, x, 66, stone, 7, 38);
    px(c, 266, 66, '#032228', 7, 38);
    const mid = ridge(rng, 101, 5, 0.6);
    fillRidge(c, mid, '#073a46', '#0a4c5a', GROUND + 4);
    px(c, 0, GROUND, '#c8b98a', SCENE_W, SCENE_H - GROUND);
    groundNoise(c, rng, ['#b5a676', '#d8ca9c', '#a8996a'], 0.25);
    // Kelp.
    for (let i = 0; i < 16; i++) {
      const x = rng() * SCENE_W;
      const h = 14 + rng() * 26;
      const base = GROUND + 6 + rng() * 60;
      for (let y = 0; y < h; y++) px(c, x + Math.round(Math.sin(y / 4 + i) * 1.5), base - y, y % 4 ? '#2a8a62' : '#3aa676', 2, 1);
    }
    for (let i = 0; i < 20; i++) px(c, rng() * SCENE_W, GROUND + rng() * 70, '#f2e6bf');
  },

  kingdom(c, rng) {
    sky(c, ['#3f7bdc', '#5f97e8', '#8ab8f0', '#bcd8f6', '#f4ead0'], 0, GROUND);
    disc(c, 60, 26, 11, '#fff6d8');
    disc(c, 60, 26, 8, '#fffbe9');
    for (let i = 0; i < 4; i++) cloud(c, rng, 30 + i * 80 + rng() * 20, 16 + rng() * 22, 3 + Math.floor(rng() * 2), '#ffffff', '#d6e6f7');
    fillRidge(c, ridge(rng, 90, 14, 0.9), '#8fa9d0', '#b4c8e6', GROUND + 2);
    // The castle hill.
    const hill = Array.from({ length: SCENE_W }, (_, x) => Math.round(98 - Math.max(0, 16 - ((x - 238) / 9) ** 2 / 4)));
    fillRidge(c, hill, '#5a9e56', '#7cbc6a', GROUND + 4);
    const stone = '#a6a9b4';
    const mortar = '#868a98';
    const light = '#c8cbd4';
    // Curtain wall, towers, keep.
    // Walls run down into the hill so the castle sits on it.
    stoneWall(c, 184, 62, 104, 30, stone, mortar, light);
    crenels(c, 184, 62, 104, stone);
    for (const tx of [176, 286]) {
      stoneWall(c, tx, 46, 14, 46, stone, mortar, light);
      crenels(c, tx, 46, 14, stone, 2);
      coneRoof(c, tx - 1, 43, 16, 12, '#c8463a', '#9a3028', '#ffd24a');
      px(c, tx + 6, 58, '#2a2a38', 2, 4);
    }
    stoneWall(c, 218, 34, 36, 58, stone, mortar, light);
    crenels(c, 218, 34, 36, stone);
    stoneWall(c, 231, 14, 10, 20, stone, mortar, light);
    coneRoof(c, 229, 14, 14, 14, '#3a5cc8', '#2a449a', '#ff4a4a');
    for (const [wx, wy] of [[224, 44], [244, 44], [234, 24], [224, 58], [244, 58]] as const) px(c, wx, wy, '#2a2a38', 2, 4);
    banner(c, 210, 64, 6, 14, '#c8463a', '#ffd24a');
    banner(c, 262, 64, 6, 14, '#c8463a', '#ffd24a');
    banner(c, 233, 40, 6, 12, '#3a5cc8', '#ffffff');
    // Gatehouse with a portcullis.
    px(c, 228, 78, '#2a1e18', 16, 14);
    disc(c, 236, 78, 8, '#2a1e18');
    for (let gx = 229; gx < 244; gx += 3) px(c, gx, 74, '#5a5048', 1, 18);
    for (let gy = 76; gy < 92; gy += 3) px(c, 228, gy, '#5a5048', 16, 1);
    torch(c, 224, 80);
    torch(c, 248, 80);
    // The hill in front of the walls' feet.
    fillRidge(c, hill.map((t, x) => (x > 170 && x < 306 ? Math.max(t, 92) : t)), '#5a9e56', '#7cbc6a', GROUND + 4);
    for (let i = 0; i < 10; i++) roundTree(c, Math.round(rng() * 160), 101 + Math.round(rng() * 3), 4 + Math.floor(rng() * 3), '#2f7a3e', '#4f9e52');
    // Grass, with a cobbled road across the field.
    px(c, 0, GROUND, '#6dbb5f', SCENE_W, 2);
    px(c, 0, GROUND + 2, '#5aa84f', SCENE_W, SCENE_H - GROUND - 2);
    groundNoise(c, rng, ['#4e9a46', '#68b85c', '#4a9142'], 0.16);
    for (let y = 128; y < 152; y++) {
      for (let x = 0; x < SCENE_W; x++) {
        const row = Math.floor((y - 128) / 4);
        const edge = (x + row * 3) % 7 === 0 || (y - 128) % 4 === 0;
        px(c, x, y, edge ? '#7a7466' : (x * 7 + row * 13) % 5 === 0 ? '#b2aa98' : '#9d9584');
      }
    }
    px(c, 0, 127, '#4a8a42', SCENE_W, 1);
    px(c, 0, 152, '#4a8a42', SCENE_W, 1);
  },

  village(c, rng) {
    sky(c, ['#3a4c94', '#76669e', '#cf7f72', '#efa964', '#ffd88a'], 0, GROUND);
    disc(c, 84, 80, 16, '#ffb45a');
    disc(c, 84, 80, 12, '#ffd27a');
    for (let i = 0; i < 4; i++) cloud(c, rng, 40 + i * 80 + rng() * 20, 20 + rng() * 20, 3, '#f6b89a', '#d88a7a');
    fillRidge(c, ridge(rng, 92, 12, 0.9), '#8a6c94', '#a487ac', GROUND + 2);
    fillRidge(c, ridge(rng, 99, 5, 0.6), '#a89048', '#c4aa58', GROUND + 4);
    windmill(c, 44, 100);
    cottage(c, 132, 100, 22, 13, '#c8a04a', '#a8823a');
    cottage(c, 178, 101, 26, 15, '#b8903e', '#98742e');
    cottage(c, 236, 100, 20, 12, '#c8a04a', '#a8823a', false);
    cottage(c, 276, 101, 24, 14, '#a85a3a', '#88442a');
    // Chapel tower.
    px(c, 214, 70, '#d8c8a8', 9, 31);
    coneRoof(c, 213, 70, 11, 12, '#6a4a3a', '#4a3428');
    px(c, 217, 77, '#4a3020', 2, 4);
    // Fence.
    for (let x = 0; x < SCENE_W; x += 6) px(c, x, 98, '#7a5634', 1, 5);
    px(c, 0, 99, '#8a6640', SCENE_W, 1);
    // Wheat field with a dirt path across it.
    px(c, 0, GROUND, '#d8b04a', SCENE_W, SCENE_H - GROUND);
    for (let y = GROUND + 1; y < SCENE_H; y += 3) {
      for (let x = (y * 5) % 4; x < SCENE_W; x += 4) px(c, x, y, rng() < 0.5 ? '#c49a3a' : '#e8c460', 1, 2);
    }
    for (let y = 132; y < 150; y++) {
      for (let x = 0; x < SCENE_W; x++) px(c, x, y, (x + y) % 9 === 0 ? '#8a6038' : rng() < 0.1 ? '#b8885a' : '#a8784a');
    }
    for (let i = 0; i < 6; i++) {
      const hx = 20 + rng() * 280;
      const hy = 112 + rng() * 14;
      disc(c, Math.round(hx), Math.round(hy), 5, '#c8963a');
      px(c, hx - 5, hy + 3, '#a8782a', 11, 2);
    }
  },

  forest(c, rng) {
    sky(c, ['#040b10', '#08161a', '#0d241f', '#123426', '#1a4630'], 0, GROUND);
    stars(c, rng, 30, 40, ['#cfe8d8', '#ffffff']);
    disc(c, 250, 24, 10, '#d8f0e0');
    disc(c, 254, 21, 8, '#0d241f');
    haze(c, 250, 24, 26, 18, '#4a8a6a', 0.25);
    // Layers of pines, darker towards the front.
    for (const [count, base, hmin, dark, lit] of [
      [26, 96, 26, '#0f2a22', '#14352a'],
      [20, 101, 34, '#09201a', '#0e2a20'],
    ] as const) {
      for (let i = 0; i < count; i++) pine(c, Math.round(rng() * SCENE_W), base + Math.round(rng() * 3), hmin + Math.floor(rng() * 14), dark, lit);
    }
    haze(c, 160, 92, 180, 10, '#5a8a78', 0.35);
    // Giant old trunks with roots.
    for (const [tx, w] of [[26, 14], [118, 10], [214, 16], [296, 12]] as const) {
      px(c, tx, 0, '#22180f', w, GROUND + 2);
      px(c, tx + w - 3, 0, '#2e2216', 2, GROUND + 2);
      for (let y = 6; y < GROUND; y += 9) px(c, tx + 2 + ((y / 9) % 3), y, '#160f0a', 2, 4);
      for (let k = 0; k < 6; k++) px(c, tx - k, GROUND - 3 + Math.round(k / 2), '#22180f', 2, 2);
      for (let k = 0; k < 6; k++) px(c, tx + w + k - 1, GROUND - 3 + Math.round(k / 2), '#22180f', 2, 2);
    }
    px(c, 0, GROUND, '#1a3420', SCENE_W, SCENE_H - GROUND);
    groundNoise(c, rng, ['#14291a', '#22422a', '#1c3a22'], 0.3);
    // Ferns.
    for (let i = 0; i < 24; i++) {
      const fx = rng() * SCENE_W;
      const fy = GROUND + 4 + rng() * 70;
      for (let k = 0; k < 4; k++) {
        px(c, fx - k, fy - k, '#2e5a32');
        px(c, fx + k, fy - k, '#2e5a32');
      }
    }
    // Glowing mushrooms.
    for (let i = 0; i < 9; i++) {
      const mx = Math.round(rng() * SCENE_W);
      const my = Math.round(GROUND + 2 + rng() * 60);
      const glow = rng() < 0.5 ? '#ff6ab8' : '#5ae8e0';
      haze(c, mx, my - 2, 7, 5, glow, 0.35);
      px(c, mx, my - 2, '#e8e0c8', 1, 3);
      px(c, mx - 2, my - 4, glow, 5, 2);
      px(c, mx - 1, my - 5, glow, 3, 1);
    }
    haze(c, 160, 160, 200, 14, '#3a6a5a', 0.2);
  },

  ruins(c, rng) {
    sky(c, ['#2a1a46', '#5a2c56', '#9e4250', '#dc7848', '#f6be6c'], 0, GROUND);
    disc(c, 250, 84, 18, '#ff9a4a');
    disc(c, 250, 84, 14, '#ffc46a');
    for (let i = 0; i < 7; i++) crow(c, 40 + rng() * 220, 14 + rng() * 34);
    fillRidge(c, ridge(rng, 92, 16, 1.1), '#5a2e52', '#74405e', GROUND + 2);
    fillRidge(c, ridge(rng, 100, 6, 0.7), '#4a3040', '#5e3c4c', GROUND + 4);
    const stone = '#c9b89c';
    const shade = '#a69378';
    // A broken arch on the left.
    px(c, 32, 50, stone, 10, 52);
    px(c, 40, 50, shade, 2, 52);
    px(c, 74, 62, stone, 10, 40);
    px(c, 82, 62, shade, 2, 40);
    for (let a = 180; a <= 300; a += 2) {
      const r = (a * Math.PI) / 180;
      px(c, 58 + Math.cos(r) * 21, 54 + Math.sin(r) * 18, stone, 4, 4);
    }
    px(c, 56, 34, '#e0d0b4', 5, 4);
    // A colonnade, some columns broken, one lintel still standing.
    const cols = [130, 152, 174, 196, 218, 290];
    const heights = [44, 30, 46, 46, 22, 36];
    cols.forEach((x, i) => column(c, x, 101, heights[i]!, stone, shade, ![0, 2, 3].includes(i), rng));
    px(c, 170, 52, stone, 36, 4);
    px(c, 170, 55, shade, 36, 1);
    px(c, 168, 50, stone, 40, 2);
    // Ivy.
    for (let i = 0; i < 40; i++) {
      const x = cols[Math.floor(rng() * cols.length)]! + rng() * 7;
      px(c, x, 60 + rng() * 40, rng() < 0.5 ? '#4a7a3a' : '#5e9246', 2, 2);
    }
    px(c, 0, GROUND, '#7a6448', SCENE_W, SCENE_H - GROUND);
    groundNoise(c, rng, ['#6a5640', '#8a7456', '#5e7a3a'], 0.25);
    // Fallen blocks.
    for (let i = 0; i < 10; i++) {
      const bx = rng() * SCENE_W;
      const by = GROUND + 6 + rng() * 66;
      const w = 4 + Math.floor(rng() * 6);
      px(c, bx, by, stone, w, 3);
      px(c, bx, by + 3, shade, w, 1);
    }
  },

  camp(c, rng) {
    sky(c, ['#1a1a3c', '#38284c', '#683a4c', '#a8584a', '#e2985a'], 0, GROUND);
    stars(c, rng, 30, 40);
    fillRidge(c, ridge(rng, 90, 14, 1), '#3c2a40', '#4e3650', GROUND + 2);
    // Palisade of sharpened logs.
    for (let x = 0; x < SCENE_W; x += 4) {
      const h = 18 + ((x * 7) % 5);
      px(c, x, 100 - h, '#5a3a22', 3, h);
      px(c, x + 1, 100 - h - 2, '#5a3a22', 1, 2);
      px(c, x + 2, 100 - h, '#3e2816', 1, h);
    }
    px(c, 0, 88, '#3e2816', SCENE_W, 1);
    // Tents and banners.
    tent(c, 52, 101, 30, 18, '#c8463a', '#efe0c8', '#c8463a');
    tent(c, 128, 101, 24, 15, '#3a5cc8', '#efe0c8');
    tent(c, 206, 101, 40, 24, '#8a3a8a', '#e8c860', '#e8c860');
    tent(c, 284, 101, 26, 16, '#3a8a4a', '#efe0c8');
    for (const [bx, color] of [[92, '#c8463a'], [166, '#3a5cc8'], [252, '#8a3a8a']] as const) {
      px(c, bx, 50, '#3a2a22', 1, 52);
      banner(c, bx + 1, 52, 7, 18, color, '#e8c860');
    }
    // Weapon rack.
    for (let k = 0; k < 4; k++) px(c, 108 + k * 3, 84, '#8a8a96', 1, 17);
    px(c, 106, 92, '#5a3a22', 14, 1);
    px(c, 0, GROUND, '#5a4634', SCENE_W, SCENE_H - GROUND);
    groundNoise(c, rng, ['#4a3a2a', '#6a5440', '#3e3022'], 0.28);
    // Cart tracks.
    for (const ty of [130, 136]) for (let x = 0; x < SCENE_W; x++) if (rng() < 0.7) px(c, x, ty, '#463626');
    campfire(c, 96, 104);
    campfire(c, 250, 104);
  },
};

const cache = new Map<SceneTheme, string>();

/** The theme's backdrop as a PNG data URL (rendered once, then cached). */
export function sceneImage(theme: SceneTheme): string | null {
  const hit = cache.get(theme);
  if (hit) return hit;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = SCENE_W;
  canvas.height = SCENE_H;
  const c = canvas.getContext('2d');
  if (!c) return null;
  const seeds: Record<SceneTheme, number> = { meadow: 11, ember: 23, frost: 37, cosmos: 51, storm: 63, deep: 77, kingdom: 89, village: 97, forest: 103, ruins: 113, camp: 127 };
  DRAW[theme](c, seededRandom(seeds[theme]));
  const url = canvas.toDataURL('image/png');
  cache.set(theme, url);
  return url;
}
