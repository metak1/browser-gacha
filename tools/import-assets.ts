/**
 * Imports third-party art from asset-packs/ into the game.
 *
 *   npm run assets
 *
 * - Character packs laid out like "Characters(100x100 split)/<Name>/<Name>/<Name>_<Anim>.png"
 *   (one horizontal strip per animation) are copied to apps/client/public/assets/sprites/<id>/
 *   and measured: the character's pixel bounds give a stable anchor (feet) and height, so
 *   sprites of any size line up on the battlefield.
 * - The Raven Fantasy Icons 16px sheet is copied to apps/client/public/assets/icons/.
 * - A manifest is written to packages/shared/src/assets.generated.ts so the server can
 *   validate sprite ids and the client knows frame counts.
 *
 * Re-run after adding more packs (e.g. the full paid versions); existing ids keep their names.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packs = join(root, 'asset-packs');
const publicDir = join(root, 'apps/client/public/assets');
const manifestFile = join(root, 'packages/shared/src/assets.generated.ts');

// ---------- minimal PNG decoder (8-bit RGBA, non-interlaced: what these packs use) ----------

interface Image {
  width: number;
  height: number;
  /** RGBA bytes, row-major. */
  data: Uint8Array;
}

function decodePng(file: string): Image {
  const buf = readFileSync(file);
  let pos = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const [depth, color, , , interlace] = [body[8], body[9], body[10], body[11], body[12]];
      if (depth !== 8 || color !== 6 || interlace !== 0) throw new Error(`${file}: only 8-bit RGBA non-interlaced PNGs are supported`);
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const data = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? data[y * stride + x - 4]! : 0;
      const b = y > 0 ? data[(y - 1) * stride + x]! : 0;
      const c = x >= 4 && y > 0 ? data[(y - 1) * stride + x - 4]! : 0;
      let v = src[x]!;
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      data[y * stride + x] = v & 0xff;
    }
  }
  return { width, height, data };
}

/** Bounds of non-transparent pixels across all frames of a strip, in frame coordinates. */
function opaqueBounds(img: Image, frame: number) {
  let x0 = frame,
    y0 = frame,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3]! > 0) {
        const fx = x % frame;
        x0 = Math.min(x0, fx);
        x1 = Math.max(x1, fx);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    }
  }
  return { x0, y0, x1, y1 };
}

// ---------- discovery ----------

/** Strip name (lowercased) → clip, in order of preference when several map to one clip. */
const CLIP_SOURCES: [clip: string, names: string[]][] = [
  ['idle', ['idle', 'flying']],
  ['walk', ['walk', 'walk01', 'flying']],
  ['attack1', ['attack01', 'attack']],
  ['attack2', ['attack02', 'heal']],
  ['attack3', ['attack03', 'attack3', 'summon']],
  ['hurt', ['hurt']],
  ['death', ['death']],
];

/**
 * "<Name>_<Anim>.png", optionally with a variant in brackets. Strips that bake the
 * spell into the frame ("With magic effects") look best in battle; "No ... effects"
 * strips are only used when there is nothing else.
 */
const STRIP = /_([A-Za-z0-9]+)(?:\((With magic effects|No [a-z]+ effects)\))?\.png$/;
const variantRank = (v: string | undefined) => (v === 'With magic effects' ? 0 : v === undefined ? 1 : 2);

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/_a$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

interface SpriteOut {
  id: string;
  name: string;
  pack: string;
  frame: number;
  anchorX: number;
  anchorY: number;
  height: number;
  clips: Record<string, number>;
  fx?: Record<string, { kind: 'missile' | 'impact'; frames: number }>;
}

/**
 * Which attack clips a projectile/effect strip belongs to, from its file name.
 * Arrows without a clip in the name are fired by every attack (archers), except
 * the Soldier's, which is his third attack (the bow).
 */
function fxClips(character: string, file: string): string[] {
  const n = basename(file);
  if (/Attack0?1/i.test(n)) return ['attack1'];
  if (/Attack0?2/i.test(n)) return ['attack2'];
  if (/Attack0?3/i.test(n)) return ['attack3'];
  if (/_Attack_/i.test(n)) return ['attack1'];
  if (/Heal/i.test(n)) return ['attack2'];
  if (/Sumon|Summon/i.test(n)) return ['attack3'];
  if (/Beam/i.test(n)) return ['attack3'];
  if (/^Arrow/i.test(n)) return character === 'Soldier' ? ['attack3'] : ['attack1', 'attack2'];
  return [];
}

/** Projectiles (flying, one frame) and impact effects (played on the target) next to a character's strips. */
function importFx(character: string, root: string, frame: number, outDir: string): SpriteOut['fx'] {
  const fx: NonNullable<SpriteOut['fx']> = {};
  const dirs = readdirSync(root).filter((d) => /\(projectile\)$/i.test(d) && statSync(join(root, d)).isDirectory());
  for (const d of dirs) {
    for (const f of readdirSync(join(root, d)).filter((x) => x.endsWith('.png') && !/32x32/.test(x))) {
      const file = join(root, d, f);
      const kind = /^(Arrow|Cannonball)/i.test(f) ? 'missile' : 'impact';
      const img = decodePng(file);
      if (img.height !== frame || img.width % frame !== 0) continue;
      const frames = img.width / frame;
      // Thin beam strips don't read well as a standalone effect.
      if (kind === 'impact' && frames < 4) continue;
      for (const clip of fxClips(character, file)) {
        if (fx[clip]) continue;
        fx[clip] = { kind, frames };
        copyFileSync(file, join(outDir, `fx-${clip}.png`));
      }
    }
  }
  return Object.keys(fx).length ? fx : undefined;
}

