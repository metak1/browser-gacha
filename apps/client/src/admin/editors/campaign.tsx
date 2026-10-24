import {
  defaultStarRewards,
  describeObjective,
  REFERENCE_TEAM,
  SCENE_THEMES,
  STAGE_OBJECTIVE_KINDS,
  type ChapterDef,
  type SimulateResponse,
  type StageDef,
  type StageObjective,
  type StageObjectiveKind,
} from '@gacha/shared';
import { useState } from 'react';
import { api, errorMessage } from '../../api';
import { Scene } from '../../components/Scene';
import { useContent } from '../../state/content';
import { EntityEditor, type FormProps } from '../EntityEditor';
import { RewardEditor } from '../RewardEditor';
import { WavesEditor } from '../Lineup';
import { Field, FormGrid, MultiPick, NumberInput, options, Section, Select, TextInput, type Option } from '../fields';

export function ChaptersEditor() {
  const content = useContent();
  return (
    <EntityEditor<ChapterDef>
      kind="chapters"
      title="Chapters"
      singular="chapter"
      items={content.chapters}
      search={(c) => `${c.id} ${c.name} ${c.theme}`}
      label={(c) => (
        <>
          <b>{c.id}</b>
          <span>{c.name}</span>
          <small className="muted">{content.stages.filter((s) => s.chapter === c.id).length} stages</small>
        </>
      )}
      blank={() => ({ id: Math.max(0, ...content.chapters.map((c) => c.id)) + 1, name: 'New Chapter', theme: 'meadow', starRewards: [] })}
      Form={ChapterForm}
    />
  );
}

function ChapterForm({ value, onChange, isNew }: FormProps<ChapterDef>) {
  const content = useContent();
  const set = <K extends keyof ChapterDef>(k: K, v: ChapterDef[K]) => onChange({ ...value, [k]: v });
  const maxStars = content.stages.filter((s) => s.chapter === value.id).reduce((n, s) => n + Math.max(1, s.objectives.length), 0);
  const setChest = (i: number, patch: Partial<ChapterDef['starRewards'][number]>) =>
    set(
      'starRewards',
      value.starRewards.map((c, j) => (j === i ? { ...c, ...patch } : c)),
    );
  return (
    <>
      <Section title="Chapter">
        <FormGrid>
          <Field label="Number" hint="Chapters play in number order. Can't be changed after creation.">
            <NumberInput value={value.id} onChange={(v) => set('id', v)} min={1} disabled={!isNew} />
          </Field>
          <Field label="Name">
            <TextInput value={value.name} onChange={(v) => set('name', v)} />
          </Field>
          <Field label="Scenery">
            <Select value={value.theme} onChange={(v) => set('theme', v)} options={options(SCENE_THEMES)} />
          </Field>
        </FormGrid>
        <div className="scene-preview">
          <Scene theme={value.theme} />
        </div>
      </Section>
      <Section
        title="Star chests"
        actions={
          <>
            {!value.starRewards.length && (
              <button
                className="btn small"
                onClick={() =>
                  set(
                    'starRewards',
                    defaultStarRewards(value.id).filter((c) => c.stars <= maxStars),
                  )
                }
              >
                Use defaults
              </button>
            )}
            <button
              className="btn small"
              disabled={value.starRewards.length >= 6}
              onClick={() =>
                set('starRewards', [
                  ...value.starRewards,
                  {
                    stars: Math.min(maxStars || 1, (value.starRewards[value.starRewards.length - 1]?.stars ?? 0) + 3),
                    reward: { gems: 100, gold: 0, stardust: 0, materials: [] },
                  },
                ])
              }
            >
              + Add chest
            </button>
          </>
        }
      >
        <p className="small muted">
          Players open a chest once their best stars across this chapter's stages reach its threshold. This chapter has {maxStars} stars available.
        </p>
        {value.starRewards.map((c, i) => (
          <div key={i} className="chest-edit">
            <div className="effect-row">
              <label className="inline">
                Needs ★
                <NumberInput value={c.stars} onChange={(stars) => setChest(i, { stars })} min={1} max={999} />
              </label>
              {c.stars > maxStars && <span className="warn-text small">More than the {maxStars} available</span>}
              <span className="effect-tools">
                <button
                  className="icon-mini danger"
                  onClick={() =>
                    set(
                      'starRewards',
                      value.starRewards.filter((_, j) => j !== i),
                    )
                  }
                  title="Remove"
                >
                  ✕
                </button>
              </span>
            </div>
            <RewardEditor value={c.reward} onChange={(reward) => setChest(i, { reward })} />
          </div>
        ))}
      </Section>
    </>
  );
}

