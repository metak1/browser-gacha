import {
  characterBase,
  describeSkill,
  ELEMENT_IDS,
  ELEMENTS,
  ROLE_IDS,
  scaleStats,
  type CharacterDef,
  type EnemyDef,
  type Rarity,
  type Stats,
} from '@gacha/shared';
import { useState, type CSSProperties } from 'react';
import { UnitArt } from '../../components/Art';
import { ROLE_INFO } from '../../components/CharacterCard';
import { SpriteField } from '../artPickers';
import { useContent } from '../../state/content';
import { EntityEditor, type FormProps } from '../EntityEditor';
import { MechanicsEditor } from '../MechanicsEditor';
import { PassiveEditor } from '../PassiveEditor';
import { Check, Field, FormGrid, NumberInput, options, Section, Select, TextInput, type Option } from '../fields';
import type { LoreEntry } from '@gacha/shared';

type UnitDef = CharacterDef | EnemyDef;

const elementOptions = options(ELEMENT_IDS, (e) => `${ELEMENTS[e].icon} ${ELEMENTS[e].label}`);
const roleOptions = options(ROLE_IDS, (r) => `${ROLE_INFO[r].icon} ${ROLE_INFO[r].label}`);
const rarityOptions: Option<Rarity>[] = [3, 4, 5].map((r) => ({ value: r as Rarity, label: '★'.repeat(r) }));

export function CharactersEditor() {
  const content = useContent();
  const firstSkill = content.bundle.skills[0]?.id ?? '';
  return (
    <EntityEditor<CharacterDef>
      kind="characters"
      title="Units"
      singular="unit"
      items={[...content.bundle.characters].sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name))}
      search={(c) => `${c.id} ${c.name} ${c.element} ${c.role}`}
      label={(c) => (
        <>
          <span className="ed-emoji">{c.sprite ? <UnitArt sprite={c.sprite} emoji={c.emoji} height="22px" /> : c.emoji}</span>
          <span>{c.name}</span>
          <small className={`r${c.rarity}-text`}>{'★'.repeat(c.rarity)}</small>
          {c.limited && <small className="tag">Limited</small>}
        </>
      )}
      blank={() => ({
        id: '',
        name: 'New Hero',
        rarity: 4,
        element: 'flame',
        role: 'striker',
        emoji: '🙂',
        sprite: null,
        limited: false,
        title: '',
        lore: [],
        base: characterBase('striker', 4),
        basic: firstSkill,
        skill: null,
        ultimate: null,
        passive: null,
      })}
      Form={CharacterForm}
    />
  );
}

export function EnemiesEditor() {
  const content = useContent();
  const firstSkill = content.bundle.skills[0]?.id ?? '';
  return (
    <EntityEditor<EnemyDef>
      kind="enemies"
      title="Enemies"
      singular="enemy"
      items={content.bundle.enemies}
      search={(e) => `${e.id} ${e.name} ${e.element}`}
      label={(e) => (
        <>
          <span className="ed-emoji">{e.sprite ? <UnitArt sprite={e.sprite} emoji={e.emoji} height="22px" flip /> : e.emoji}</span>
          <span>{e.name}</span>
          {e.boss && <small className="tag">Boss</small>}
        </>
      )}
      blank={() => ({
        id: '',
        name: 'New Enemy',
        element: 'stone',
        role: 'striker',
        emoji: '👾',
        sprite: null,
        boss: false,
        base: { hp: 900, atk: 120, def: 40, spd: 100 },
        basic: firstSkill,
        skill: null,
        ultimate: null,
        passive: null,
      })}
      Form={EnemyForm}
    />
  );
}

