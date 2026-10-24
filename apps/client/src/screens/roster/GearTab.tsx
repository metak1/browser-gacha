import { gearStatLabel, GEAR_SLOT_INFO, GEAR_SLOTS, gearScore, type Rarity, type GearSlot } from '@gacha/shared';
import { useState } from 'react';
import { api, errorMessage } from '../../api';
import { sfx } from '../../audio/sfx';
import { GearChip, GearDetail } from '../../components/Gear';
import { useContent } from '../../state/content';
import { useProfile } from '../../state/profile';
import { useToast } from '../../state/toast';

/** The gear tab: the bag with filters, salvaging, and the selected item. */
type GearSort = 'score' | 'rarity' | 'level' | 'new';

/** Auto-salvage preference and a one-click clear-out of low-rarity spares. */
function SalvageBar() {
  const { profile, mutate, setProfile } = useProfile();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const auto = profile.prefs.autoSalvage;
  const spares = (r: number) => profile.gear.filter((g) => g.rarity <= r && g.level === 0 && !g.equippedTo && !g.locked).length;

  async function bulk(maxRarity: 3 | 4) {
    const n = spares(maxRarity);
    if (!n || !window.confirm(`Salvage ${n} unequipped, unupgraded, unlocked item${n === 1 ? '' : 's'} of ★${maxRarity} or lower?`)) return;
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

type GearState = 'all' | 'free' | 'worn' | 'locked';

export function GearTab() {
  const { profile } = useProfile();
  const content = useContent();
  const [slot, setSlot] = useState<GearSlot | 'all'>('all');
  const [sort, setSort] = useState<GearSort>('score');
  const [setFilter, setSetFilter] = useState<string>('all');
  const [main, setMain] = useState<string>('all');
  const [rarity, setRarity] = useState<'all' | Rarity>('all');
  const [state, setState] = useState<GearState>('all');
  const [selected, setSelected] = useState<string | null>(null);

  // Only offer main stats that are in the bag.
  const mains = [...new Set(profile.gear.map((g) => g.main.stat))].sort((a, b) => gearStatLabel(a).localeCompare(gearStatLabel(b)));
  const filtered = setFilter !== 'all' || main !== 'all' || rarity !== 'all' || state !== 'all';
  const items = profile.gear
    .filter((g) => slot === 'all' || g.slot === slot)
    .filter((g) => setFilter === 'all' || (g.set ?? 'none') === setFilter)
    .filter((g) => main === 'all' || g.main.stat === main)
    .filter((g) => rarity === 'all' || g.rarity === rarity)
    .filter((g) => state === 'all' || (state === 'free' ? !g.equippedTo : state === 'worn' ? Boolean(g.equippedTo) : g.locked))
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
        <div className="filters gear-filters">
          <select className="sort-select" value={setFilter} onChange={(e) => setSetFilter(e.target.value)} aria-label="Set">
            <option value="all">Any set</option>
            {content.bundle.gearSets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.emoji} {s.name}
              </option>
            ))}
            {profile.gear.some((g) => !g.set) && <option value="none">No set</option>}
          </select>
          <select className="sort-select" value={main} onChange={(e) => setMain(e.target.value)} aria-label="Main stat">
            <option value="all">Any main stat</option>
            {mains.map((s) => (
              <option key={s} value={s}>
                {gearStatLabel(s)}
              </option>
            ))}
          </select>
          <select
            className="sort-select"
            value={rarity}
            onChange={(e) => setRarity(e.target.value === 'all' ? 'all' : (Number(e.target.value) as Rarity))}
            aria-label="Rarity"
          >
            <option value="all">Any rarity</option>
            {([5, 4, 3] as const).map((r) => (
              <option key={r} value={r}>
                {'★'.repeat(r)}
              </option>
            ))}
          </select>
          <select className="sort-select" value={state} onChange={(e) => setState(e.target.value as GearState)} aria-label="Worn or free">
            <option value="all">Worn and free</option>
            <option value="free">Free only</option>
            <option value="worn">Worn only</option>
            <option value="locked">🔒 Locked</option>
          </select>
          {filtered && (
            <button
              className="btn small"
              onClick={() => {
                setSetFilter('all');
                setMain('all');
                setRarity('all');
                setState('all');
              }}
            >
              Clear
            </button>
          )}
        </div>
        <p className="small muted gear-count">
          {items.length} of {profile.gear.length} items
        </p>
        {items.length ? (
          <div className="gear-grid">
            {items.map((g) => {
              const wearer = g.equippedTo ? content.charactersById[g.equippedTo] : null;
              return <GearChip key={g.id} item={g} selected={item?.id === g.id} onClick={() => setSelected(g.id)} note={wearer?.emoji} />;
            })}
          </div>
        ) : (
          <p className="muted center">
            {profile.gear.length ? 'No gear matches these filters.' : 'No gear yet. Win campaign stages to find weapons, armor and charms.'}
          </p>
        )}
      </section>
      <aside className="panel detail">
        {item ? <GearDetail item={item} onChanged={(g) => !g && setSelected(null)} /> : <p className="muted">Select an item.</p>}
        {item && <p className="small muted">Equip gear from a hero's page in the Heroes tab.</p>}
      </aside>
    </div>
  );
}
