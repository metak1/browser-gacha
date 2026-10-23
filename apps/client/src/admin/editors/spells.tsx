import { describeSkill, skillUsage, TARGETINGS, type EffectTarget, type SkillDef } from '@gacha/shared';
import { Icon } from '../../components/Art';
import { useContent } from '../../state/content';
import { IconField } from '../artPickers';
import { defaultEffect, EffectList } from '../EffectList';
import { EntityEditor, type FormProps } from '../EntityEditor';
import { Field, FormGrid, NumberInput, options, Section, Select, TextInput } from '../fields';

const TARGETING_LABEL = { enemy: 'Pick an enemy', ally: 'Pick an ally', none: 'No target (instant)' } as const;

export function SpellsEditor() {
  const content = useContent();
  return (
    <EntityEditor<SkillDef>
      kind="skills"
      title="Spells"
      singular="spell"
      items={content.bundle.skills}
      search={(s) => `${s.id} ${s.name}`}
      label={(s) => (
        <>
          <span className="ed-emoji">{s.icon ? <Icon id={s.icon} size={16} /> : '·'}</span>
          <span>{s.name}</span>
          <small className="muted">{s.id}</small>
        </>
      )}
      blank={() => ({
        id: '',
        name: 'New Spell',
        targeting: 'enemy',
        cooldown: 3,
        effects: [{ kind: 'damage', to: 'target', mult: 1.8 }],
        icon: null,
      })}
      Form={SpellForm}
    />
  );
}

function SpellForm({ value, onChange, isNew }: FormProps<SkillDef>) {
  const content = useContent();
  const set = <K extends keyof SkillDef>(k: K, v: SkillDef[K]) => onChange({ ...value, [k]: v });
  const usedBy = isNew ? [] : skillUsage(content, value.id);
  const defaultTo: EffectTarget = value.targeting === 'none' ? 'allEnemies' : 'target';

  return (
    <>
      <Section title="Spell">
        <FormGrid>
          <Field label="ID" hint="Units refer to spells by id. Can't be changed after creation.">
            <TextInput value={value.id} onChange={(v) => set('id', v)} disabled={!isNew} placeholder="e.g. fireball" />
          </Field>
          <Field label="Name">
            <TextInput value={value.name} onChange={(v) => set('name', v)} />
          </Field>
          <Field label="Targeting" hint="What the player picks when casting.">
            <Select value={value.targeting} onChange={(v) => set('targeting', v)} options={options(TARGETINGS, (t) => TARGETING_LABEL[t])} />
          </Field>
          <Field label="Cooldown" hint="Own turns before it can be cast again. 0 = every turn (use for basic attacks).">
            <NumberInput value={value.cooldown} onChange={(v) => set('cooldown', v)} min={0} max={10} />
          </Field>
          <IconField label="Icon" value={value.icon ?? null} onChange={(v) => set('icon', v)} hint="Shown on battle buttons and skill lists." />
        </FormGrid>
      </Section>

      <Section
        title="Effects"
        actions={
          <button
            className="btn small"
            disabled={value.effects.length >= 8}
            onClick={() => set('effects', [...value.effects, defaultEffect('damage', defaultTo)])}
          >
            + Add effect
          </button>
        }
      >
        <p className="small muted">Effects resolve in order. Multipliers scale off the caster's ATK.</p>
        <EffectList effects={value.effects} onChange={(effects) => set('effects', effects)} />
        {value.targeting === 'none' && value.effects.some((e) => e.to === 'target') && (
          <p className="warn-text small">⚠ This spell has no target, so “The picked unit” effects won't land on anyone.</p>
        )}
      </Section>

      <Section title="Preview">
        <p className="preview-text">
          {value.icon ? <Icon id={value.icon} size={32} className="skill-icon" /> : null}
          <b>{value.name}</b>
          {value.cooldown > 0 && <span className="muted"> · cooldown {value.cooldown}</span>}
          <br />
          {value.effects.length ? describeSkill(value) : <span className="muted">No effects yet.</span>}
        </p>
        {!isNew && (
          <p className="small muted">{usedBy.length ? `Used by: ${usedBy.join(', ')}` : 'Not used by any unit yet.'}</p>
        )}
      </Section>
    </>
  );
}