if (!existsSync(packs)) {
  console.error(`No ${packs} folder. Unzip the asset packs there first.`);
  process.exit(1);
}

const sprites: SpriteOut[] = [];
const files = walk(packs).filter((f) => f.endsWith('.png'));
// "<Name>/<Name>/<Name>_<Anim>.png" inside a "Characters(WxH split)" folder; skip the "with shadows" copies.
const strips = files.filter((f) => /Characters\(\d+x\d+ split\)/.test(f) && !/with shadows/i.test(f) && STRIP.test(f));
const byCharacter = new Map<string, string[]>();
for (const f of strips) {
  const dir = dirname(f);
  byCharacter.set(dir, [...(byCharacter.get(dir) ?? []), f]);
}

for (const [dir, list] of byCharacter) {
  if (/\(projectile\)$/i.test(dir)) continue; // effect sprites, not characters
  const name = basename(dir);
  const frame = Number(/Characters\((\d+)x\d+ split\)/.exec(dir)![1]);
  const pack = basename(dir.split(/Characters\(/)[0]!.replace(/[\\/]$/, ''));
  const id = slug(name);
  const outDir = join(publicDir, 'sprites', id);
  mkdirSync(outDir, { recursive: true });

  // Pick one source strip per clip: by name preference, then by variant.
  const parsed = list.map((f) => {
    const m = STRIP.exec(f)!;
    return { f, anim: m[1]!.toLowerCase(), variant: m[2] };
  });
  const clips: Record<string, number> = {};
  let idleBounds: ReturnType<typeof opaqueBounds> | null = null;
  for (const [clip, names] of CLIP_SOURCES) {
    const source = names
      .flatMap((n, i) => parsed.filter((p) => p.anim === n).map((p) => ({ ...p, rank: i * 10 + variantRank(p.variant) })))
      .sort((a, b) => a.rank - b.rank)[0];
    if (!source) continue;
    const img = decodePng(source.f);
    if (img.width % frame !== 0) {
      console.warn(`${name}: ${basename(source.f)} is not a whole number of ${frame}px frames; skipped`);
      continue;
    }
    clips[clip] = img.width / frame;
    if (clip === 'idle') idleBounds = opaqueBounds(img, frame);
    copyFileSync(source.f, join(outDir, `${clip}.png`));
  }
  if (!idleBounds || !clips.idle) {
    console.warn(`Skipping ${name}: no idle animation`);
    continue;
  }
  sprites.push({
    id,
    name: name.replace(/_A$/, '').replace(/_/g, ' '),
    pack,
    frame,
    // Feet: horizontal centre and bottom edge of the idle pose.
    anchorX: Math.round((idleBounds.x0 + idleBounds.x1 + 1) / 2),
    anchorY: idleBounds.y1 + 1,
    height: idleBounds.y1 + 1 - idleBounds.y0,
    clips,
    fx: importFx(name, dirname(dir), frame, outDir),
  });
}
sprites.sort((a, b) => a.id.localeCompare(b.id));

// ---------- icons ----------

const iconSheet = files.find((f) => /Raven Fantasy Icons[\\/]Full Spritesheet[\\/]16x16\.png$/.test(f));
let iconCount = 0;
if (iconSheet) {
  mkdirSync(join(publicDir, 'icons'), { recursive: true });
  copyFileSync(iconSheet, join(publicDir, 'icons', 'raven-16.png'));
  const img = decodePng(iconSheet);
  iconCount = (img.width / 16) * (img.height / 16);
}

// ---------- manifest ----------

const header = `// Generated by \`npm run assets\` (tools/import-assets.ts). Do not edit by hand.\n`;
writeFileSync(
  manifestFile,
  `${header}
export interface SpriteDef {
  id: string;
  name: string;
  /** Source pack, for credits. */
  pack: string;
  /** Square frame size in source pixels. */
  frame: number;
  /** Feet position inside a frame, in source pixels. */
  anchorX: number;
  anchorY: number;
  /** Height of the idle pose in source pixels (used to scale sprites to a target size). */
  height: number;
  /** Frames per clip (idle, attack1, hurt, death, ...). */
  clips: Partial<Record<SpriteClip, number>>;
  /** Attack effects: a projectile that flies to the target, or an effect played on it (fx-<clip>.png). */
  fx?: Partial<Record<'attack1' | 'attack2' | 'attack3', { kind: 'missile' | 'impact'; frames: number }>>;
}

export type SpriteClip = 'idle' | 'walk' | 'attack1' | 'attack2' | 'attack3' | 'hurt' | 'death';

export const SPRITES: Record<string, SpriteDef> = ${JSON.stringify(Object.fromEntries(sprites.map((s) => [s.id, s])), null, 2)};

/** Icons in the 16px Raven Fantasy Icons sheet, numbered from 1 left-to-right, top-to-bottom. */
export const ICON_COUNT = ${iconCount};
export const ICON_COLUMNS = 16;
`,
);

console.log(`Imported ${sprites.length} sprites: ${sprites.map((s) => `${s.id} (${Object.keys(s.clips).join(', ')})`).join('; ')}`);
console.log(`Icons: ${iconCount}`);
