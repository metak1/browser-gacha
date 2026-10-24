import type { BannerDef } from '@gacha/shared';
import { useContent } from '../../state/content';
import { EntityEditor, type FormProps } from '../EntityEditor';
import { Check, Field, FormGrid, MultiPick, Section, Select, TextInput, type Option } from '../fields';

export function BannersEditor() {
  const content = useContent();
  return (
    <EntityEditor<BannerDef>
      kind="banners"
      title="Banners"
      singular="banner"
      items={content.bundle.banners}
      search={(b) => `${b.id} ${b.name}`}
      label={(b) => (
        <>
          <span className="ed-emoji">{(b.featured5 && content.charactersById[b.featured5]?.emoji) || '🌠'}</span>
          <span>{b.name}</span>
          <small className={b.active ? 'tag ok' : 'tag'}>{b.active ? 'Live' : 'Off'}</small>
        </>
      )}
      blank={() => ({
        id: '',
        name: 'New Banner',
        description: '',
        limited: true,
        active: false,
        featured5: null,
        featured4: [],
      })}
      Form={BannerForm}
    />
  );
}

function BannerForm({ value, onChange, isNew }: FormProps<BannerDef>) {
  const content = useContent();
  const set = <K extends keyof BannerDef>(k: K, v: BannerDef[K]) => onChange({ ...value, [k]: v });
  const byRarity = (r: number) => content.bundle.characters.filter((c) => c.rarity === r);
  const fiveOptions: Option<string | null>[] = [
    { value: null, label: '— none (standard rates) —' },
    ...byRarity(5).map((c) => ({ value: c.id, label: `${c.emoji} ${c.name}${c.limited ? ' (limited)' : ''}` })),
  ];
  return (
    <>
      <Section title="Banner">
        <FormGrid>
          <Field label="ID" hint="Can't be changed after creation.">
            <TextInput value={value.id} onChange={(v) => set('id', v)} disabled={!isNew} placeholder="e.g. summer-festival" />
          </Field>
          <Field label="Name">
            <TextInput value={value.name} onChange={(v) => set('name', v)} />
          </Field>
          <Field label="Status">
            <Check checked={value.active} onChange={(v) => set('active', v)} label="Live (players can summon)" />
          </Field>
          <Field label="Label">
            <Check checked={value.limited} onChange={(v) => set('limited', v)} label="Show as “Limited Event”" />
          </Field>
          <Field label="Description" wide>
            <TextInput value={value.description} onChange={(v) => set('description', v)} multiline />
          </Field>
        </FormGrid>
      </Section>
      <Section title="Rate-up">
        <p className="small muted">
          Each ★5 / ★4 has a 50% chance to be a featured unit; losing the 50/50 guarantees one next time. Limited units can only be obtained as a featured pick.
        </p>
        <FormGrid>
          <Field label="Featured ★5">
            <Select value={value.featured5} onChange={(v) => set('featured5', v)} options={fiveOptions} />
          </Field>
        </FormGrid>
        <Field label={`Featured ★4 (${value.featured4.length})`} wide>
          <MultiPick
            values={value.featured4}
            onChange={(v) => set('featured4', v)}
            max={6}
            options={byRarity(4).map((c) => ({ value: c.id, label: `${c.emoji} ${c.name}` }))}
          />
        </Field>
      </Section>
    </>
  );
}
