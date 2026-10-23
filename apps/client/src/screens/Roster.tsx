import {
  applyGear,
  ascensionBonus,
  bestLoadout,
  bulkLevelUp,
  statPower,
  constellationOf,
  essenceFor,
  levelCap,
  levelSkill,
  maxAscension,
  maxSkillLevel,
  nextAscension,
  skillLevelCost,
  UI_ICONS,
  describePassive,
  describeSkill,
  ELEMENT_BEATS,
  ELEMENT_IDS,
  ELEMENTS,
  ROLE_IDS,
  buildMatch,
  gearStatLabel,
  heroBuild,
  applyGearCombat,
  applyPassiveCombat,
  roleCombat,
  COMBAT_LABEL,
  COMBAT_STATS,
  type CharacterDef,
  type GearItem,
  GEAR_SLOT_INFO,
  GEAR_SLOTS,
  gearScore,
  levelUpCost,
  scaleStats,
  type ElementId,
  type Role,
  type GearSlot,
  type OwnedCharacterDTO,
  type Skill,
} from '@gacha/shared';
import { useState } from 'react';
import { api, errorMessage } from '../api';
import { sfx } from '../audio/sfx';
import { Icon, IconOr, UnitArt, PixelEmoji } from '../components/Art';
import { AscensionPips, CostList } from '../components/Materials';
import { CharacterCard, ROLE_INFO } from '../components/CharacterCard';
import { heroPower } from '../components/upgrades';
import { TeamTabs } from '../components/TeamSwitcher';
import { GearChip, GearDetail, GearPicker, SetBonuses } from '../components/Gear';
import { useContent } from '../state/content';
import { useProfile } from '../state/profile';
import { useToast } from '../state/toast';

type Filter = 0 | 3 | 4 | 5;
type Sort = 'power' | 'level' | 'rarity' | 'element' | 'role' | 'name';

const SORTS: { value: Sort; label: string }[] = [
  { value: 'power', label: 'Power' },
  { value: 'level', label: 'Level' },
  { value: 'rarity', label: 'Rarity' },
  { value: 'element', label: 'Element' },
  { value: 'role', label: 'Role' },
  { value: 'name', label: 'Name' },
];

/** Remembers a roster setting on this device. */
function useStored<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      return (localStorage.getItem(key) as T | null) ?? initial;
    } catch {
      return initial;
    }
  });
  return [
    value,
    (v: T) => {
      setValue(v);
      try {
        localStorage.setItem(key, v);
      } catch {
        // Storage can be unavailable (private mode); the setting just won't persist.
      }
    },
  ];
}

export function RosterScreen() {
  const { profile } = useProfile();
  const [tab, setTab] = useState<'heroes' | 'gear' | 'materials'>('heroes');
  const content = useContent();
  return (
    <div className="roster">
      <div className="page-head">
        <h1>Roster</h1>
        <div className="filters tabs-inline">
          <button className={`chip ${tab === 'heroes' ? 'active' : ''}`} onClick={() => setTab('heroes')}>
            👥 Heroes {profile.roster.length}/{content.bundle.characters.length}
          </button>
          <button className={`chip ${tab === 'gear' ? 'active' : ''}`} onClick={() => setTab('gear')}>
            🎒 Gear {profile.gear.length}/{content.settings.gearInventoryCap}
          </button>
          <button className={`chip ${tab === 'materials' ? 'active' : ''}`} onClick={() => setTab('materials')}>
            💠 Materials
          </button>
        </div>
      </div>
      {tab === 'heroes' ? <HeroesTab /> : tab === 'gear' ? <GearTab /> : <MaterialsTab />}
    </div>
  );
}

