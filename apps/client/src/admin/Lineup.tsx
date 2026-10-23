import type { EncounterEnemy, StageDef } from '@gacha/shared';
import { useContent } from '../state/content';
import { NumberInput, Section, Select, type Option } from './fields';

function useEnemyOptions(): Option<string>[] {
  return useContent().bundle.enemies.map((e) => ({ value: e.id, label: `${e.emoji} ${e.name}${e.boss ? ' (boss)' : ''}` }));
}

/** Rows of enemy + level, for a wave or a dungeon tier. */
export function EnemyRows({ value, onChange, min = 1 }: { value: EncounterEnemy[]; onChange: (v: EncounterEnemy[]) => void; min?: number }) {
  const enemyOptions = useEnemyOptions();
  const set = (i: number, patch: Partial<EncounterEnemy>) => onChange(value.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  return (
    <>
      {value.map((e, i) => (
        <div key={i} className="effect-row">
          <span className="effect-n">{i + 1}</span>
          <Select value={e.id} onChange={(id) => set(i, { id })} options={enemyOptions} />
          <label className="inline">
            level
            <NumberInput value={e.level} onChange={(level) => set(i, { level })} min={1} />
          </label>
          <span className="effect-tools">
            <button className="icon-mini danger" disabled={value.length <= min} onClick={() => onChange(value.filter((_, j) => j !== i))} title="Remove">
              ✕
            </button>
          </span>
        </div>
      ))}
      <button
        className="btn small"
        disabled={value.length >= 5 || !enemyOptions.length}
        onClick={() => onChange([...value, { ...(value[value.length - 1] ?? { id: enemyOptions[0]!.value, level: 1 }) }])}
      >
        + Add enemy
      </button>
    </>
  );
}

/** Extra waves that arrive after the first is defeated. */
export function WavesEditor({ waves, onChange, fallback }: { waves: EncounterEnemy[][]; onChange: (w: EncounterEnemy[][]) => void; fallback: EncounterEnemy }) {
  return (
    <Section
      title="Extra waves"
      actions={
        <button className="btn small" disabled={waves.length >= 4} onClick={() => onChange([...waves, [{ ...fallback }]])}>
          + Add wave
        </button>
      }
    >
      <p className="small muted">
        {waves.length
          ? 'When every enemy is down, the next wave arrives and defeated enemies leave. Heroes keep their HP, energy and cooldowns.'
          : 'No extra waves: the battle is won when the enemies above are defeated.'}
      </p>
      {waves.map((w, i) => (
        <div key={i} className="wave-edit">
          <div className="wave-edit-head">
            <b>Wave {i + 2}</b>
            <button className="icon-mini danger" onClick={() => onChange(waves.filter((_, j) => j !== i))} title="Remove wave">
              ✕
            </button>
          </div>
          <EnemyRows value={w} onChange={(next) => onChange(waves.map((x, j) => (j === i ? next : x)))} />
        </div>
      ))}
    </Section>
  );
}

type MaterialDrop = StageDef['materialDrops'][number];

/** Material drop table rows (material, count range, chance). */
export function MaterialDropRows({ value, onChange }: { value: MaterialDrop[]; onChange: (v: MaterialDrop[]) => void }) {
  const content = useContent();
  const options: Option<string>[] = content.bundle.materials.map((m) => ({ value: m.id, label: `${m.emoji} ${m.name}` }));
  const set = (i: number, patch: Partial<MaterialDrop>) => onChange(value.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  return (
    <>
      {value.map((d, i) => (
        <div key={i} className="effect-row">
          <span className="effect-n">{i + 1}</span>
          <Select value={d.material} onChange={(material) => set(i, { material })} options={options} />
          <label className="inline">
            min
            <NumberInput value={d.min} onChange={(min) => set(i, { min: Math.max(1, min) })} min={1} />
          </label>
          <label className="inline">
            max
            <NumberInput value={d.max} onChange={(max) => set(i, { max: Math.max(1, max) })} min={1} />
          </label>
          <label className="inline">
            chance %
            <NumberInput value={Math.round(d.chance * 100)} onChange={(p) => set(i, { chance: Math.max(0, Math.min(100, p)) / 100 })} min={0} max={100} />
          </label>
          <span className="effect-tools">
            <button className="icon-mini danger" onClick={() => onChange(value.filter((_, j) => j !== i))} title="Remove">
              ✕
            </button>
          </span>
        </div>
      ))}
      <button
        className="btn small"
        disabled={value.length >= 8 || !options.length}
        onClick={() => onChange([...value, { material: options[0]!.value, min: 1, max: 2, chance: 1 }])}
      >
        + Add material
      </button>
    </>
  );
}