function CharacterForm(props: FormProps<CharacterDef>) {
  const { value, onChange } = props;
  const set = <K extends keyof CharacterDef>(k: K, v: CharacterDef[K]) => onChange({ ...value, [k]: v });
  return (
    <>
    <UnitForm
      {...props}
      kind="character"
      extraFields={
        <>
          <Field label="Rarity">
            <Select value={value.rarity} onChange={(v) => set('rarity', v)} options={rarityOptions} />
          </Field>
          <Field label="Banner pool" hint="Limited units only drop as a banner's featured ★5/★4.">
            <Check checked={value.limited} onChange={(v) => set('limited', v)} label="Limited" />
          </Field>
        </>
      }
      roleDefaults={() => characterBase(value.role, value.rarity)}
    />
    <LoreEditor title={value.title} lore={value.lore} onTitle={(t) => set('title', t)} onLore={(l) => set('lore', l)} />
    </>
  );
}

/** Hero epithet and story entries; entries unlock as the hero is ascended. */
function LoreEditor({ title, lore, onTitle, onLore }: { title: string; lore: LoreEntry[]; onTitle: (t: string) => void; onLore: (l: LoreEntry[]) => void }) {
  const setEntry = (i: number, patch: Partial<LoreEntry>) => onLore(lore.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  return (
    <Section
      title="Story"
      actions={
        <button
          className="btn small"
          disabled={lore.length >= 12}
          onClick={() => onLore([...lore, { title: 'New chapter', text: '', unlockRank: lore.length ? Math.min(20, lore[lore.length - 1]!.unlockRank + 1) : 0 }])}
        >
          + Add entry
        </button>
      }
    >
      <FormGrid>
        <Field label="Title / epithet" hint="Shown under the name, e.g. “The Ember King”.">
          <TextInput value={title} onChange={onTitle} />
        </Field>
      </FormGrid>
      {lore.map((e, i) => (
        <div key={i} className="lore-edit">
          <div className="lore-edit-head">
            <input value={e.title} onChange={(ev) => setEntry(i, { title: ev.target.value })} placeholder="Chapter title" />
            <label className="inline">
              unlocks at ascension
              <NumberInput value={e.unlockRank} onChange={(v) => setEntry(i, { unlockRank: Math.max(0, v) })} min={0} max={20} />
            </label>
            <button className="icon-mini danger" onClick={() => onLore(lore.filter((_, j) => j !== i))} title="Remove">
              ✕
            </button>
          </div>
          <textarea value={e.text} onChange={(ev) => setEntry(i, { text: ev.target.value })} rows={4} placeholder="Story text…" />
        </div>
      ))}
      {!lore.length && <p className="small muted">No story yet. Players see entries in the hero’s Story tab.</p>}
    </Section>
  );
}

function EnemyForm(props: FormProps<EnemyDef>) {
  const { value, onChange } = props;
  return (
    <>
      <UnitForm
        {...props}
        kind="enemy"
        extraFields={
          <Field label="Boss" hint="Bosses are drawn larger and stand further back.">
            <Check checked={value.boss} onChange={(v) => onChange({ ...value, boss: v })} label="Boss" />
          </Field>
        }
      />
      <MechanicsEditor value={value.mechanics} onChange={(mechanics) => onChange({ ...value, mechanics })} />
    </>
  );
}

interface UnitFormProps<T extends UnitDef> extends FormProps<T> {
  kind: 'character' | 'enemy';
  extraFields: React.ReactNode;
  roleDefaults?: () => Stats;
}

function UnitForm<T extends UnitDef>({ value, onChange, isNew, kind, extraFields, roleDefaults }: UnitFormProps<T>) {
  const content = useContent();
  const [previewLevel, setPreviewLevel] = useState(1);
  const set = <K extends keyof UnitDef>(k: K, v: UnitDef[K]) => onChange({ ...value, [k]: v } as T);
  const setStat = (k: keyof Stats, v: number) => set('base', { ...value.base, [k]: v });

  const skillOptions: Option<string>[] = content.bundle.skills.map((s) => ({ value: s.id, label: `${s.name} (${s.id})` }));
  const basic = content.skillsById[value.basic];
  const skill = value.skill ? content.skillsById[value.skill] : null;
  const ultimate = value.ultimate ? content.skillsById[value.ultimate] : null;
  const scaled = scaleStats(value.base, previewLevel);
  const el = ELEMENTS[value.element];

  return (
    <>
      <Section title={kind === 'character' ? 'Unit' : 'Enemy'}>
        <div className="unit-form">
          <div className="unit-preview" style={{ '--el': el.color } as CSSProperties}>
            <span className="unit-preview-emoji">
              <UnitArt sprite={value.sprite} emoji={value.emoji || '❔'} height="64px" flip={kind === 'enemy'} />
            </span>
            <span className="small">
              {el.icon} {el.label} · {ROLE_INFO[value.role].label}
            </span>
          </div>
          <FormGrid>
            <Field label="ID" hint="Can't be changed after creation.">
              <TextInput value={value.id} onChange={(v) => set('id', v)} disabled={!isNew} placeholder="e.g. ember-knight" />
            </Field>
            <Field label="Name">
              <TextInput value={value.name} onChange={(v) => set('name', v)} />
            </Field>
            <Field label="Emoji / icon" hint="Any emoji works as the unit's art.">
              <TextInput value={value.emoji} onChange={(v) => set('emoji', v)} />
            </Field>
            <Field label="Element">
              <Select value={value.element} onChange={(v) => set('element', v)} options={elementOptions} />
            </Field>
            <Field label="Role" hint="Affects how the AI uses the unit and the suggested stats.">
              <Select value={value.role} onChange={(v) => set('role', v)} options={roleOptions} />
            </Field>
            {extraFields}
            <SpriteField value={value.sprite} onChange={(v) => set('sprite', v)} emoji={value.emoji} />
          </FormGrid>
        </div>
      </Section>

      <Section
        title="Base stats (level 1)"
        actions={
          roleDefaults && (
            <button className="btn small" onClick={() => set('base', roleDefaults())} title="Standard stats for this role and rarity">
              Use role defaults
            </button>
          )
        }
      >
        <FormGrid>
          {(['hp', 'atk', 'def', 'spd'] as const).map((k) => (
            <Field key={k} label={k.toUpperCase()} hint={k === 'spd' ? 'Doesn’t grow with level.' : undefined}>
              <NumberInput value={value.base[k]} onChange={(v) => setStat(k, v)} min={k === 'hp' || k === 'spd' ? 1 : 0} />
            </Field>
          ))}
        </FormGrid>
        <div className="stat-preview">
          <label className="inline">
            Preview at level
            <NumberInput value={previewLevel} onChange={(v) => setPreviewLevel(Math.max(1, Math.min(999, v)))} min={1} />
          </label>
          <span>
            HP <b>{scaled.hp}</b> · ATK <b>{scaled.atk}</b> · DEF <b>{scaled.def}</b> · SPD <b>{scaled.spd}</b>
          </span>
        </div>
      </Section>

      <Section title="Spells">
        <FormGrid>
          <Field label="Basic attack" hint={basic ? describeSkill(basic) : 'Pick a spell'}>
            <Select value={value.basic} onChange={(v) => set('basic', v)} options={skillOptions} />
          </Field>
          <Field label="Skill" hint={skill ? `${describeSkill(skill)} Cooldown ${skill.cooldown}.` : 'Optional.'}>
            <Select<string | null>
              value={value.skill}
              onChange={(v) => set('skill', v)}
              options={[{ value: null, label: '— none —' }, ...skillOptions]}
            />
          </Field>
          <Field label="Ultimate" hint={ultimate ? `${describeSkill(ultimate)} Fires when energy is full.` : 'Optional. Energy fills by acting and taking hits.'}>
            <Select<string | null>
              value={value.ultimate}
              onChange={(v) => set('ultimate', v)}
              options={[{ value: null, label: '— none —' }, ...skillOptions]}
            />
          </Field>
        </FormGrid>
        <p className="small muted">Create or edit spells in the Spells tab.</p>
      </Section>
      <PassiveEditor passive={value.passive} onChange={(p) => set('passive', p)} />
    </>
  );
}