function HeroesTab() {
  const { profile } = useProfile();
  const content = useContent();
  const characters = content.bundle.characters;
  const [selected, setSelected] = useState<string>(profile.team[0] ?? profile.roster[0]?.id ?? characters[0]?.id ?? '');
  const [filter, setFilter] = useState<Filter>(0);
  const [element, setElement] = useState<ElementId | 'all'>('all');
  const [role, setRole] = useState<Role | 'all'>('all');
  const [sort, setSort] = useStored<Sort>('roster-sort', 'power');
  const owned = new Map(profile.roster.map((c) => [c.id, c]));

  const matches = (c: (typeof characters)[number]) =>
    (!filter || c.rarity === filter) && (element === 'all' || c.element === element) && (role === 'all' || c.role === role);
  const power = new Map(profile.roster.map((o) => [o.id, heroPower(content, profile, o)]));
  const byName = (a: (typeof characters)[number], b: (typeof characters)[number]) => a.name.localeCompare(b.name);
  const sorters: Record<Sort, (a: (typeof characters)[number], b: (typeof characters)[number]) => number> = {
    power: (a, b) => (power.get(b.id) ?? 0) - (power.get(a.id) ?? 0),
    level: (a, b) => (owned.get(b.id)?.level ?? 0) - (owned.get(a.id)?.level ?? 0) || b.rarity - a.rarity,
    rarity: (a, b) => b.rarity - a.rarity || (owned.get(b.id)?.level ?? 0) - (owned.get(a.id)?.level ?? 0),
    element: (a, b) => ELEMENT_IDS.indexOf(a.element) - ELEMENT_IDS.indexOf(b.element) || b.rarity - a.rarity,
    role: (a, b) => ROLE_IDS.indexOf(a.role) - ROLE_IDS.indexOf(b.role) || (power.get(b.id) ?? 0) - (power.get(a.id) ?? 0),
    name: byName,
  };
  const mine = characters.filter((c) => owned.has(c.id) && matches(c)).sort((a, b) => sorters[sort](a, b) || byName(a, b));
  const unowned = characters.filter((c) => !owned.has(c.id) && matches(c)).sort((a, b) => b.rarity - a.rarity || byName(a, b));

  return (
    <>
      <section className="panel">
        <h3>Teams</h3>
        <TeamTabs />
        <TeamRoles team={profile.team} />
        <div className="team-slots">
          {Array.from({ length: content.settings.maxTeamSize }, (_, i) => {
            const id = profile.team[i];
            return id ? (
              <CharacterCard
                key={id}
                charId={id}
                badge={`Lv ${owned.get(id)?.level ?? 1}`}
                selected={id === selected}
                onClick={() => setSelected(id)}
              />
            ) : (
              <div key={`empty-${i}`} className="slot-empty">
                Empty slot
                <span className="small muted slot-hint">Pick a hero below and press “Add to team”</span>
              </div>
            );
          })}
        </div>
      </section>

      <div className="roster-body">
        <section>
          <div className="roster-tools">
            <div className="filters">
              {([0, 5, 4, 3] as Filter[]).map((f) => (
                <button key={f} className={`chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
                  {f ? `★${f}` : 'All'}
                </button>
              ))}
            </div>
            <div className="filters element-filters">
              <button className={`chip ${element === 'all' ? 'active' : ''}`} onClick={() => setElement('all')} title="All elements">
                ✦
              </button>
              {ELEMENT_IDS.map((e) => (
                <button key={e} className={`chip ${element === e ? 'active' : ''}`} onClick={() => setElement(element === e ? 'all' : e)} title={ELEMENTS[e].label}>
                  {ELEMENTS[e].icon}
                </button>
              ))}
            </div>
            <div className="filters role-filters">
              <button className={`chip ${role === 'all' ? 'active' : ''}`} onClick={() => setRole('all')}>
                All roles
              </button>
              {ROLE_IDS.map((r) => (
                <button key={r} className={`chip ${role === r ? 'active' : ''}`} onClick={() => setRole(role === r ? 'all' : r)} title={ROLE_INFO[r].description}>
                  {ROLE_INFO[r].icon} {ROLE_INFO[r].label}
                </button>
              ))}
            </div>
            <label className="small muted roster-sort">
              Sort{' '}
              <select className="sort-select" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid">
            {mine.map((c) => {
              const o = owned.get(c.id)!;
              return (
                <CharacterCard
                  key={c.id}
                  charId={c.id}
                  selected={c.id === selected}
                  badge={sort === 'power' ? `⚔ ${power.get(c.id)?.toLocaleString()}` : `Lv ${o.level}`}
                  footer={o.ascension > 0 ? <AscensionPips rank={o.ascension} max={maxAscension(content.settings.progression)} size="sm" /> : undefined}
                  onClick={() => setSelected(c.id)}
                />
              );
            })}
          </div>
          {!mine.length && <p className="muted small">No heroes match these filters.</p>}
          {unowned.length > 0 && (
            <details className="collection">
              <summary>
                Collection · {profile.roster.length}/{characters.length} heroes found <small className="muted">(show the {unowned.length} still to find)</small>
              </summary>
              <div className="grid">
                {unowned.map((c) => (
                  <CharacterCard key={c.id} charId={c.id} locked selected={c.id === selected} onClick={() => setSelected(c.id)} />
                ))}
              </div>
            </details>
          )}
        </section>
        <CharacterDetail key={selected} charId={selected} owned={owned.get(selected)} />
      </div>
    </>
  );
}

/** The active team's role mix, e.g. "🛡️ 1 Tank · 🗡️ 2 Fighters · 💚 1 Healer". */
function TeamRoles({ team }: { team: string[] }) {
  const content = useContent();
  const counts = ROLE_IDS.map((r) => ({ r, n: team.filter((id) => content.charactersById[id]?.role === r).length })).filter((x) => x.n > 0);
  if (!counts.length) return null;
  return (
    <p className="team-roles small">
      {counts.map(({ r, n }, i) => (
        <span key={r} title={ROLE_INFO[r].description}>
          {i > 0 && ' · '}
          {ROLE_INFO[r].icon} {n} {n === 1 ? ROLE_INFO[r].label : ROLE_INFO[r].plural}
        </span>
      ))}
    </p>
  );
}

/** 0.155 → "15.5%". */
const pctText = (n: number) => `${(Math.round(n * 1000) / 10).toString()}%`;

/** The hero's recommended gear stats, and how well the worn gear fits them. */
function BuildPanel({ hero, worn }: { hero: CharacterDef; worn: GearItem[] }) {
  const build = heroBuild(useContent(), hero);
  const match = buildMatch(build, worn);
  return (
    <div className="build-panel">
      <div className="build-head">
        <b className="small">🧭 Recommended build</b>
        {match.total > 0 && (
          <small className={match.matched === match.total ? 'good' : 'muted'}>
            {match.matched}/{match.total} bonus stats fit
          </small>
        )}
      </div>
      {(['weapon', 'armor', 'charm', 'boots'] as const).map((slot) => (
        <div key={slot} className="build-row small">
          <span className="muted">
            {GEAR_SLOT_INFO[slot].icon} {GEAR_SLOT_INFO[slot].label}
          </span>
          <span>{build[slot].map(gearStatLabel).join(' or ')}</span>
        </div>
      ))}
      <div className="build-row small">
        <span className="muted">Bonus stats</span>
        <span className="build-subs">
          {build.subs.map((s, i) => (
            <span key={s}>
              {i > 0 && <span className="muted"> › </span>}
              {gearStatLabel(s)}
            </span>
          ))}
        </span>
      </div>
      <p className="small muted">{build.why}</p>
    </div>
  );
}

type DetailTab = 'overview' | 'skills' | 'story';

function CharacterDetail({ charId, owned }: { charId: string; owned?: OwnedCharacterDTO }) {
  const { profile, mutate } = useProfile();
  const toast = useToast();
  const content = useContent();
  const [tab, setTab] = useState<DetailTab>('overview');
  const [picking, setPicking] = useState<GearSlot | null>(null);
  const [celebrate, setCelebrate] = useState(0);
  const settings = content.settings;
  const prog = settings.progression;
  const c = content.charactersById[charId];
  if (!c) return null;
  const el = ELEMENTS[c.element];
  const role = ROLE_INFO[c.role];
  const level = owned?.level ?? 1;
  const rank = owned?.ascension ?? 0;
  const con = owned ? constellationOf(owned.copies) : 0;
  const cap = levelCap(prog, rank, settings.maxLevel);
  const bonus = ascensionBonus(prog, rank);
  const worn = profile.gear.filter((g) => g.equippedTo === charId);
  const base = scaleStats(c.base, level, con, bonus);
  const sets = content.gearSetsById;
  const stats = applyGear(base, worn, sets);
  const next = level < cap ? applyGear(scaleStats(c.base, level + 1, con, bonus), worn, sets) : null;
  const cost = levelUpCost(settings, level);
  const bulk5 = bulkLevelUp(settings, level, cap, profile.wallet.gold, 5);
  const bulkMax = bulkLevelUp(settings, level, cap, profile.wallet.gold, cap - level);
  // What auto-equip would add: the best free gear per slot, compared with what's worn.
  const combatBase = applyPassiveCombat(roleCombat(c.role), c.passive);
  const combat = applyGearCombat(combatBase, worn, sets);
  const best = bestLoadout(base, profile.gear, charId, sets, combatBase);
  const bestGear = best.flatMap((s) => (s.best ? [s.best] : []));
  const loadoutGain = owned
    ? statPower(applyGear(base, bestGear, sets), applyGearCombat(combatBase, bestGear, sets)) - statPower(applyGear(base, worn, sets), combat)
    : 0;
  const inTeam = profile.team.includes(charId);
  const atCap = level >= cap;

  const step = nextAscension(prog, rank);
  const essence = essenceFor(content, c.element);
  const ascendCost = step
    ? [
        ...(step.essence && essence ? [{ id: essence.id, count: step.essence }] : []),
        ...(step.crystals ? [{ id: prog.crystal, count: step.crystals }] : []),
      ]
    : [];
  const canAscend =
    Boolean(step) && profile.wallet.gold >= (step?.gold ?? 0) && ascendCost.every((m) => (profile.materials[m.id] ?? 0) >= m.count);

  function toggleTeam() {
    if (inTeam) {
      if (profile.team.length === 1) return toast('Your team needs at least one hero', 'error');
      return mutate(() => api.setTeam(profile.team.filter((id) => id !== charId)));
    }
    if (profile.team.length >= settings.maxTeamSize) return toast('Team is full. Remove someone first.', 'error');
    return mutate(() => api.setTeam([...profile.team, charId]));
  }

  async function ascend() {
    if (await mutate(() => api.ascend(charId), `${c!.name} ascended!`)) {
      sfx.victory();
      setCelebrate((k) => k + 1);
    }
  }

  return (
    <aside className="panel detail">
      {celebrate > 0 && <div key={celebrate} className="ascend-burst" />}
      <div className="detail-head" style={{ ['--el' as string]: el.color }}>
        <span className="detail-emoji">
          {!owned ? '❔' : c.sprite ? <UnitArt sprite={c.sprite} emoji={c.emoji} height="56px" /> : <PixelEmoji emoji={c.emoji} />}
        </span>
        <div>
          <h2>{c.name}</h2>
          {c.title && <div className="hero-title">{c.title}</div>}
          <div className={`r${c.rarity}-text`}>
            {'★'.repeat(c.rarity)} {owned && <AscensionPips rank={rank} max={maxAscension(prog)} />}
          </div>
          <div className="small muted">
            {el.icon} {el.label} (strong vs {ELEMENTS[ELEMENT_BEATS[c.element]].label}) ·{' '}
            <span title={role.description}>
              {role.icon} {role.label}
            </span>
          </div>
        </div>
      </div>

      <div className="filters detail-tabs">
        {(['overview', 'skills', 'story'] as DetailTab[]).map((t) => (
          <button key={t} className={`chip ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'overview' ? 'Overview' : t === 'skills' ? 'Skills' : 'Story'}
          </button>
        ))}
      </div>

      {tab === 'overview' &&
        (owned ? (
          <>
            <div className="detail-level">
              <span>
                Level <b>{level}</b> / {cap}
                {cap < settings.maxLevel && <span className="small muted"> (max {settings.maxLevel})</span>}
              </span>
              <span title="Constellation: each duplicate adds +6% HP/ATK/DEF">
                C{con} · ×{owned.copies}
              </span>
            </div>
            <table className="stats">
              <tbody>
                {(['hp', 'atk', 'def', 'spd'] as const).map((s) => (
                  <tr key={s}>
                    <td className="muted">{s.toUpperCase()}</td>
                    <td>
                      {stats[s]}
                      {stats[s] !== base[s] && <span className="gear-bonus"> (+{stats[s] - base[s]})</span>}
                    </td>
                    <td className="up">{next && next[s] !== stats[s] ? `→ ${next[s]}` : ''}</td>
                  </tr>
                ))}
                {COMBAT_STATS.map((s) => (
                  <tr key={s} className="combat-row">
                    <td className="muted">{COMBAT_LABEL[s]}</td>
                    <td>
                      {pctText(combat[s])}
                      {combat[s] > combatBase[s] + 1e-9 && <span className="gear-bonus"> (+{pctText(combat[s] - combatBase[s])})</span>}
                    </td>
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="detail-actions">
              <button
                className="btn primary"
                disabled={atCap || profile.wallet.gold < cost}
                onClick={() => mutate(() => api.levelUp(charId))}
              >
                {level >= settings.maxLevel ? 'Max level' : atCap ? 'Level cap reached' : `Level up · 🪙 ${cost}`}
              </button>
              {!atCap && (
                <span className="bulk-level">
                  {bulk5.levels > 1 && (
                    <button className="btn small" onClick={() => mutate(() => api.levelUp(charId, 5))} title={`🪙 ${bulk5.cost.toLocaleString()}`}>
                      +{bulk5.levels} · 🪙 {bulk5.cost.toLocaleString()}
                    </button>
                  )}
                  {bulkMax.levels > bulk5.levels && (
                    <button className="btn small" onClick={() => mutate(() => api.levelUp(charId, bulkMax.levels))}>
                      To Lv {level + bulkMax.levels} · 🪙 {bulkMax.cost.toLocaleString()}
                    </button>
                  )}
                </span>
              )}
              <button className="btn" onClick={toggleTeam}>
                {inTeam ? 'Remove from team' : 'Add to team'}
              </button>
            </div>

            <div className={`ascend-card ${atCap && step ? 'ready' : ''}`}>
              {step ? (
                <>
                  <div className="ascend-head">
                    <b>Ascension {rank + 1}</b>
                    <span className="small muted">
                      Level cap {cap} → {Math.min(step.cap, settings.maxLevel)} · +{Math.round(step.statBonus * 100)}% HP/ATK/DEF
                      {c.lore.some((l) => l.unlockRank === rank + 1) && ' · unlocks a story'}
                    </span>
                  </div>
                  <CostList gold={step.gold} materials={ascendCost} />
                  <button className={`btn ${canAscend ? 'primary glow' : ''}`} disabled={!canAscend} onClick={ascend}>
                    ✦ Ascend
                  </button>
                  {!canAscend && essence && <p className="small muted">{essence.name} drops from {c.element} enemies, or buy it in Roster → Materials.</p>}
                </>
              ) : (
                <div className="ascend-head">
                  <b>Fully ascended</b>
                  <span className="small muted">+{Math.round(bonus * 100)}% HP/ATK/DEF from ascension</span>
                </div>
              )}
            </div>

            <div className="gear-head">
              <b className="small">Gear</b>
              <button
                className="btn small"
                disabled={!loadoutGain}
                onClick={() => mutate(() => api.autoEquip(charId), 'Equipped the best gear')}
                title="Puts on the best free gear from your bag. Gear worn by other heroes is left alone."
              >
                ✨ Auto-equip{loadoutGain ? ` · +${loadoutGain.toLocaleString()} power` : ' · already best'}
              </button>
            </div>
            <div className="gear-slots">
              {GEAR_SLOTS.map((slot) => {
                const item = worn.find((g) => g.slot === slot);
                return (
                  <button key={slot} type="button" className="gear-slot" onClick={() => setPicking(slot)} title={`Change ${slot}`}>
                    {item ? (
                      <GearChip item={item} />
                    ) : (
                      <div className="gear-slot-empty">
                        <span>{GEAR_SLOT_INFO[slot].icon}</span>+ {GEAR_SLOT_INFO[slot].label}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <SetBonuses worn={worn} />
            <BuildPanel hero={c} worn={worn} />
          </>
        ) : (
          <p className="muted">Not yet summoned. Try your luck on the Summon page.</p>
        ))}

      {tab === 'skills' && (
        <>
          {c.passive && (
            <div className="skill-info passive-info">
              <div className="skill-head">
                <span className="passive-icon">✦</span>
                <span className="tag passive-tag">Passive</span> <b>{c.passive.name}</b>
              </div>
              <p className="small">
                {describePassive(c.passive)} <span className="muted">Always active.</span>
              </p>
            </div>
          )}
          {content.skillsById[c.basic] && <SkillCard label="Basic" skill={content.skillsById[c.basic]!} />}
          {c.skill && content.skillsById[c.skill] && (
            <SkillCard label="Skill" skill={content.skillsById[c.skill]!} charId={charId} slot="skill" level={owned?.skillLevel} />
          )}
          {c.ultimate && content.skillsById[c.ultimate] && (
            <SkillCard label="Ultimate" skill={content.skillsById[c.ultimate]!} charId={charId} slot="ultimate" level={owned?.ultLevel} />
          )}
        </>
      )}

      {tab === 'story' && (
        <div className="lore">
          {c.lore.length === 0 && <p className="muted">No story written for {c.name} yet.</p>}
          {c.lore.map((entry, i) => {
            const open = owned && rank >= entry.unlockRank;
            return (
              <article key={i} className={`lore-entry ${open ? '' : 'locked'}`}>
                <h4>{open ? entry.title : '???'}</h4>
                {open ? (
                  <p>{entry.text}</p>
                ) : (
                  <p className="muted small">🔒 {owned ? `Unlocks at Ascension ${entry.unlockRank}.` : 'Summon this hero to read their story.'}</p>
                )}
              </article>
            );
          })}
        </div>
      )}

      {picking && <GearPicker heroId={charId} slot={picking} onClose={() => setPicking(null)} />}
    </aside>
  );
}

/** A skill with its level, current/next-level text, and an upgrade button. */
function SkillCard({
  label,
  skill,
  charId,
  slot,
  level,
}: {
  label: string;
  skill: Skill;
  charId?: string;
  slot?: 'skill' | 'ultimate';
  level?: number;
}) {
  const { mutate } = useProfile();
  const content = useContent();
  const prog = content.settings.progression;
  const lv = level ?? 1;
  const max = maxSkillLevel(prog);
  const leveled = slot ? levelSkill(skill, lv, prog.skillLevelBonus) : skill;
  const nextCost = slot && level !== undefined ? skillLevelCost(prog, lv) : null;
  const nextSkill = nextCost ? levelSkill(skill, lv + 1, prog.skillLevelBonus) : null;
  const { profile } = useProfile();
  const affordable = nextCost
    ? profile.wallet.gold >= nextCost.gold && (profile.materials[prog.tome] ?? 0) >= nextCost.tomes
    : false;

  return (
    <div className="skill-info">
      <div className="skill-head">
        {skill.icon ? <Icon id={skill.icon} size={32} className="skill-icon" /> : null}
        <span className={`tag ${label === 'Ultimate' ? 'ult-tag' : ''}`}>{label}</span> <b>{skill.name}</b>
        {slot && (
          <span className="skill-level">
            Lv {lv}/{max}
          </span>
        )}
      </div>
      <p className="small">
        {describeSkill(leveled)}
        {skill.cooldown > 0 && <span className="muted"> Cooldown {skill.cooldown}.</span>}
        {label === 'Ultimate' && <span className="muted"> Needs full energy.</span>}
      </p>
      {nextSkill && nextCost && charId && slot && (
        <div className="skill-next">
          <p className="small up">Next: {describeSkill(nextSkill)}</p>
          <CostList gold={nextCost.gold} materials={nextCost.tomes ? [{ id: prog.tome, count: nextCost.tomes }] : []} />
          <button
            className="btn small"
            disabled={!affordable}
            onClick={async () => {
              if (await mutate(() => api.skillUp(charId, slot), `${skill.name} is now level ${lv + 1}`)) sfx.buff();
            }}
          >
            Level up skill
          </button>
        </div>
      )}
      {slot && level !== undefined && lv >= max && <p className="small r5-text">Max level</p>}
    </div>
  );
}

function MaterialsTab() {
  const { profile, mutate } = useProfile();
  const content = useContent();
  const [qty, setQty] = useState<Record<string, number>>({});
  const shop = content.settings.progression.shop;
  return (
    <div className="materials-tab">
      <section className="panel">
        <h3>Materials</h3>
        <div className="mat-grid">
          {content.bundle.materials.map((m) => (
            <div key={m.id} className={`mat-card r${m.rarity}`}>
              <IconOr icon={m.icon} emoji={m.emoji} size={48} />
              <div>
                <b>{m.name}</b> <span className="mat-count">×{profile.materials[m.id] ?? 0}</span>
                <p className="small muted">{m.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <h3>Shop</h3>
        <div className="shop">
          {shop.map((e) => {
            const m = content.materialsById[e.material];
            if (!m) return null;
            const n = qty[e.material] ?? 1;
            const gold = e.gold * n;
            const stardust = e.stardust * n;
            const ok = profile.wallet.gold >= gold && profile.wallet.stardust >= stardust;
            return (
              <div key={e.material} className="shop-row">
                <IconOr icon={m.icon} emoji={m.emoji} size={32} />
                <span className="shop-name">
                  {m.name} <small className="muted">(own {profile.materials[m.id] ?? 0})</small>
                </span>
                <span className="filters shop-qty">
                  {[1, 5, 10].map((q) => (
                    <button key={q} className={`chip ${n === q ? 'active' : ''}`} onClick={() => setQty({ ...qty, [e.material]: q })}>
                      ×{q}
                    </button>
                  ))}
                </span>
                <span className="shop-price">
                  {gold > 0 && (
                    <span>
                      <Icon id={UI_ICONS.gold} size={16} /> {gold.toLocaleString()}
                    </span>
                  )}
                  {stardust > 0 && (
                    <span>
                      <Icon id={UI_ICONS.stardust} size={16} /> {stardust.toLocaleString()}
                    </span>
                  )}
                </span>
                <button
                  className="btn small primary"
                  disabled={!ok}
                  onClick={async () => {
                    if (await mutate(() => api.buy(e.material, n), `Bought ${n}× ${m.name}`)) sfx.coins();
                  }}
                >
                  Buy
                </button>
              </div>
            );
          })}
          {!shop.length && <p className="muted">The shop is empty.</p>}
        </div>
      </section>
    </div>
  );
}

type GearSort = 'score' | 'rarity' | 'level' | 'new';

/** Auto-salvage preference and a one-click clear-out of low-rarity spares. */
function SalvageBar() {
  const { profile, mutate, setProfile } = useProfile();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const auto = profile.prefs.autoSalvage;
  const spares = (r: number) => profile.gear.filter((g) => g.rarity <= r && g.level === 0 && !g.equippedTo).length;

  async function bulk(maxRarity: 3 | 4) {
    const n = spares(maxRarity);
    if (!n || !window.confirm(`Salvage ${n} unequipped, unupgraded item${n === 1 ? '' : 's'} of ★${maxRarity} or lower?`)) return;
    setBusy(true);
    try {
      const res = await api.salvageBulk(maxRarity);
      setProfile(res.profile);
      sfx.coins();
      toast(`Salvaged ${res.salvaged.count} items for 🪙 ${res.salvaged.gold.toLocaleString()}${res.salvaged.stones ? ` and 🔨 ${res.salvaged.stones}` : ''}`);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="salvage-bar">
      <label className="small">
        Auto-salvage drops:{' '}
        <select
          className="sort-select"
          value={auto}
          onChange={(e) => void mutate(() => api.setPrefs({ autoSalvage: Number(e.target.value) as 0 | 3 | 4 }), 'Auto-salvage updated')}
        >
          <option value={0}>Off</option>
          <option value={3}>★3</option>
          <option value={4}>★3 and ★4</option>
        </select>
      </label>
      <span className="salvage-actions">
        <button className="btn small" disabled={busy || !spares(3)} onClick={() => bulk(3)}>
          ♻️ Salvage spare ★3 ({spares(3)})
        </button>
        <button className="btn small" disabled={busy || !spares(4)} onClick={() => bulk(4)}>
          ★3–4 ({spares(4)})
        </button>
      </span>
    </div>
  );
}

function GearTab() {
  const { profile } = useProfile();
  const content = useContent();
  const [slot, setSlot] = useState<GearSlot | 'all'>('all');
  const [sort, setSort] = useState<GearSort>('score');
  const [selected, setSelected] = useState<string | null>(null);

  const items = profile.gear
    .filter((g) => slot === 'all' || g.slot === slot)
    .sort((a, b) => {
      if (sort === 'rarity') return b.rarity - a.rarity || gearScore(b) - gearScore(a);
      if (sort === 'level') return b.level - a.level || gearScore(b) - gearScore(a);
      if (sort === 'new') return 0;
      return gearScore(b) - gearScore(a);
    });
  const item = profile.gear.find((g) => g.id === selected) ?? items[0];

  return (
    <div className="roster-body">
      <section>
        <SalvageBar />
        <div className="filters">
          {(['all', ...GEAR_SLOTS] as const).map((s) => (
            <button key={s} className={`chip ${slot === s ? 'active' : ''}`} onClick={() => setSlot(s)}>
              {s === 'all' ? 'All' : `${GEAR_SLOT_INFO[s].icon} ${GEAR_SLOT_INFO[s].label}`}
            </button>
          ))}
          <select className="sort-select" value={sort} onChange={(e) => setSort(e.target.value as GearSort)}>
            <option value="score">Best first</option>
            <option value="rarity">Rarity</option>
            <option value="level">Level</option>
            <option value="new">Newest</option>
          </select>
        </div>
        {items.length ? (
          <div className="gear-grid">
            {items.map((g) => {
              const wearer = g.equippedTo ? content.charactersById[g.equippedTo] : null;
              return <GearChip key={g.id} item={g} selected={item?.id === g.id} onClick={() => setSelected(g.id)} note={wearer?.emoji} />;
            })}
          </div>
        ) : (
          <p className="muted center">No gear yet. Win campaign stages to find weapons, armor and charms.</p>
        )}
      </section>
      <aside className="panel detail">
        {item ? <GearDetail item={item} onChanged={(g) => !g && setSelected(null)} /> : <p className="muted">Select an item.</p>}
        {item && <p className="small muted">Equip gear from a hero's page in the Heroes tab.</p>}
      </aside>
    </div>
  );
}
