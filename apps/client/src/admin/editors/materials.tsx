import { ELEMENT_IDS, ELEMENTS, type ElementId, type MaterialDef, type Rarity } from '@gacha/shared';
import { IconOr } from '../../components/Art';
import { useContent } from '../../state/content';
import { IconField } from '../artPickers';
import { EntityEditor, type FormProps } from '../EntityEditor';
import { Field, FormGrid, Section, Select, TextInput, type Option } from '../fields';

const rarityOptions: Option<Rarity>[] = [3, 4, 5].map((r) => ({ value: r as Rarity, label: '★'.repeat(r) }));
const elementOptions: Option<ElementId | null>[] = [
  { value: null, label: '— none —' },
  ...ELEMENT_IDS.map((e) => ({ value: e, label: `${ELEMENTS[e].icon} ${ELEMENTS[e].label}` })),
];

export function MaterialsEditor() {
  const content = useContent();
  return (
    <EntityEditor<MaterialDef>
      kind="materials"
      title="Materials"
      singular="material"
      items={content.bundle.materials}
      search={(m) => `${m.id} ${m.name}`}
      label={(m) => (
        <>
          <span className="ed-emoji">
            <IconOr icon={m.icon} emoji={m.emoji} size={16} />
          </span>
          <span>{m.name}</span>
          <small className={`r${m.rarity}-text`}>{'★'.repeat(m.rarity)}</small>
        </>
      )}
      blank={() => ({ id: '', name: 'New Material', emoji: '💎', icon: null, rarity: 3, element: null, description: '' })}
      Form={MaterialForm}
    />
  );
}

function MaterialForm({ value, onChange, isNew }: FormProps<MaterialDef>) {
  const content = useContent();
  const set = <K extends keyof MaterialDef>(k: K, v: MaterialDef[K]) => onChange({ ...value, [k]: v });
  const prog = content.settings.progression;
  const uses = [
    value.element && 'ascension essence for ' + value.element + ' heroes',
    prog.crystal === value.id && 'ascension crystal',
    prog.tome === value.id && 'skill tome',
    prog.shop.some((s) => s.material === value.id) && 'sold in the shop',
  ].filter(Boolean);
  const droppedBy = content.stages.filter((s) => s.materialDrops.some((d) => d.material === value.id)).map((s) => s.id);
  return (
    <Section title="Material">
      <FormGrid>
        <Field label="ID" hint="Can't be changed after creation.">
          <TextInput value={value.id} onChange={(v) => set('id', v)} disabled={!isNew} placeholder="e.g. dragon-scale" />
        </Field>
        <Field label="Name">
          <TextInput value={value.name} onChange={(v) => set('name', v)} />
        </Field>
        <Field label="Emoji (fallback)">
          <TextInput value={value.emoji} onChange={(v) => set('emoji', v)} />
        </Field>
        <IconField label="Icon" value={value.icon} onChange={(v) => set('icon', v)} />
        <Field label="Rarity">
          <Select value={value.rarity} onChange={(v) => set('rarity', v)} options={rarityOptions} />
        </Field>
        <Field label="Element" hint="Heroes ascend with the essence of their own element.">
          <Select value={value.element} onChange={(v) => set('element', v)} options={elementOptions} />
        </Field>
        <Field label="Description" wide>
          <TextInput value={value.description} onChange={(v) => set('description', v)} multiline />
        </Field>
      </FormGrid>
      {!isNew && (
        <p className="small muted">
          {uses.length ? `Used as: ${uses.join(', ')}. ` : 'Not used by progression or the shop. '}
          {droppedBy.length ? `Drops from: ${droppedBy.join(', ')}.` : 'Not in any stage drop table.'}
        </p>
      )}
    </Section>
  );
}
