import type { BattleUnit } from '@gacha/shared';
import { useState } from 'react';
import { UnitArt } from '../components/Art';
import type { UnitTally } from './useBattle';

type Measure = keyof UnitTally;

const MEASURES: { key: Measure; label: string }[] = [
  { key: 'dealt', label: 'Damage dealt' },
  { key: 'taken', label: 'Damage taken' },
  { key: 'healed', label: 'Healing' },
  { key: 'shielded', label: 'Shields' },
];

/**
 * End-of-battle breakdown: one bar per hero for the picked measure, longest first,
 * with the value at the bar's tip. Hovering a row shows all four numbers for that hero.
 */
export function CombatBars({ units, tally }: { units: BattleUnit[]; tally: Record<string, UnitTally> }) {
  const [measure, setMeasure] = useState<Measure>('dealt');
  const team = units.filter((u) => u.side === 'ally');
  const value = (u: BattleUnit, m: Measure) => tally[u.uid]?.[m] ?? 0;
  const total = (m: Measure) => team.reduce((n, u) => n + value(u, m), 0);
  const rows = [...team].sort((a, b) => value(b, measure) - value(a, measure));
  const max = Math.max(1, ...rows.map((u) => value(u, measure)));

  return (
    <section className="combat-bars" aria-label="Battle breakdown">
      <div className="combat-tabs" role="tablist">
        {MEASURES.map((m) => (
          <button key={m.key} role="tab" aria-selected={m.key === measure} className={m.key === measure ? 'on' : ''} onClick={() => setMeasure(m.key)}>
            <span>{m.label}</span>
            <b>{total(m.key).toLocaleString()}</b>
          </button>
        ))}
      </div>
      {/* Rows stay even when everything is 0, so switching tabs never changes the card's height. */}
      <ol className={`combat-rows ${measure}`}>
        {rows.map((u) => {
          const v = value(u, measure);
          const t = tally[u.uid];
          return (
            <li
              key={u.uid}
              title={`${u.name}: ${(t?.dealt ?? 0).toLocaleString()} dealt · ${(t?.taken ?? 0).toLocaleString()} taken · ${(t?.healed ?? 0).toLocaleString()} healed · ${(t?.shielded ?? 0).toLocaleString()} shielded`}
            >
              <span className="combat-who">
                <UnitArt sprite={u.sprite} emoji={u.emoji} height="22px" />
                <span>{u.name}</span>
              </span>
              <span className="combat-track">
                {v > 0 && <span className="combat-bar" style={{ width: `calc((100% - 4.5em) * ${v / max})` }} />}
                <span className="combat-value">{v.toLocaleString()}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
