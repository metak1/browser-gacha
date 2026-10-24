import { maxAscension, ELEMENT_IDS, ELEMENTS, ROLE_IDS, type ElementId, type Role } from '@gacha/shared';
import { useState } from 'react';
import { AscensionPips } from '../../components/Materials';
import { CharacterCard, ROLE_INFO } from '../../components/CharacterCard';
import { heroPower } from '../../components/upgrades';
import { TeamTabs } from '../../components/TeamSwitcher';
import { useContent } from '../../state/content';
import { useProfile } from '../../state/profile';
import { CharacterDetail } from './HeroSheet';

/** The heroes tab: the roster grid with filters and sorting, and the selected hero's sheet. */
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

export function HeroesTab() {
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
              <CharacterCard key={id} charId={id} badge={`Lv ${owned.get(id)?.level ?? 1}`} selected={id === selected} onClick={() => setSelected(id)} />
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
                <button
                  key={e}
                  className={`chip ${element === e ? 'active' : ''}`}
                  onClick={() => setElement(element === e ? 'all' : e)}
                  title={ELEMENTS[e].label}
                >
                  {ELEMENTS[e].icon}
                </button>
              ))}
            </div>
            <div className="filters role-filters">
              <button className={`chip ${role === 'all' ? 'active' : ''}`} onClick={() => setRole('all')}>
                All roles
              </button>
              {ROLE_IDS.map((r) => (
                <button
                  key={r}
                  className={`chip ${role === r ? 'active' : ''}`}
                  onClick={() => setRole(role === r ? 'all' : r)}
                  title={ROLE_INFO[r].description}
                >
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

/** The hero's recommended gear stats, and how well the worn gear fits them. */