const OBJECTIVE_LABEL: Record<StageObjectiveKind, string> = { win: 'Win', noDeaths: 'No hero defeated', maxActions: 'Action limit' };
const defaultObjective = (kind: StageObjectiveKind): StageObjective => (kind === 'maxActions' ? { kind, value: 30 } : { kind });

/** Up to three star conditions; each one met is a star. */
function ObjectivesEditor({ value, onChange }: { value: StageObjective[]; onChange: (o: StageObjective[]) => void }) {
  const unused = STAGE_OBJECTIVE_KINDS.filter((k) => !value.some((o) => o.kind === k));
  return (
    <Section
      title="Star objectives"
      actions={
        <button className="btn small" disabled={!unused.length} onClick={() => onChange([...value, defaultObjective(unused[0]!)])}>
          + Add objective
        </button>
      }
    >
      <p className="small muted">Each objective met on a victory earns a star (any win earns at least one). Actions count only your team's moves.</p>
      {value.map((o, i) => (
        <div key={i} className="effect-row">
          <span className="effect-n">★</span>
          <Select
            value={o.kind}
            onChange={(k) => onChange(value.map((x, j) => (j === i ? defaultObjective(k) : x)))}
            options={STAGE_OBJECTIVE_KINDS.filter((k) => k === o.kind || unused.includes(k)).map((k) => ({ value: k, label: OBJECTIVE_LABEL[k] }))}
          />
          {o.kind === 'maxActions' && (
            <label className="inline">
              at most
              <NumberInput
                value={o.value}
                onChange={(v) => onChange(value.map((x, j) => (j === i ? { kind: 'maxActions', value: v } : x)))}
                min={1}
                max={999}
              />
              actions
            </label>
          )}
          <span className="muted small">{describeObjective(o)}</span>
          <span className="effect-tools">
            <button className="icon-mini danger" onClick={() => onChange(value.filter((_, j) => j !== i))} title="Remove">
              ✕
            </button>
          </span>
        </div>
      ))}
    </Section>
  );
}

export function StagesEditor() {
  const content = useContent();
  return (
    <EntityEditor<StageDef>
      kind="stages"
      title="Stages"
      singular="stage"
      items={content.stages}
      search={(s) => `${s.id} ${s.name}`}
      label={(s) => (
        <>
          <b>{s.id}</b>
          <span>{s.name}</span>
          <small>{s.enemies.map((e) => content.enemiesById[e.id]?.emoji ?? '❔').join('')}</small>
        </>
      )}
      blank={() => {
        const chapter = content.chapters[content.chapters.length - 1]?.id ?? 1;
        const index = Math.max(0, ...content.stages.filter((s) => s.chapter === chapter).map((s) => s.index)) + 1;
        const enemy = content.bundle.enemies[0]?.id ?? '';
        return {
          id: `${chapter}-${index}`,
          chapter,
          index,
          name: 'New Stage',
          enemies: [{ id: enemy, level: 1 }],
          recommendedLevel: 3,
          statMult: 1,
          firstClearGems: 200,
          gold: 100,
          drops: [],
          materialDrops: [],
          objectives: [{ kind: 'win' }, { kind: 'noDeaths' }, { kind: 'maxActions', value: 30 }],
          waves: [],
        };
      }}
      Form={StageForm}
      extra={Simulator}
    />
  );
}

