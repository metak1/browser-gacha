import { describeObjective, type StageObjective } from '@gacha/shared';
import './stars.css';

/** A row of stars, filled for the ones earned. `animate` pops them in one by one. */
export function Stars({ value, max = 3, size = 'md', animate = false }: { value: number; max?: number; size?: 'sm' | 'md' | 'lg'; animate?: boolean }) {
  return (
    <span className={`stars ${size} ${animate ? 'animate' : ''}`} aria-label={`${value} of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < value ? 'on' : 'off'} style={animate ? { animationDelay: `${0.3 + i * 0.25}s` } : undefined}>
          ★
        </span>
      ))}
    </span>
  );
}

/** A stage's star conditions, with checkmarks when `met` is given. */
export function ObjectiveList({ objectives, met }: { objectives: StageObjective[]; met?: boolean[] }) {
  return (
    <ul className="objectives">
      {objectives.map((o, i) => (
        <li key={i} className={met ? (met[i] ? 'met' : 'missed') : ''}>
          <span className="objective-mark">{met ? (met[i] ? '✔' : '✖') : '★'}</span>
          {describeObjective(o)}
        </li>
      ))}
    </ul>
  );
}
