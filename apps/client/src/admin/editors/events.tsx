import { SCENE_THEMES, type EventDef, type EventShopItem, type EventStage } from '@gacha/shared';
import { useContent } from '../../state/content';
import { EntityEditor, type FormProps } from '../EntityEditor';
import { EnemyRows, WavesEditor } from '../Lineup';
import { RewardEditor } from '../RewardEditor';
import { Field, FormGrid, NumberInput, options, Section, Select, TextInput, type Option } from '../fields';

export function EventsEditor() {
  const content = useContent();
  const enemy = content.bundle.enemies[0]?.id ?? '';
  const today = new Date().toISOString().slice(0, 10);
  return (
    <EntityEditor<EventDef>
      kind="events"
      title="Events"
      singular="event"
      items={content.bundle.events}
      search={(e) => `${e.id} ${e.name}`}
      label={(e) => (
        <>
          <span className="ed-emoji">{e.emoji}</span>
          <span>{e.name}</span>
          <small className="muted">
            {e.start} → {e.end}
          </small>
        </>
      )}
      blank={() => ({
        id: '',
        name: 'New Event',
        emoji: '🎉',
        description: '',
        theme: 'meadow',
        start: today,
        end: today,
        currency: { name: 'Event Token', emoji: '🎟️', icon: null },
        stages: [
          {
            name: 'Stage 1',
            recommendedLevel: 10,
            enemies: [{ id: enemy, level: 8 }],
            waves: [],
            currencyMin: 5,
            currencyMax: 10,
            gold: 500,
            firstClearGems: 100,
          },
        ],
        shop: [],
      })}
      Form={EventForm}
    />
  );
}

function EventForm({ value, onChange, isNew }: FormProps<EventDef>) {
  const content = useContent();
  const set = <K extends keyof EventDef>(k: K, v: EventDef[K]) => onChange({ ...value, [k]: v });
  const setStage = (i: number, patch: Partial<EventStage>) =>
    set(
      'stages',
      value.stages.map((s, j) => (j === i ? { ...s, ...patch } : s)),
    );
  const setItem = (i: number, patch: Partial<EventShopItem>) =>
    set(
      'shop',
      value.shop.map((s, j) => (j === i ? { ...s, ...patch } : s)),
    );
  const heroOptions: Option<string | null>[] = [
    { value: null, label: '— no hero —' },
    ...content.bundle.characters.map((c) => ({ value: c.id, label: `${c.emoji} ${c.name} ${'★'.repeat(c.rarity)}${c.limited ? ' (limited)' : ''}` })),
  ];

  return (
    <>
      <Section title="Event">
        <FormGrid>
          <Field label="ID" hint="Can't be changed after creation.">
            <TextInput value={value.id} onChange={(v) => set('id', v)} disabled={!isNew} placeholder="e.g. winter-fest" />
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
          <Field label="Starts (UTC)" hint="YYYY-MM-DD, inclusive.">
            <TextInput value={value.start} onChange={(v) => set('start', v)} />
          </Field>
          <Field label="Ends (UTC)" hint="YYYY-MM-DD, inclusive.">
            <TextInput value={value.end} onChange={(v) => set('end', v)} />
          </Field>
          <Field label="Description" wide>
            <TextInput value={value.description} onChange={(v) => set('description', v)} />
          </Field>
          <Field label="Currency name">
            <TextInput value={value.currency.name} onChange={(name) => set('currency', { ...value.currency, name })} />
          </Field>
          <Field label="Currency emoji">
            <TextInput value={value.currency.emoji} onChange={(emoji) => set('currency', { ...value.currency, emoji })} />
          </Field>
        </FormGrid>
      </Section>

      {value.stages.map((s, i) => (
        <div key={i} className="tier-edit">
          <Section
            title={`Stage ${i + 1}: ${s.name}`}
            actions={
              <button
                className="btn small danger"
                disabled={value.stages.length <= 1}
                onClick={() =>
                  set(
                    'stages',
                    value.stages.filter((_, j) => j !== i),
                  )
                }
              >
                Remove stage
              </button>
            }
          >
            <FormGrid>
              <Field label="Name">
                <TextInput value={s.name} onChange={(name) => setStage(i, { name })} />
              </Field>
              <Field label="Recommended level">
                <NumberInput value={s.recommendedLevel} onChange={(recommendedLevel) => setStage(i, { recommendedLevel })} min={1} />
              </Field>
              <Field label={`${value.currency.emoji} per win (min)`}>
                <NumberInput value={s.currencyMin} onChange={(currencyMin) => setStage(i, { currencyMin })} min={0} />
              </Field>
              <Field label={`${value.currency.emoji} per win (max)`}>
                <NumberInput value={s.currencyMax} onChange={(currencyMax) => setStage(i, { currencyMax })} min={0} />
              </Field>
              <Field label="Gold per win 🪙">
                <NumberInput value={s.gold} onChange={(gold) => setStage(i, { gold })} min={0} />
              </Field>
              <Field label="First-clear gems 💎">
                <NumberInput value={s.firstClearGems} onChange={(firstClearGems) => setStage(i, { firstClearGems })} min={0} />
              </Field>
            </FormGrid>
            <h4 className="sub-head">Enemies</h4>
            <EnemyRows value={s.enemies} onChange={(enemies) => setStage(i, { enemies })} />
          </Section>
          <WavesEditor waves={s.waves} onChange={(waves) => setStage(i, { waves })} fallback={s.enemies[0] ?? { id: '', level: 1 }} />
        </div>
      ))}
      <button
        className="btn"
        disabled={value.stages.length >= 10}
        onClick={() => {
          const last = value.stages[value.stages.length - 1]!;
          set('stages', [
            ...value.stages,
            { ...structuredClone(last), name: `Stage ${value.stages.length + 1}`, recommendedLevel: last.recommendedLevel + 10 },
          ]);
        }}
      >
        + Add stage
      </button>

      <Section
        title="Exchange shop"
        actions={
          <button
            className="btn small"
            disabled={value.shop.length >= 20}
            onClick={() =>
              set('shop', [
                ...value.shop,
                { id: `item-${value.shop.length + 1}`, reward: { gems: 100, gold: 0, stardust: 0, materials: [] }, character: null, cost: 50, limit: 5 },
              ])
            }
          >
            + Add item
          </button>
        }
      >
        {value.shop.map((item, i) => (
          <div key={i} className="chest-edit">
            <div className="effect-row">
              <label className="inline">
                id
                <TextInput value={item.id} onChange={(id) => setItem(i, { id })} />
              </label>
              <label className="inline">
                cost {value.currency.emoji}
                <NumberInput value={item.cost} onChange={(cost) => setItem(i, { cost })} min={1} />
              </label>
              <label className="inline">
                limit
                <NumberInput value={item.limit} onChange={(limit) => setItem(i, { limit })} min={1} />
              </label>
              <Select<string | null> value={item.character} onChange={(character) => setItem(i, { character })} options={heroOptions} />
              <span className="effect-tools">
                <button
                  className="icon-mini danger"
                  onClick={() =>
                    set(
                      'shop',
                      value.shop.filter((_, j) => j !== i),
                    )
                  }
                  title="Remove"
                >
                  ✕
                </button>
              </span>
            </div>
            <RewardEditor value={item.reward} onChange={(reward) => setItem(i, { reward })} />
          </div>
        ))}
        <p className="small muted">Mark an event hero as "Limited" (Units tab) so it only comes from this shop, not the standard gacha pool.</p>
      </Section>
    </>
  );
}
