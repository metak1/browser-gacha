import {
  EFFECT_KINDS,
  EFFECT_TARGETS,
  STATUS_IDS,
  STATUS_INFO,
  type Effect,
  type EffectKind,
  SCALE_STATS,
  type EffectTarget,
  type ScaleStat,
} from '@gacha/shared';
import { useContent } from '../state/content';
import { NumberInput, options, Select } from './fields';

const TO_LABEL: Record<EffectTarget, string> = {
  target: 'The picked unit',
  self: 'Self',
  allEnemies: 'All enemies',
  allAllies: 'All allies',
  lowestAlly: 'Most injured ally',
};
const KIND_LABEL: Record<EffectKind, string> = {
  damage: 'Damage',
  heal: 'Heal',
  shield: 'Shield',
  status: 'Apply status',
  advance: 'Advance turn',
  delay: 'Delay turn',
  energy: 'Grant energy',
  cleanse: 'Cleanse debuffs',
  dispel: 'Dispel buffs',
  revive: 'Revive fallen',
  summon: 'Summon units',
};

export function defaultEffect(kind: EffectKind, to: EffectTarget): Effect {
  switch (kind) {
    case 'damage':
      return { kind, to, mult: 1.5 };
    case 'heal':
      return { kind, to, mult: 1.5 };
    case 'shield':
      return { kind, to, mult: 1.2 };
    case 'status':
      return { kind, to, status: 'burn', turns: 2 };
    case 'advance':
      return { kind, to, amount: 0.25 };
    case 'energy':
      return { kind, to, amount: 20 };
    case 'summon':
      return { kind, to: 'self', unit: '', count: 1 };
    case 'delay':
      return { kind, to, amount: 0.25 };
    case 'cleanse':
      return { kind, to };
    case 'dispel':
      return { kind, to };
    case 'revive':
      return { kind, to, amount: 0.3 };
  }
}

/** Sets an optional numeric field, dropping it at its "off" value so content stays tidy. */
function optional<E extends object, K extends keyof E>(e: E, key: K, value: number, off: number): E {
  const { [key]: _, ...rest } = e;
  return (value === off ? rest : { ...rest, [key]: value }) as E;
}

/** Ordered list of effects with per-kind inputs. Used by spells and passive triggers. */
const SCALE_LABEL: Record<ScaleStat, string> = { atk: 'ATK', def: 'DEF', hp: 'max HP', spd: 'ATK × SPD' };

