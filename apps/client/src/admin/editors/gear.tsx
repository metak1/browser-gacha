import {
  formatGearRoll,
  GEAR_SLOT_INFO,
  GEAR_SLOTS,
  gearStatLabel,
  isPercentStat,
  mainStatValue,
  MAIN_POOLS,
  mainBaseFor,
  type GearDef,
  type GearStat,
  type Rarity,
} from '@gacha/shared';
import { Icon } from '../../components/Art';
import { useContent } from '../../state/content';
import { IconField } from '../artPickers';
import { EntityEditor, type FormProps } from '../EntityEditor';
import { Field, FormGrid, NumberInput, options, Section, Select, TextInput, type Option } from '../fields';

const rarityOptions: Option<Rarity>[] = [3, 4, 5].map((r) => ({ value: r as Rarity, label: '★'.repeat(r) }));

export function GearEditor() {
  const content = useContent();
  return (
    <EntityEditor<GearDef>
      kind="gear"
      title="Gear"
      singular="gear template"
      items={[...content.bundle.gear].sort((a, b) => a.slot.localeCompare(b.slot) || a.rarity - b.rarity)}
      search={(g) => `${g.id} ${g.name} ${g.slot}`}
      label={(g) => (
        <>
          <span className="ed-emoji">{g.icon ? <Icon id={g.icon} size={16} /> : g.emoji}</span>
          <span>{g.name}</span>
          <small className={`r${g.rarity}-text`}>{'★'.repeat(g.rarity)}</small>
        </>
      )}
      blank={() => ({ id: '', name: 'New Gear', emoji: '💍', slot: 'charm', rarity: 4, mainStat: null, mainBase: 0, icon: null })}
      Form={GearForm}
    />
  );
}

function GearForm({ value, onChange, isNew }: FormProps<GearDef>) {
  const content = useContent();
  const set = <K extends keyof GearDef>(k: K, v: GearDef[K]) => onChange({ ...value, [k]: v });
  const pct = value.mainStat ? isPercentStat(value.mainStat) : false;
  const pool = MAIN_POOLS[value.slot];
  const droppedBy = content.stages.filter((s) => s.drops.some((d) => d.gear === value.id)).map((s) => s.id);
  const max = content.settings.gearMaxLevel;
  return (
    <>
      <Section title="Gear template">
        <p className="small muted">
          Drops roll random bonus stats on top of this. Editing a template only changes future drops; items players already
          own keep their numbers.
        </p>
        <FormGrid>
          <Field label="ID" hint="Can't be changed after creation.">
            <TextInput value={value.id} onChange={(v) => set('id', v)} disabled={!isNew} placeholder="e.g. dragon-fang" />
          </Field>
          <Field label="Name">
            <TextInput value={value.name} onChange={(v) => set('name', v)} />
          </Field>
          <Field label="Emoji (fallback)">
            <TextInput value={value.emoji} onChange={(v) => set('emoji', v)} />
          </Field>
          <IconField label="Icon" value={value.icon} onChange={(v) => set('icon', v)} />
          <Field label="Slot">
            <Select value={value.slot} onChange={(v) => set('slot', v)} options={options(GEAR_SLOTS, (s) => `${GEAR_SLOT_INFO[s].icon} ${GEAR_SLOT_INFO[s].label}`)} />
          </Field>
          <Field label="Rarity" hint="Higher rarity drops with more bonus stats (★3: 1, ★4: 2, ★5: 3).">
            <Select value={value.rarity} onChange={(v) => set('rarity', v)} options={rarityOptions} />
          </Field>
          <Field label="Main stat" hint="Random rolls one of the slot's main stats on every drop. Only boots can have SPD.">
            <Select<string>
              value={value.mainStat ?? ''}
              onChange={(v) => {
                if (!v) return onChange({ ...value, mainStat: null, mainBase: 0 });
                const stat = v as GearStat;
                onChange({ ...value, mainStat: stat, mainBase: +mainBaseFor(stat, value.rarity).toFixed(4) });
              }}
              options={[{ value: '', label: '🎲 Random (slot pool)' }, ...pool.map((st) => ({ value: st, label: gearStatLabel(st) }))]}
            />
          </Field>
          {value.mainStat && (
            <Field label={pct ? 'Main value at +0 (%)' : 'Main value at +0'}>
              <NumberInput
                value={pct ? +(value.mainBase * 100).toFixed(2) : value.mainBase}
                onChange={(v) => set('mainBase', pct ? v / 100 : v)}
                step={pct ? 0.5 : 1}
                min={0}
              />
            </Field>
          )}
        </FormGrid>
      </Section>
      <Section title="Preview">
        {value.mainStat ? (
          <p className="preview-text">
            {value.icon ? <Icon id={value.icon} size={32} className="skill-icon" /> : value.emoji} <b>{value.name}</b> · +0{' '}
            {formatGearRoll({ stat: value.mainStat, value: mainStatValue({ mainStat: value.mainStat, mainBase: value.mainBase }, 0) })} → +{max}{' '}
            {formatGearRoll({ stat: value.mainStat, value: mainStatValue({ mainStat: value.mainStat, mainBase: value.mainBase }, max) })}
          </p>
        ) : (
          <>
            <p className="preview-text">
              {value.icon ? <Icon id={value.icon} size={32} className="skill-icon" /> : value.emoji} <b>{value.name}</b> · rolls one main stat at +0:
            </p>
            <p className="small">
              {pool
                .map((st) => {
                  const main = { mainStat: st, mainBase: mainBaseFor(st, value.rarity) };
                  return `${formatGearRoll({ stat: st, value: mainStatValue(main, 0) })} (→ ${formatGearRoll({ stat: st, value: mainStatValue(main, max) })})`;
                })
                .join(' · ')}
            </p>
          </>
        )}
        {!isNew && <p className="small muted">{droppedBy.length ? `Drops from: ${droppedBy.join(', ')}` : 'Not in any stage drop table yet.'}</p>}
      </Section>
    </>
  );
}