function StageForm({ value, onChange, isNew }: FormProps<StageDef>) {
  const content = useContent();
  const set = <K extends keyof StageDef>(k: K, v: StageDef[K]) => onChange({ ...value, [k]: v });
  const chapterOptions: Option<number>[] = content.chapters.map((c) => ({ value: c.id, label: `${c.id}. ${c.name}` }));
  const enemyOptions: Option<string>[] = content.bundle.enemies.map((e) => ({
    value: e.id,
    label: `${e.emoji} ${e.name}${e.boss ? ' (boss)' : ''}`,
  }));
  const setEnemy = (i: number, patch: Partial<StageDef['enemies'][number]>) =>
    set(
      'enemies',
      value.enemies.map((e, j) => (j === i ? { ...e, ...patch } : e)),
    );
  const gearOptions: Option<string>[] = content.bundle.gear.map((g) => ({
    value: g.id,
    label: `${g.emoji} ${g.name} ${'★'.repeat(g.rarity)}`,
  }));
  const materialOptions: Option<string>[] = content.bundle.materials.map((m) => ({ value: m.id, label: `${m.emoji} ${m.name}` }));
  const setMatDrop = (i: number, patch: Partial<StageDef['materialDrops'][number]>) =>
    set(
      'materialDrops',
      value.materialDrops.map((d, j) => (j === i ? { ...d, ...patch } : d)),
    );
  const setDrop = (i: number, patch: Partial<StageDef['drops'][number]>) =>
    set(
      'drops',
      value.drops.map((d, j) => (j === i ? { ...d, ...patch } : d)),
    );

  return (
    <>
      <Section title="Stage">
        <FormGrid>
          <Field label="ID" hint="Shown to players, e.g. 2-3. Can't be changed after creation.">
            <TextInput value={value.id} onChange={(v) => set('id', v)} disabled={!isNew} />
          </Field>
          <Field label="Name">
            <TextInput value={value.name} onChange={(v) => set('name', v)} />
          </Field>
          <Field label="Chapter">
            <Select value={value.chapter} onChange={(v) => set('chapter', v)} options={chapterOptions} />
          </Field>
          <Field label="Order in chapter" hint="Stages unlock in this order; each needs the previous cleared.">
            <NumberInput value={value.index} onChange={(v) => set('index', v)} min={0} />
          </Field>
        </FormGrid>
      </Section>

      <Section
        title="Enemies"
        actions={
          <button
            className="btn small"
            disabled={value.enemies.length >= 5}
            onClick={() =>
              set('enemies', [...value.enemies, { ...(value.enemies[value.enemies.length - 1] ?? { id: enemyOptions[0]?.value ?? '', level: 1 }) }])
            }
          >
            + Add enemy
          </button>
        }
      >
        {value.enemies.map((e, i) => (
          <div key={i} className="effect-row">
            <span className="effect-n">{i + 1}</span>
            <Select value={e.id} onChange={(id) => setEnemy(i, { id })} options={enemyOptions} />
            <label className="inline">
              level
              <NumberInput value={e.level} onChange={(level) => setEnemy(i, { level })} min={1} />
            </label>
            <span className="effect-tools">
              <button
                className="icon-mini danger"
                disabled={value.enemies.length <= 1}
                onClick={() =>
                  set(
                    'enemies',
                    value.enemies.filter((_, j) => j !== i),
                  )
                }
                title="Remove"
              >
                ✕
              </button>
            </span>
          </div>
        ))}
        <p className="small muted">Up to 5 enemies. With 3, the middle slot is the back row (good for bosses).</p>
      </Section>
      <WavesEditor waves={value.waves} onChange={(w) => set('waves', w)} fallback={value.enemies[0] ?? { id: '', level: 1 }} />

      <Section
        title="Gear drops"
        actions={
          <button
            className="btn small"
            disabled={value.drops.length >= 8 || !gearOptions.length}
            onClick={() => set('drops', [...value.drops, { gear: gearOptions[0]!.value, chance: 0.25 }])}
          >
            + Add drop
          </button>
        }
      >
        {value.drops.map((d, i) => (
          <div key={i} className="effect-row">
            <span className="effect-n">{i + 1}</span>
            <Select value={d.gear} onChange={(gear) => setDrop(i, { gear })} options={gearOptions} />
            <label className="inline">
              chance %
              <NumberInput value={Math.round(d.chance * 100)} onChange={(p) => setDrop(i, { chance: Math.max(0, Math.min(100, p)) / 100 })} min={0} max={100} />
            </label>
            <span className="effect-tools">
              <button
                className="icon-mini danger"
                onClick={() =>
                  set(
                    'drops',
                    value.drops.filter((_, j) => j !== i),
                  )
                }
                title="Remove"
              >
                ✕
              </button>
            </span>
          </div>
        ))}
        <p className="small muted">{value.drops.length ? 'Each entry rolls separately on every victory.' : 'No drops. Add gear templates in the Gear tab.'}</p>
      </Section>

      <Section
        title="Material drops"
        actions={
          <button
            className="btn small"
            disabled={value.materialDrops.length >= 8 || !materialOptions.length}
            onClick={() => set('materialDrops', [...value.materialDrops, { material: materialOptions[0]!.value, min: 1, max: 2, chance: 0.5 }])}
          >
            + Add material
          </button>
        }
      >
        {value.materialDrops.map((d, i) => (
          <div key={i} className="effect-row">
            <span className="effect-n">{i + 1}</span>
            <Select value={d.material} onChange={(material) => setMatDrop(i, { material })} options={materialOptions} />
            <label className="inline">
              min
              <NumberInput value={d.min} onChange={(min) => setMatDrop(i, { min: Math.max(1, min) })} min={1} />
            </label>
            <label className="inline">
              max
              <NumberInput value={d.max} onChange={(max) => setMatDrop(i, { max: Math.max(1, max) })} min={1} />
            </label>
            <label className="inline">
              chance %
              <NumberInput
                value={Math.round(d.chance * 100)}
                onChange={(p) => setMatDrop(i, { chance: Math.max(0, Math.min(100, p)) / 100 })}
                min={0}
                max={100}
              />
            </label>
            <span className="effect-tools">
              <button
                className="icon-mini danger"
                onClick={() =>
                  set(
                    'materialDrops',
                    value.materialDrops.filter((_, j) => j !== i),
                  )
                }
                title="Remove"
              >
                ✕
              </button>
            </span>
          </div>
        ))}
        <p className="small muted">Ascension essences, crystals and tomes. Each entry rolls separately on every victory.</p>
      </Section>

      <Section title="Rewards & difficulty">
        <FormGrid>
          <Field label="Recommended level" hint="Shown to players. Players below it get a warning before the fight.">
            <NumberInput value={value.recommendedLevel} onChange={(v) => set('recommendedLevel', v)} min={1} />
          </Field>
          <Field label="Enemy stat ×" hint="Multiplies enemy HP, ATK and DEF. Tune it with the simulator below, or npm run balance -- --calibrate.">
            <NumberInput value={value.statMult} onChange={(v) => set('statMult', v)} min={0.1} max={10} step={0.05} />
          </Field>
          <Field label="First-clear gems 💎">
            <NumberInput value={value.firstClearGems} onChange={(v) => set('firstClearGems', v)} min={0} />
          </Field>
          <Field label="Gold per win 🪙">
            <NumberInput value={value.gold} onChange={(v) => set('gold', v)} min={0} />
          </Field>
        </FormGrid>
      </Section>
      <ObjectivesEditor value={value.objectives} onChange={(o) => set('objectives', o)} />
    </>
  );
}