export function EffectList({
  effects,
  onChange,
  targetLabel,
}: {
  effects: Effect[];
  onChange: (effects: Effect[]) => void;
  /** Overrides the label of the 'target' option (e.g. "The attacker"). */
  targetLabel?: string;
}) {
  const enemies = useContent().bundle.enemies;
  const enemyOptions = enemies.map((u) => ({ value: u.id, label: `${u.emoji} ${u.name}` }));
  const setEffect = (i: number, e: Effect) => onChange(effects.map((x, j) => (j === i ? e : x)));
  const move = (i: number, d: number) => {
    const list = [...effects];
    const [e] = list.splice(i, 1);
    list.splice(i + d, 0, e!);
    onChange(list);
  };
  return (
    <>
      {effects.map((e, i) => (
        <div key={i} className="effect-row">
          <span className="effect-n">{i + 1}</span>
          <Select value={e.kind} onChange={(k) => setEffect(i, defaultEffect(k, e.to))} options={options(EFFECT_KINDS, (k) => KIND_LABEL[k])} />
          {e.kind !== 'summon' && (
            <Select
              value={e.to}
              onChange={(to) => setEffect(i, { ...e, to })}
              options={options(EFFECT_TARGETS, (t) => (t === 'target' && targetLabel) || TO_LABEL[t])}
            />
          )}
          {(e.kind === 'damage' || e.kind === 'heal' || e.kind === 'shield') && (
            <>
              <label className="inline">
                ×
                <NumberInput value={e.mult} onChange={(mult) => setEffect(i, { ...e, mult })} step={0.05} min={0} max={20} />
              </label>
              <label className="inline" title="What the multiplier applies to. ATK × SPD means ATK × SPD/100; max HP is the caster's.">
                of
                <Select
                  value={e.scale ?? 'atk'}
                  onChange={(scale) => {
                    const { scale: _, ...rest } = e;
                    setEffect(i, scale === 'atk' ? rest : { ...rest, scale });
                  }}
                  options={options(SCALE_STATS, (s) => SCALE_LABEL[s])}
                />
              </label>
              {e.kind === 'damage' && (
                <>
                  <label className="inline" title="Splits the damage into several hits; each rolls its own crit.">
                    hits
                    <NumberInput value={e.hits ?? 1} onChange={(n) => setEffect(i, optional(e, 'hits', Math.max(1, Math.min(10, n)), 1))} min={1} max={10} />
                  </label>
                  <label className="inline" title="Part of the target's DEF this damage ignores.">
                    pierce %
                    <NumberInput
                      value={Math.round((e.pierce ?? 0) * 100)}
                      onChange={(p) => setEffect(i, optional(e, 'pierce', Math.max(0, Math.min(100, p)) / 100, 0))}
                      min={0}
                      max={100}
                    />
                  </label>
                  <label className="inline" title="Heals the caster for this part of the damage dealt.">
                    lifesteal %
                    <NumberInput
                      value={Math.round((e.lifesteal ?? 0) * 100)}
                      onChange={(p) => setEffect(i, optional(e, 'lifesteal', Math.max(0, Math.min(500, p)) / 100, 0))}
                      min={0}
                      max={500}
                    />
                  </label>
                </>
              )}
            </>
          )}
          {e.kind === 'status' && (
            <>
              <Select
                value={e.status}
                onChange={(status) => setEffect(i, { ...e, status })}
                options={options(STATUS_IDS, (s) => `${STATUS_INFO[s].icon} ${STATUS_INFO[s].label}`)}
              />
              <label className="inline">
                turns
                <NumberInput value={e.turns} onChange={(turns) => setEffect(i, { ...e, turns })} min={1} max={10} />
              </label>
              <label className="inline">
                chance %
                <NumberInput
                  value={Math.round((e.chance ?? 1) * 100)}
                  onChange={(pct) => {
                    const { chance: _, ...rest } = e;
                    setEffect(i, pct >= 100 ? rest : { ...rest, chance: Math.max(0, pct) / 100 });
                  }}
                  min={0}
                  max={100}
                />
              </label>
            </>
          )}
          {e.kind === 'revive' && (
            <label className="inline" title="With 'All allies' every fallen ally comes back; otherwise the first to fall.">
              HP %
              <NumberInput
                value={Math.round(e.amount * 100)}
                onChange={(p) => setEffect(i, { ...e, amount: Math.max(1, Math.min(100, p)) / 100 })}
                min={1}
                max={100}
              />
            </label>
          )}
          {(e.kind === 'advance' || e.kind === 'delay') && (
            <label className="inline">
              gauge %
              <NumberInput value={Math.round(e.amount * 100)} onChange={(p) => setEffect(i, { ...e, amount: p / 100 })} min={0} max={100} />
            </label>
          )}
          {e.kind === 'summon' && (
            <>
              <Select value={e.unit} onChange={(unit) => setEffect(i, { ...e, unit })} options={[{ value: '', label: '— pick an enemy —' }, ...enemyOptions]} />
              <label className="inline">
                count
                <NumberInput value={e.count} onChange={(count) => setEffect(i, { ...e, count: Math.max(1, Math.min(4, count)) })} min={1} max={4} />
              </label>
            </>
          )}
          {e.kind === 'energy' && (
            <label className="inline">
              energy
              <NumberInput value={e.amount} onChange={(amount) => setEffect(i, { ...e, amount })} min={0} max={100} />
            </label>
          )}
          <span className="effect-tools">
            <button className="icon-mini" disabled={i === 0} onClick={() => move(i, -1)} title="Move up">
              ↑
            </button>
            <button className="icon-mini" disabled={i === effects.length - 1} onClick={() => move(i, 1)} title="Move down">
              ↓
            </button>
            <button className="icon-mini danger" onClick={() => onChange(effects.filter((_, j) => j !== i))} title="Remove">
              ✕
            </button>
          </span>
        </div>
      ))}
    </>
  );
}
