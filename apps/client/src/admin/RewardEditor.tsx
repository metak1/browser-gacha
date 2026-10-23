import type { Reward } from '@gacha/shared';
import { useContent } from '../state/content';
import { Field, FormGrid, NumberInput, Select } from './fields';

/** Gems/gold/stardust plus any number of materials. */
export function RewardEditor({ value, onChange }: { value: Reward; onChange: (r: Reward) => void }) {
  const content = useContent();
  const options = content.bundle.materials.map((m) => ({ value: m.id, label: `${m.emoji} ${m.name}` }));
  const setMat = (i: number, patch: Partial<Reward['materials'][number]>) =>
    onChange({ ...value, materials: value.materials.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  return (
    <>
      <FormGrid>
        <Field label="Gems 💎">
          <NumberInput value={value.gems} onChange={(v) => onChange({ ...value, gems: v })} min={0} />
        </Field>
        <Field label="Gold 🪙">
          <NumberInput value={value.gold} onChange={(v) => onChange({ ...value, gold: v })} min={0} />
        </Field>
        <Field label="Stardust ✨">
          <NumberInput value={value.stardust} onChange={(v) => onChange({ ...value, stardust: v })} min={0} />
        </Field>
      </FormGrid>
      {value.materials.map((m, i) => (
        <div key={i} className="effect-row">
          <Select value={m.id} onChange={(id) => setMat(i, { id })} options={options} />
          <label className="inline">
            ×
            <NumberInput value={m.count} onChange={(count) => setMat(i, { count: Math.max(1, count) })} min={1} />
          </label>
          <span className="effect-tools">
            <button className="icon-mini danger" onClick={() => onChange({ ...value, materials: value.materials.filter((_, j) => j !== i) })}>
              ✕
            </button>
          </span>
        </div>
      ))}
      <button
        className="btn small"
        disabled={!options.length || value.materials.length >= 8}
        onClick={() => onChange({ ...value, materials: [...value.materials, { id: options[0]!.value, count: 1 }] })}
      >
        + Material
      </button>
    </>
  );
}
