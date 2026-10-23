import { DERIVED_MISSION_KINDS, MISSION_KINDS, type MissionDef, type MissionKind } from '@gacha/shared';
import { useContent } from '../../state/content';
import { EntityEditor, type FormProps } from '../EntityEditor';
import { RewardEditor } from '../RewardEditor';
import { Check, Field, FormGrid, NumberInput, options, Section, Select, TextInput, type Option } from '../fields';

const KIND_LABEL: Record<MissionKind, string> = {
  winBattles: 'Win battles',
  summon: 'Summon (per pull)',
  levelUp: 'Level up heroes',
  claimDaily: 'Claim daily supplies',
  ascend: 'Ascend heroes',
  skillUp: 'Level up skills',
  arenaWins: 'Win arena battles',
  upgradeGear: 'Upgrade gear (per level)',
  collect: 'Own N different heroes',
  clearStage: 'Clear a specific stage',
  dungeonRuns: 'Win dungeon runs',
  hardClears: 'Clear N stages on hard mode',
  guildAttacks: 'Attack the guild boss',
};

export function MissionsEditor() {
  const content = useContent();
  return (
    <EntityEditor<MissionDef>
      kind="missions"
      title="Missions"
      singular="mission"
      items={content.bundle.missions}
      search={(m) => `${m.id} ${m.name} ${m.kind}`}
      label={(m) => (
        <>
          <span>{m.repeat === 'daily' ? '🔁' : '📜'}</span>
          <span>{m.name}</span>
          {!m.active && <small className="tag">Off</small>}
        </>
      )}
      blank={() => ({
        id: '',
        name: 'New Mission',
        description: '',
        kind: 'winBattles',
        target: null,
        count: 5,
        repeat: 'daily',
        active: true,
        reward: { gems: 100, gold: 0, stardust: 0, materials: [] },
        points: 10,
      })}
      Form={MissionForm}
    />
  );
}

function MissionForm({ value, onChange, isNew }: FormProps<MissionDef>) {
  const content = useContent();
  const set = <K extends keyof MissionDef>(k: K, v: MissionDef[K]) => onChange({ ...value, [k]: v });
  const derived = DERIVED_MISSION_KINDS.includes(value.kind);
  const stageOptions: Option<string | null>[] = content.stages.map((s) => ({ value: s.id, label: `${s.id} ${s.name}` }));

  function setKind(kind: MissionKind) {
    const next: MissionDef = { ...value, kind };
    if (kind === 'clearStage') {
      next.target = value.target ?? content.stages[0]?.id ?? null;
      next.count = 1;
    } else next.target = null;
    // Derived missions track permanent progress, so they can only be one-time.
    if (DERIVED_MISSION_KINDS.includes(kind)) next.repeat = 'once';
    onChange(next);
  }

  return (
    <>
      <Section title="Mission">
        <FormGrid>
          <Field label="ID" hint="Can't be changed after creation.">
            <TextInput value={value.id} onChange={(v) => set('id', v)} disabled={!isNew} placeholder="e.g. weekly-hunter" />
          </Field>
          <Field label="Name">
            <TextInput value={value.name} onChange={(v) => set('name', v)} />
          </Field>
          <Field label="Status">
            <Check checked={value.active} onChange={(v) => set('active', v)} label="Active" />
          </Field>
          <Field label="Description" wide>
            <TextInput value={value.description} onChange={(v) => set('description', v)} />
          </Field>
        </FormGrid>
      </Section>
      <Section title="Goal">
        <FormGrid>
          <Field label="Objective">
            <Select value={value.kind} onChange={setKind} options={options(MISSION_KINDS, (k) => KIND_LABEL[k])} />
          </Field>
          {value.kind === 'clearStage' ? (
            <Field label="Stage">
              <Select value={value.target} onChange={(v) => set('target', v)} options={stageOptions} />
            </Field>
          ) : (
            <Field label="Count">
              <NumberInput value={value.count} onChange={(v) => set('count', v)} min={1} />
            </Field>
          )}
          <Field
            label="Repeats"
            hint={derived ? 'Based on permanent progress, so one-time only.' : 'Counter missions only count actions after the mission exists.'}
          >
            <Select
              value={value.repeat}
              onChange={(v) => set('repeat', v)}
              disabled={derived}
              options={[
                { value: 'once', label: 'Once' },
                { value: 'daily', label: 'Daily (resets 00:00 UTC)' },
              ]}
            />
          </Field>
        </FormGrid>
      </Section>
      <Section title="Reward">
        <RewardEditor value={value.reward} onChange={(r) => set('reward', r)} />
        {value.repeat === 'daily' && (
          <FormGrid>
            <Field label="Activity points" hint="Added to today's activity when claimed. Points open the daily chests (Settings → Daily activity).">
              <NumberInput value={value.points} onChange={(v) => set('points', v)} min={0} max={1000} />
            </Field>
          </FormGrid>
        )}
      </Section>
    </>
  );
}
