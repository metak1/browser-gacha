import type { CSSProperties } from 'react';
import type { FxItem } from './useBattle';

const GLYPHS: Partial<Record<FxItem['kind'], string>> = {
  heal: '✚',
  buff: '▲',
  debuff: '▼',
  frost: '❄',
};

const COUNT: Partial<Record<FxItem['kind'], number>> = { heal: 6, buff: 4, debuff: 4, burn: 5, shield: 0, gale: 0 };

/** One-shot hit/heal/status effect, positioned at the centre of a sprite. Pure CSS animation. */
export function FxView({ fx }: { fx: FxItem }) {
  const n = COUNT[fx.kind] ?? 8;
  const glyph = GLYPHS[fx.kind] ?? '';
  return (
    <div className={`fx fx-${fx.kind} ${fx.crit ? 'crit' : ''}`}>
      <span className="fx-flash" />
      {fx.kind === 'volt' && (
        <svg className="fx-bolt" viewBox="0 0 40 100" preserveAspectRatio="none">
          <polyline points="24,0 12,44 26,48 8,100" />
        </svg>
      )}
      {fx.kind === 'gale' && [0, 1, 2].map((i) => <span key={i} className="fx-slash" style={{ '--i': i } as CSSProperties} />)}
      {fx.kind === 'shield' && <span className="fx-dome" />}
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="fx-p" style={{ '--a': `${(360 / n) * i + 17}deg`, '--i': i } as CSSProperties}>
          {glyph}
        </span>
      ))}
    </div>
  );
}
