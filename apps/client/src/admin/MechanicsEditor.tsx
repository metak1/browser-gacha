import type { EnemyMechanics } from '@gacha/shared';
import { useContent } from '../state/content';
import { Check, Field, FormGrid, NumberInput, Section, Select, type Option } from './fields';

const NONE: EnemyMechanics = { charge: null, enrage: null, adds: null };

/** Boss mechanics: charged attacks the team can break, an enrage, and adds at HP thresholds. */
export function MechanicsEditor({ value, onChange }: { value: EnemyMechanics | null | undefined; onChange: (m: EnemyMechanics | null) => void }) {
  const content = useContent();
  const m = value ?? NONE;
  const set = (patch: Partial<EnemyMechanics>) => {
    const next = { ...m, ...patch };
    onChange(next.charge || next.enrage || next.adds ? next : null);
  };
  const skillOptions: Option<string>[] = content.bundle.skills.map((s) => ({ value: s.id, label: `${s.name} (${s.id})` }));
  const enemyOptions: Option<string>[] = content.bundle.enemies.map((e) => ({ value: e.id, label: `${e.emoji} ${e.name}` }));
  const pct = (n: number) => Math.round(n * 100);

  return (
    <Section title="Boss mechanics">
      <p className="small muted">Scripted behaviour shown to players with a warning banner. Works on any enemy, but is meant for bosses.</p>

      <FormGrid>
        <Field label="Charged attack" hint="Every few turns it spends a turn charging, then unleashes the spell on its next turn.">
          <Check
            checked={Boolean(m.charge)}
            onChange={(on) => set({ charge: on ? { skill: content.bundle.skills[0]?.id ?? '', every: 3, breakPct: 0.1 } : null })}
            label="Enabled"
          />
        </Field>
        {m.charge && (
          <>
            <Field label="Spell">
              <Select value={m.charge.skill} onChange={(skill) => set({ charge: { ...m.charge!, skill } })} options={skillOptions} />
            </Field>
            <Field label="Every (own turns)" hint="3 = two normal turns, then a charge.">
              <NumberInput value={m.charge.every} onChange={(every) => set({ charge: { ...m.charge!, every } })} min={2} max={20} />
            </Field>
            <Field label="Break at % of max HP" hint="Damage the team must deal while it charges. Breaking stuns it for a turn.">
              <NumberInput value={pct(m.charge.breakPct)} onChange={(v) => set({ charge: { ...m.charge!, breakPct: v / 100 } })} min={1} max={100} />
            </Field>
          </>
        )}
      </FormGrid>

      <FormGrid>
        <Field label="Enrage" hint="Once, when its HP drops below the threshold.">
          <Check checked={Boolean(m.enrage)} onChange={(on) => set({ enrage: on ? { below: 0.3, atk: 1.3, spd: 1.15 } : null })} label="Enabled" />
        </Field>
        {m.enrage && (
          <>
            <Field label="Below % HP">
              <NumberInput value={pct(m.enrage.below)} onChange={(v) => set({ enrage: { ...m.enrage!, below: v / 100 } })} min={1} max={99} />
            </Field>
            <Field label="ATK ×">
              <NumberInput value={m.enrage.atk} onChange={(atk) => set({ enrage: { ...m.enrage!, atk } })} min={1} max={5} step={0.05} />
            </Field>
            <Field label="SPD ×">
              <NumberInput value={m.enrage.spd} onChange={(spd) => set({ enrage: { ...m.enrage!, spd } })} min={1} max={5} step={0.05} />
            </Field>
          </>
        )}
      </FormGrid>

      <FormGrid>
        <Field label="Calls adds" hint="Summons minions (weaker copies) at HP thresholds, once each.">
          <Check checked={Boolean(m.adds)} onChange={(on) => set({ adds: on ? { at: [0.5], unit: content.bundle.enemies[0]?.id ?? '', count: 1 } : null })} label="Enabled" />
        </Field>
        {m.adds && (
          <>
            <Field label="Minion">
              <Select value={m.adds.unit} onChange={(unit) => set({ adds: { ...m.adds!, unit } })} options={enemyOptions} />
            </Field>
            <Field label="How many">
              <NumberInput value={m.adds.count} onChange={(count) => set({ adds: { ...m.adds!, count } })} min={1} max={4} />
            </Field>
            <Field label="At % HP" hint="Each threshold fires once.">
              <span className="inline-list">
                {m.adds.at.map((a, i) => (
                  <span key={i} className="inline">
                    <NumberInput
                      value={pct(a)}
                      onChange={(v) => set({ adds: { ...m.adds!, at: m.adds!.at.map((x, j) => (j === i ? v / 100 : x)) } })}
                      min={1}
                      max={99}
                    />
                    {m.adds!.at.length > 1 && (
                      <button className="icon-mini danger" onClick={() => set({ adds: { ...m.adds!, at: m.adds!.at.filter((_, j) => j !== i) } })} title="Remove">
                        ✕
                      </button>
                    )}
                  </span>
                ))}
                {m.adds.at.length < 5 && (
                  <button className="btn small" onClick={() => set({ adds: { ...m.adds!, at: [...m.adds!.at, Math.max(0.1, Math.min(...m.adds!.at) - 0.2)] } })}>
                    +
                  </button>
                )}
              </span>
            </Field>
          </>
        )}
      </FormGrid>
    </Section>
  );
}
