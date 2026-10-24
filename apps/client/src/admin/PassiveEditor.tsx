import {
  COMBAT_LABEL,
  COMBAT_STATS,
  describePassive,
  PASSIVE_RULE_KINDS,
  PASSIVE_TRIGGERS,
  STATUS_IDS,
  STATUS_INFO,
  type Passive,
  type PassiveRule,
  type PassiveRuleKind,
  type PassiveTrigger,
} from '@gacha/shared';
import { EffectList } from './EffectList';
import { Field, FormGrid, NumberInput, options, Section, Select, TextInput } from './fields';

const RULE_LABEL: Record<PassiveRuleKind, string> = {
  stat: 'Stat bonus',
  combat: 'Crit / effect stat',
  damageVsStatus: 'Damage vs status',
  lowHpDamage: 'Damage at low HP',
  critRate: 'Crit chance',
  trigger: 'Triggered effects',
};
const TRIGGER_LABEL: Record<PassiveTrigger, string> = {
  battleStart: 'At battle start',
  turnStart: 'At the start of its turn',
  hit: 'When hit by an enemy',
  kill: 'After defeating an enemy',
};

function defaultRule(kind: PassiveRuleKind): PassiveRule {
  switch (kind) {
    case 'stat':
      return { kind, stat: 'atk', amount: 0.1 };
    case 'damageVsStatus':
      return { kind, status: 'burn', amount: 0.2 };
    case 'lowHpDamage':
      return { kind, threshold: 0.4, amount: 0.3 };
    case 'critRate':
      return { kind, amount: 0.1 };
    case 'combat':
      return { kind, stat: 'critDmg', amount: 0.2 };
    case 'trigger':
      return { kind, on: 'battleStart', effects: [{ kind: 'energy', to: 'self', amount: 20 }] };
  }
}

/** Percent input over a 0–1 fraction. */
function Pct({ value, onChange, max = 500 }: { value: number; onChange: (v: number) => void; max?: number }) {
  return <NumberInput value={Math.round(value * 100)} onChange={(p) => onChange(p / 100)} min={0} max={max} />;
}

/** Edits a unit's optional passive: a name and a few always-on rules. */
export function PassiveEditor({ passive, onChange }: { passive: Passive | null; onChange: (p: Passive | null) => void }) {
  if (!passive) {
    return (
      <Section
        title="Passive"
        actions={
          <button className="btn small" onClick={() => onChange({ name: 'New Passive', rules: [defaultRule('stat')] })}>
            + Add passive
          </button>
        }
      >
        <p className="small muted">No passive. Passives are always-on bonuses or effects that fire on battle events.</p>
      </Section>
    );
  }
  const setRule = (i: number, r: PassiveRule) => onChange({ ...passive, rules: passive.rules.map((x, j) => (j === i ? r : x)) });

  return (
    <Section
      title="Passive"
      actions={
        <>
          <button
            className="btn small"
            disabled={passive.rules.length >= 4}
            onClick={() => onChange({ ...passive, rules: [...passive.rules, defaultRule('stat')] })}
          >
            + Add rule
          </button>
          <button className="btn small danger" onClick={() => onChange(null)}>
            Remove passive
          </button>
        </>
      }
    >
      <FormGrid>
        <Field label="Name">
          <TextInput value={passive.name} onChange={(name) => onChange({ ...passive, name })} />
        </Field>
      </FormGrid>
      {passive.rules.map((r, i) => (
        <div key={i} className="passive-rule">
          <div className="effect-row">
            <span className="effect-n">{i + 1}</span>
            <Select value={r.kind} onChange={(k) => setRule(i, defaultRule(k))} options={options(PASSIVE_RULE_KINDS, (k) => RULE_LABEL[k])} />
            {r.kind === 'stat' && (
              <>
                <Select
                  value={r.stat}
                  onChange={(stat) => setRule(i, { ...r, stat })}
                  options={options(['hp', 'atk', 'def', 'spd'] as const, (s) => s.toUpperCase())}
                />
                <label className="inline">
                  +%
                  <Pct value={r.amount} onChange={(amount) => setRule(i, { ...r, amount })} />
                </label>
              </>
            )}
            {r.kind === 'damageVsStatus' && (
              <>
                <Select
                  value={r.status}
                  onChange={(status) => setRule(i, { ...r, status })}
                  options={options(STATUS_IDS, (s) => `${STATUS_INFO[s].icon} ${STATUS_INFO[s].label}`)}
                />
                <label className="inline">
                  +% dmg
                  <Pct value={r.amount} onChange={(amount) => setRule(i, { ...r, amount })} />
                </label>
              </>
            )}
            {r.kind === 'lowHpDamage' && (
              <>
                <label className="inline">
                  below HP %
                  <Pct value={r.threshold} onChange={(threshold) => setRule(i, { ...r, threshold: Math.max(0.01, Math.min(1, threshold)) })} max={100} />
                </label>
                <label className="inline">
                  +% dmg
                  <Pct value={r.amount} onChange={(amount) => setRule(i, { ...r, amount })} />
                </label>
              </>
            )}
            {r.kind === 'combat' && (
              <>
                <Select value={r.stat} onChange={(stat) => setRule(i, { ...r, stat })} options={options(COMBAT_STATS, (s) => COMBAT_LABEL[s])} />
                <label className="inline">
                  +points %
                  <Pct value={r.amount} onChange={(amount) => setRule(i, { ...r, amount })} />
                </label>
              </>
            )}
            {r.kind === 'critRate' && (
              <label className="inline">
                +% crit
                <Pct value={r.amount} onChange={(amount) => setRule(i, { ...r, amount: Math.min(1, amount) })} max={100} />
              </label>
            )}
            {r.kind === 'trigger' && (
              <>
                <Select value={r.on} onChange={(on) => setRule(i, { ...r, on })} options={options(PASSIVE_TRIGGERS, (t) => TRIGGER_LABEL[t])} />
                <label className="inline">
                  chance %
                  <NumberInput
                    value={Math.round((r.chance ?? 1) * 100)}
                    onChange={(pct) => {
                      const { chance: _, ...rest } = r;
                      setRule(i, pct >= 100 ? rest : { ...rest, chance: Math.max(0, pct) / 100 });
                    }}
                    min={0}
                    max={100}
                  />
                </label>
                <button
                  className="btn small"
                  disabled={r.effects.length >= 4}
                  onClick={() => setRule(i, { ...r, effects: [...r.effects, { kind: 'damage', to: r.on === 'hit' ? 'target' : 'allEnemies', mult: 0.5 }] })}
                >
                  + Effect
                </button>
              </>
            )}
            <span className="effect-tools">
              <button
                className="icon-mini danger"
                disabled={passive.rules.length <= 1}
                onClick={() => onChange({ ...passive, rules: passive.rules.filter((_, j) => j !== i) })}
                title="Remove rule"
              >
                ✕
              </button>
            </span>
          </div>
          {r.kind === 'trigger' && (
            <div className="passive-effects">
              <EffectList
                effects={r.effects}
                onChange={(effects) => setRule(i, { ...r, effects })}
                targetLabel={r.on === 'hit' ? 'The attacker' : 'The target (only for "when hit")'}
              />
              {r.on !== 'hit' && r.effects.some((e) => e.to === 'target') && (
                <p className="warn-text small">⚠ Only “when hit” triggers have a target (the attacker).</p>
              )}
            </div>
          )}
        </div>
      ))}
      <p className="preview-text small">
        <b>✦ {passive.name}</b>
        <br />
        {describePassive(passive)}
      </p>
    </Section>
  );
}
