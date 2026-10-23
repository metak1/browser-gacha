import type { GameSettings, GuildSettings, PlayerLevelSettings, Reward } from '@gacha/shared';
import { useContent } from '../state/content';
import { RewardEditor } from './RewardEditor';
import { Field, FormGrid, NumberInput, Section, Select, TextInput, type Option } from './fields';

const blankReward = (): Reward => ({ gems: 50, gold: 0, stardust: 0, materials: [] });

/** Settings for account levels, the login calendar, friends and guilds. */
export function SocialSettings({ draft, set }: { draft: GameSettings; set: <K extends keyof GameSettings>(k: K, v: GameSettings[K]) => void }) {
  const content = useContent();
  const lv = draft.playerLevel;
  const setLv = (patch: Partial<PlayerLevelSettings>) => set('playerLevel', { ...lv, ...patch });
  const g = draft.guild;
  const setG = (patch: Partial<GuildSettings>) => set('guild', { ...g, ...patch });
  const num = (label: string, value: number, onChange: (v: number) => void, hint?: string) => (
    <Field label={label} hint={hint}>
      <NumberInput value={value} onChange={onChange} min={0} />
    </Field>
  );
  const enemyOptions: Option<string>[] = content.bundle.enemies.map((e) => ({ value: e.id, label: `${e.emoji} ${e.name}` }));

  return (
    <>
      <Section title="Player level">
        <FormGrid>
          {num('Max level', lv.maxLevel, (maxLevel) => setLv({ maxLevel }))}
          {num('XP for level 1→2', lv.xpBase, (xpBase) => setLv({ xpBase }))}
          {num('Extra XP per level', lv.xpPerLevel, (xpPerLevel) => setLv({ xpPerLevel }), 'Each level needs this much more than the last.')}
          {num('Level-up gems 💎', lv.rewardGems, (rewardGems) => setLv({ rewardGems }))}
          {num('Level-up stamina ⚡', lv.rewardStamina, (rewardStamina) => setLv({ rewardStamina }))}
          {num('XP per stamina spent', lv.xpPerStamina, (xpPerStamina) => setLv({ xpPerStamina }), 'Campaign, hard, events and sweeps.')}
          {num('XP per dungeon win', lv.xpDungeon, (xpDungeon) => setLv({ xpDungeon }))}
          {num('XP per arena win', lv.xpArena, (xpArena) => setLv({ xpArena }))}
          {num('XP per guild attack', lv.xpGuild, (xpGuild) => setLv({ xpGuild }))}
        </FormGrid>
        <h4 className="sub-head">Level titles</h4>
        {lv.titles.map((t, i) => (
          <div key={i} className="effect-row">
            <label className="inline">
              level
              <NumberInput value={t.level} onChange={(level) => setLv({ titles: lv.titles.map((x, j) => (j === i ? { ...x, level } : x)) })} min={1} />
            </label>
            <TextInput value={t.title} onChange={(title) => setLv({ titles: lv.titles.map((x, j) => (j === i ? { ...x, title } : x)) })} />
            <span className="effect-tools">
              <button className="icon-mini danger" onClick={() => setLv({ titles: lv.titles.filter((_, j) => j !== i) })} title="Remove">
                ✕
              </button>
            </span>
          </div>
        ))}
        <button className="btn small" disabled={lv.titles.length >= 20} onClick={() => setLv({ titles: [...lv.titles, { level: 10, title: 'New Title' }] })}>
          + Add title
        </button>
        <p className="small muted">One-time missions also grant their name as a title when claimed.</p>
      </Section>

      <Section
        title="Login calendar"
        actions={
          <button className="btn small" disabled={draft.loginCalendar.length >= 31} onClick={() => set('loginCalendar', [...draft.loginCalendar, blankReward()])}>
            + Add day
          </button>
        }
      >
        <p className="small muted">Each daily claim pays the next day's reward on top of the daily supplies, cycling back to day 1.</p>
        {draft.loginCalendar.map((r, i) => (
          <div key={i} className="chest-edit">
            <div className="wave-edit-head">
              <b>Day {i + 1}</b>
              <button
                className="icon-mini danger"
                disabled={draft.loginCalendar.length <= 1}
                onClick={() => set('loginCalendar', draft.loginCalendar.filter((_, j) => j !== i))}
                title="Remove day"
              >
                ✕
              </button>
            </div>
            <RewardEditor value={r} onChange={(next) => set('loginCalendar', draft.loginCalendar.map((x, j) => (j === i ? next : x)))} />
          </div>
        ))}
      </Section>

      <Section
        title="Daily activity"
        actions={
          <button
            className="btn small"
            disabled={draft.activityChests.length >= 6}
            onClick={() => set('activityChests', [...draft.activityChests, { points: (draft.activityChests.at(-1)?.points ?? 0) + 30, reward: blankReward() }])}
          >
            + Add chest
          </button>
        }
      >
        <p className="small muted">
          Claiming a daily mission adds its activity points (set on each mission). Chests open when the day's points reach their threshold, and reset at 00:00 UTC.
          Points available today: {content.bundle.missions.filter((m) => m.active && m.repeat === 'daily').reduce((n, m) => n + m.points, 0)}.
        </p>
        {draft.activityChests.map((c, i) => (
          <div key={i} className="chest-edit">
            <div className="wave-edit-head">
              <label className="inline">
                <b>Chest at</b>
                <NumberInput
                  value={c.points}
                  onChange={(points) => set('activityChests', draft.activityChests.map((x, j) => (j === i ? { ...x, points } : x)))}
                  min={1}
                />
                points
              </label>
              <button className="icon-mini danger" onClick={() => set('activityChests', draft.activityChests.filter((_, j) => j !== i))} title="Remove chest">
                ✕
              </button>
            </div>
            <RewardEditor value={c.reward} onChange={(reward) => set('activityChests', draft.activityChests.map((x, j) => (j === i ? { ...x, reward } : x)))} />
          </div>
        ))}
      </Section>

      <Section title="Friends">
        <FormGrid>
          {num('Max friends', draft.social.maxFriends, (maxFriends) => set('social', { ...draft.social, maxFriends }))}
          {num('Gold per support borrow 🪙', draft.social.supportGold, (supportGold) => set('social', { ...draft.social, supportGold }), 'Paid to the lender.')}
        </FormGrid>
      </Section>

      <Section title="Guilds">
        <FormGrid>
          {num('Founding cost 🪙', g.createCost, (createCost) => setG({ createCost }))}
          {num('Max members', g.maxMembers, (maxMembers) => setG({ maxMembers }))}
          {num('Boss attacks per day', g.attemptsPerDay, (attemptsPerDay) => setG({ attemptsPerDay }))}
          {num('Turns per attack', g.turnLimit, (turnLimit) => setG({ turnLimit }), 'All units count.')}
          {num('Gold per attack 🪙', g.attemptGold, (attemptGold) => setG({ attemptGold }))}
        </FormGrid>
        <h4 className="sub-head">Weekly bosses (rotating)</h4>
        {g.bosses.map((b, i) => (
          <div key={i} className="effect-row">
            <Select value={b.enemy} onChange={(enemy) => setG({ bosses: g.bosses.map((x, j) => (j === i ? { ...x, enemy } : x)) })} options={enemyOptions} />
            <label className="inline">
              level
              <NumberInput value={b.level} onChange={(level) => setG({ bosses: g.bosses.map((x, j) => (j === i ? { ...x, level } : x)) })} min={1} />
            </label>
            <label className="inline">
              HP per member
              <NumberInput value={b.hpPerMember} onChange={(hpPerMember) => setG({ bosses: g.bosses.map((x, j) => (j === i ? { ...x, hpPerMember } : x)) })} min={1} />
            </label>
            <span className="effect-tools">
              <button className="icon-mini danger" disabled={g.bosses.length <= 1} onClick={() => setG({ bosses: g.bosses.filter((_, j) => j !== i) })} title="Remove">
                ✕
              </button>
            </span>
          </div>
        ))}
        <button className="btn small" disabled={g.bosses.length >= 12} onClick={() => setG({ bosses: [...g.bosses, { ...g.bosses[0]! }] })}>
          + Add boss
        </button>
        <h4 className="sub-head">Chests (by share of the weekly HP pool)</h4>
        {g.tiers.map((t, i) => (
          <div key={i} className="chest-edit">
            <div className="effect-row">
              <label className="inline">
                at %
                <NumberInput value={t.percent} onChange={(percent) => setG({ tiers: g.tiers.map((x, j) => (j === i ? { ...x, percent } : x)) })} min={1} max={100} />
              </label>
              <span className="effect-tools">
                <button className="icon-mini danger" onClick={() => setG({ tiers: g.tiers.filter((_, j) => j !== i) })} title="Remove">
                  ✕
                </button>
              </span>
            </div>
            <RewardEditor value={t.reward} onChange={(reward) => setG({ tiers: g.tiers.map((x, j) => (j === i ? { ...x, reward } : x)) })} />
          </div>
        ))}
        <button className="btn small" disabled={g.tiers.length >= 10} onClick={() => setG({ tiers: [...g.tiers, { percent: 100, reward: blankReward() }] })}>
          + Add chest
        </button>
      </Section>
    </>
  );
}