/** Runs many auto-battles on the server against the saved stage to check difficulty. */
function Simulator({ value }: { value: StageDef }) {
  const content = useContent();
  const [team, setTeam] = useState<string[]>(content.settings.starterCharacters.length ? content.settings.starterCharacters : REFERENCE_TEAM);
  const [level, setLevel] = useState(value.recommendedLevel);
  const [runs, setRuns] = useState(100);
  const [result, setResult] = useState<SimulateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.admin.simulate({ stageId: value.id, team, level, runs }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const pct = result ? Math.round(result.winRate * 100) : 0;
  return (
    <Section title="Difficulty simulator">
      <p className="small muted">Auto-battles the saved version of this stage with the AI controlling both sides.</p>
      <Field label={`Team (${team.length}/${content.settings.maxTeamSize})`} wide>
        <MultiPick
          values={team}
          onChange={setTeam}
          max={content.settings.maxTeamSize}
          options={[...content.bundle.characters].sort((a, b) => b.rarity - a.rarity).map((c) => ({ value: c.id, label: `${c.emoji} ${c.name}` }))}
        />
      </Field>
      <div className="sim-row">
        <label className="inline">
          Team level
          <NumberInput value={level} onChange={setLevel} min={1} />
        </label>
        <label className="inline">
          Battles
          <NumberInput value={runs} onChange={(v) => setRuns(Math.max(1, Math.min(500, v)))} min={1} max={500} />
        </label>
        <button className="btn primary small" disabled={busy || !team.length} onClick={run}>
          {busy ? 'Simulating…' : '▶ Simulate'}
        </button>
        {result && (
          <span className={`sim-result ${pct >= 80 ? 'good' : pct >= 40 ? 'mid' : 'bad'}`}>
            {pct}% win rate · {result.wins}/{result.runs} · ~{result.averageTurns} turns · {Math.round(result.perfectRate * 100)}% all stars · ~
            {result.averageWinActions} actions per win
          </span>
        )}
      </div>
      {error && <p className="error-text small">{error}</p>}
    </Section>
  );
}
