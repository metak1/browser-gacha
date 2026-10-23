import { SCENE_THEMES, type DungeonDef, type DungeonTier } from '@gacha/shared';
import { Scene } from '../../components/Scene';
import { useContent } from '../../state/content';
import { EntityEditor, type FormProps } from '../EntityEditor';
import { EnemyRows, MaterialDropRows, WavesEditor } from '../Lineup';
import { Field, FormGrid, NumberInput, options, Section, Select, TextInput } from '../fields';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function DungeonsEditor() {
  const content = useContent();
  const enemy = content.bundle.enemies[0]?.id ?? '';
  return (
    <EntityEditor<DungeonDef>
      kind="dungeons"
      title="Dungeons"
      singular="dungeon"
      items={content.bundle.dungeons}
      search={(d) => `${d.id} ${d.name}`}
      label={(d) => (
        <>
          <span className="ed-emoji">{d.emoji}</span>
          <span>{d.name}</span>
          <small className="muted">{d.days.map((x) => DAYS[x]).join(' ')}</small>
        </>
      )}
      blank={() => ({
        id: '',
        name: 'New Dungeon',
        emoji: '🗝️',
        description: '',
        theme: 'meadow',
        days: [0],
        tiers: [{ name: 'Tier I', recommendedLevel: 10, enemies: [{ id: enemy, level: 8 }], waves: [], gold: 400, materialDrops: [] }],
      })}
      Form={DungeonForm}
    />
  );
}

function DungeonForm({ value, onChange, isNew }: FormProps<DungeonDef>) {
  const set = <K extends keyof DungeonDef>(k: K, v: DungeonDef[K]) => onChange({ ...value, [k]: v });
  const setTier = (i: number, patch: Partial<DungeonTier>) => set('tiers', value.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const toggleDay = (d: number) => set('days', value.days.includes(d) ? value.days.filter((x) => x !== d) : [...value.days, d].sort());

  return (
    <>
      <Section title="Dungeon">
        <FormGrid>
          <Field label="ID" hint="Can't be changed after creation.">
            <TextInput value={value.id} onChange={(v) => set('id', v)} disabled={!isNew} placeholder="e.g. ember-forge" />
          </Field>
          <Field label="Name">
            <TextInput value={value.name} onChange={(v) => set('name', v)} />
          </Field>
          <Field label="Emoji">
            <TextInput value={value.emoji} onChange={(v) => set('emoji', v)} />
          </Field>
          <Field label="Scenery">
            <Select value={value.theme} onChange={(v) => set('theme', v)} options={options(SCENE_THEMES)} />
          </Field>
          <Field label="Description" wide>
            <TextInput value={value.description} onChange={(v) => set('description', v)} />
          </Field>
          <Field label="Open on (UTC)" hint="No days = never open." wide>
            <div className="day-picks">
              {DAYS.map((d, i) => (
                <button key={d} className={`chip ${value.days.includes(i) ? 'active' : ''}`} onClick={() => toggleDay(i)}>
                  {d}
                </button>
              ))}
            </div>
          </Field>
        </FormGrid>
        <div className="scene-preview">
          <Scene theme={value.theme} />
        </div>
      </Section>

      {value.tiers.map((t, i) => (
        <div key={i} className="tier-edit">
          <Section
            title={`Tier ${i + 1}: ${t.name}`}
            actions={
              <button className="btn small danger" disabled={value.tiers.length <= 1} onClick={() => set('tiers', value.tiers.filter((_, j) => j !== i))}>
                Remove tier
              </button>
            }
          >
            <FormGrid>
              <Field label="Name">
                <TextInput value={t.name} onChange={(name) => setTier(i, { name })} />
              </Field>
              <Field label="Recommended level">
                <NumberInput value={t.recommendedLevel} onChange={(recommendedLevel) => setTier(i, { recommendedLevel })} min={1} />
              </Field>
              <Field label="Gold per win 🪙">
                <NumberInput value={t.gold} onChange={(gold) => setTier(i, { gold })} min={0} />
              </Field>
            </FormGrid>
            <h4 className="sub-head">Enemies</h4>
            <EnemyRows value={t.enemies} onChange={(enemies) => setTier(i, { enemies })} />
            <h4 className="sub-head">Material drops</h4>
            <MaterialDropRows value={t.materialDrops} onChange={(materialDrops) => setTier(i, { materialDrops })} />
          </Section>
          <WavesEditor waves={t.waves} onChange={(waves) => setTier(i, { waves })} fallback={t.enemies[0] ?? { id: '', level: 1 }} />
        </div>
      ))}
      <button
        className="btn"
        disabled={value.tiers.length >= 6}
        onClick={() => {
          const last = value.tiers[value.tiers.length - 1]!;
          set('tiers', [...value.tiers, { ...structuredClone(last), name: `Tier ${value.tiers.length + 1}`, recommendedLevel: last.recommendedLevel + 10 }]);
        }}
      >
        + Add tier
      </button>
      <p className="small muted">Each tier needs the one before it cleared. Winning runs per day are set in Settings.</p>
    </>
  );
}
