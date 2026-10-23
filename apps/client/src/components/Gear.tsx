import {
  applyGear,
  applyGearCombat,
  applyPassiveCombat,
  ascensionBonus,
  COMBAT_LABEL,
  COMBAT_STATS,
  constellationOf,
  formatGearRoll,
  GEAR_SLOT_INFO,
  gearSalvageValue,
  gearScore,
  gearUpgradeCost,
  mainStatValue,
  heroBuild,
  reforgeGold,
  roleCombat,
  salvageStones,
  scaleStats,
  statPower,
  subQuality,
  subRolls,
  wornSets,
  type GearItem,
  type GearSlot,
  type OwnedCharacterDTO,
} from '@gacha/shared';
import { useState } from 'react';
import { api } from '../api';
import { sfx } from '../audio/sfx';
import { useContent } from '../state/content';
import { IconOr } from './Art';
import { useProfile } from '../state/profile';
import './gear.css';

/** Name/emoji come from the template; rolled numbers live on the item. */
export function useGearInfo(item: Pick<GearItem, 'templateId' | 'slot'>) {
  const template = useContent().gearById[item.templateId];
  return {
    name: template?.name ?? 'Unknown gear',
    emoji: template?.emoji ?? GEAR_SLOT_INFO[item.slot].icon,
    icon: template?.icon ?? null,
  };
}

/** Compact item tile used in lists, slots and loot. */
export function GearChip({ item, selected, onClick, note }: { item: GearItem; selected?: boolean; onClick?: () => void; note?: string }) {
  const { name, emoji, icon } = useGearInfo(item);
  const sets = useContent().gearSetsById;
  const set = item.set ? sets[item.set] : undefined;
  return (
    <button
      type="button"
      className={`gear-chip r${item.rarity} ${selected ? 'selected' : ''}`}
      onClick={onClick}
      disabled={!onClick}
      title={set ? `${name} · ${set.name} set` : name}
    >
      {set && (
        <span className="gear-set">
          <IconOr icon={set.icon} emoji={set.emoji} size={14} />
        </span>
      )}
      <span className="gear-emoji">
        <IconOr icon={icon} emoji={emoji} size={32} />
      </span>
      {item.level > 0 && <span className="gear-level">+{item.level}</span>}
      {item.locked && (
        <span className="gear-lock" title="Locked">
          🔒
        </span>
      )}
      <span className="gear-main">{formatGearRoll(item.main)}</span>
      {note && <span className="gear-note">{note}</span>}
    </button>
  );
}

/**
 * Gear won in a fight or sweep: tap an item to inspect it, then keep or sell it
 * (selling is salvaging: gold, plus reforge stones for ★4/★5).
 */
export function LootGear({ drops, animate }: { drops: GearItem[]; animate?: boolean }) {
  const settings = useContent().settings;
  const { profile, mutate } = useProfile();
  const [open, setOpen] = useState<string | null>(null);
  const [sold, setSold] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  if (!drops.length) return null;
  // Locking or equipping a drop shows up in the profile, so read items from there.
  const live = drops.map((g) => profile.gear.find((x) => x.id === g.id) ?? g);
  const kept = live.filter((g) => !sold.includes(g.id));
  // Sell all leaves locked and worn items alone.
  const sellable = kept.filter((g) => !g.locked && !g.equippedTo);
  const value = (items: GearItem[]) => ({
    gold: items.reduce((n, g) => n + gearSalvageValue(settings, g), 0),
    stones: items.reduce((n, g) => n + salvageStones(settings, g.rarity), 0),
  });
  const price = ({ gold, stones }: { gold: number; stones: number }) => `🪙 ${gold.toLocaleString()}${stones ? ` · 🔨 ${stones}` : ''}`;

  async function sell(items: GearItem[]) {
    setBusy(true);
    const done: string[] = [];
    await mutate(async () => {
      let profile;
      for (const g of items) {
        profile = (await api.gear.salvage(g.id)).profile;
        done.push(g.id);
      }
      return profile!;
    });
    // Items sold before a failure stay sold.
    setSold((s) => [...s, ...done]);
    if (done.length) sfx.coins();
    setOpen(null);
    setBusy(false);
  }

  const inspected = kept.find((g) => g.id === open);
  return (
    <div className="drops loot-gear">
      <small className="muted">Loot · tap an item to inspect it</small>
      <div className="drop-row">
        {live.map((g, i) => (
          <div key={g.id} className={`${animate ? 'drop' : ''} ${sold.includes(g.id) ? 'sold' : ''}`} style={animate ? { animationDelay: `${0.35 + i * 0.15}s` } : undefined}>
            <GearChip
              item={g}
              selected={g.id === open}
              onClick={sold.includes(g.id) ? undefined : () => setOpen(g.id === open ? null : g.id)}
              note={sold.includes(g.id) ? 'Sold' : undefined}
            />
          </div>
        ))}
      </div>
      {inspected && <LootInspect item={inspected} busy={busy} price={price(value([inspected]))} onSell={() => void sell([inspected])} onKeep={() => setOpen(null)} />}
      {sellable.length > 1 && !inspected && (
        <button
          className="btn small danger loot-sell-all"
          disabled={busy}
          title={sellable.length < kept.length ? 'Locked and worn items are kept.' : undefined}
          onClick={() => {
            if (confirm(`Sell ${sellable.length} items for ${price(value(sellable))}?`)) void sell(sellable);
          }}
        >
          Sell all · {price(value(sellable))}
        </button>
      )}
    </div>
  );
}

/** A hero's stats and power with a given set of worn gear. */
function heroWith(content: ReturnType<typeof useContent>, owned: OwnedCharacterDTO, items: GearItem[]) {
  const c = content.charactersById[owned.id]!;
  const base = scaleStats(c.base, owned.level, constellationOf(owned.copies), ascensionBonus(content.settings.progression, owned.ascension));
  const stats = applyGear(base, items, content.gearSetsById);
  const combat = applyGearCombat(applyPassiveCombat(roleCombat(c.role), c.passive), items, content.gearSetsById);
  return { stats, combat, power: statPower(stats, combat) };
}

/** What wearing `item` would change for a hero: their worn gear with it swapped into its slot. */
function compareOn(content: ReturnType<typeof useContent>, gear: GearItem[], owned: OwnedCharacterDTO, item: GearItem) {
  const worn = gear.filter((g) => g.equippedTo === owned.id);
  const current = worn.find((g) => g.slot === item.slot) ?? null;
  const before = heroWith(content, owned, worn);
  const after = heroWith(content, owned, [...worn.filter((g) => g.slot !== item.slot), item]);
  return { current, before, after, gain: after.power - before.power };
}

/** A dropped item's stats, compared on a hero, with Equip, Lock, Keep and Sell. */
function LootInspect({ item, busy, price, onSell, onKeep }: { item: GearItem; busy: boolean; price: string; onSell: () => void; onKeep: () => void }) {
  const { name, emoji, icon } = useGearInfo(item);
  const content = useContent();
  const { profile, mutate } = useProfile();
  // Team first, then everyone else by level; the default is whoever it helps most in the team.
  const heroes = [...profile.roster]
    .filter((o) => content.charactersById[o.id])
    .sort((a, b) => Number(profile.team.includes(b.id)) - Number(profile.team.includes(a.id)) || b.level - a.level);
  const team = heroes.filter((o) => profile.team.includes(o.id));
  const best = (team.length ? team : heroes).reduce<OwnedCharacterDTO | null>(
    (top, o) => (!top || compareOn(content, profile.gear, o, item).gain > compareOn(content, profile.gear, top, item).gain ? o : top),
    null,
  );
  const [heroId, setHeroId] = useState<string | null>(null);
  const hero = heroes.find((o) => o.id === heroId) ?? best;
  const wearer = item.equippedTo ? content.charactersById[item.equippedTo] : null;
  const cmp = hero && item.equippedTo !== hero.id ? compareOn(content, profile.gear, hero, item) : null;
  const heroDef = hero ? content.charactersById[hero.id] : null;
  return (
    <div className={`gear-detail loot-inspect r${item.rarity}`}>
      <div className="gear-detail-head">
        <span className="gear-detail-emoji">
          <IconOr icon={icon} emoji={emoji} size={48} />
        </span>
        <div>
          <b>{name}</b>
          <div className={`r${item.rarity}-text small`}>
            {'★'.repeat(item.rarity)} · {GEAR_SLOT_INFO[item.slot].icon} {GEAR_SLOT_INFO[item.slot].label}
          </div>
          <div className="small muted">
            score {gearScore(item)}
            {wearer && ` · worn by ${wearer.emoji} ${wearer.name}`}
          </div>
        </div>
      </div>
      <ItemSet item={item} />
      <div className="gear-stats">
        <div className="gear-stat main">{formatGearRoll(item.main)}</div>
        {item.subs.map((s, i) => (
          <div key={i} className="gear-stat">
            {formatGearRoll(s)}
          </div>
        ))}
      </div>
      {hero && heroDef && (
        <div className="loot-compare">
          <label className="small">
            Compare on{' '}
            <select className="sort-select" value={hero.id} onChange={(e) => setHeroId(e.target.value)}>
              {heroes.map((o) => {
                const c = content.charactersById[o.id]!;
                return (
                  <option key={o.id} value={o.id}>
                    {c.emoji} {c.name} · Lv {o.level}
                    {profile.team.includes(o.id) ? ' · team' : ''}
                  </option>
                );
              })}
            </select>
          </label>
          {cmp ? (
            <>
              <div className="small muted">
                {cmp.current ? (
                  <>
                    Replaces <CompareName item={cmp.current} /> ({formatGearRoll(cmp.current.main)})
                  </>
                ) : (
                  `Fills the empty ${GEAR_SLOT_INFO[item.slot].label.toLowerCase()} slot`
                )}
              </div>
              <div className="compare-rows">
                {(['hp', 'atk', 'def', 'spd'] as const).map((s) => (
                  <CompareRow key={s} label={s.toUpperCase()} before={cmp.before.stats[s]} after={cmp.after.stats[s]} />
                ))}
                {COMBAT_STATS.map((s) => (
                  <CompareRow key={s} label={COMBAT_LABEL[s]} before={cmp.before.combat[s]} after={cmp.after.combat[s]} pct />
                ))}
              </div>
              <div className={`compare-power ${cmp.gain > 0 ? 'up' : cmp.gain < 0 ? 'down' : ''}`}>
                {cmp.gain > 0 ? '▲ +' : cmp.gain < 0 ? '▼ ' : ''}
                {cmp.gain.toLocaleString()} power
              </div>
            </>
          ) : (
            <div className="small muted">{heroDef.name} is wearing it.</div>
          )}
        </div>
      )}
      <div className="gear-actions">
        {cmp && hero && heroDef && (
          <button
            className={`btn small ${cmp.gain > 0 ? 'primary' : ''}`}
            disabled={busy}
            onClick={() => void mutate(async () => (await api.gear.equip(item.id, hero.id)).profile, `Equipped on ${heroDef.name}`).then((ok) => ok && sfx.click())}
          >
            Equip on {heroDef.name}
          </button>
        )}
        <button className="btn small" disabled={busy} onClick={() => void mutate(async () => (await api.gear.lock(item.id, !item.locked)).profile)}>
          {item.locked ? '🔓 Unlock' : '🔒 Lock'}
        </button>
        <button className="btn small" disabled={busy} onClick={onKeep}>
          Keep
        </button>
        <button
          className="btn small danger"
          disabled={busy || item.locked || Boolean(item.equippedTo)}
          title={item.locked ? 'Unlock it first' : item.equippedTo ? 'Unequip it first' : undefined}
          onClick={onSell}
        >
          Sell · {price}
        </button>
      </div>
    </div>
  );
}

function CompareName({ item }: { item: GearItem }) {
  return <b>{useGearInfo(item).name}</b>;
}

/** "ATK 1,200 → 1,260 (+60)", only for stats that change. */
function CompareRow({ label, before, after, pct }: { label: string; before: number; after: number; pct?: boolean }) {
  const delta = after - before;
  if (Math.abs(delta) < (pct ? 0.0005 : 0.5)) return null;
  const fmt = (v: number) => (pct ? `${(v * 100).toFixed(1)}%` : Math.round(v).toLocaleString());
  return (
    <div className={`compare-row ${delta > 0 ? 'up' : 'down'}`}>
      <span className="muted">{label}</span>
      <span>
        {fmt(before)} → <b>{fmt(after)}</b>
      </span>
      <span className="compare-delta">
        {delta > 0 ? '+' : '−'}
        {pct ? `${Math.abs(delta * 100).toFixed(1)}%` : Math.abs(Math.round(delta)).toLocaleString()}
      </span>
    </div>
  );
}

/** Full item card with upgrade / salvage / equip actions. */
export function GearDetail({
  item,
  equipTo,
  onChanged,
}: {
  item: GearItem;
  /** When set, shows an "Equip on …" button for this hero. */
  equipTo?: { id: string; name: string };
  onChanged?: (item: GearItem | null) => void;
}) {
  const content = useContent();
  const { profile, mutate } = useProfile();
  const { name, emoji, icon } = useGearInfo(item);
  const [busy, setBusy] = useState(false);
  const settings = content.settings;
  const maxed = item.level >= settings.gearMaxLevel;
  const cost = gearUpgradeCost(settings, item);
  const salvage = gearSalvageValue(settings, item);
  const wearer = item.equippedTo ? content.charactersById[item.equippedTo] : null;
  const nextMain = mainStatValue({ mainStat: item.main.stat, mainBase: item.mainBase }, item.level + 1);

  async function run(call: () => Promise<{ item: GearItem | null; profile: typeof profile }>, after?: () => void) {
    setBusy(true);
    let changed: GearItem | null = null;
    const ok = await mutate(async () => {
      const res = await call();
      changed = res.item;
      return res.profile;
    });
    setBusy(false);
    if (ok) {
      after?.();
      onChanged?.(changed);
    }
  }

  return (
    <div className={`gear-detail r${item.rarity}`}>
      <div className="gear-detail-head">
        <span className="gear-detail-emoji">
          <IconOr icon={icon} emoji={emoji} size={48} />
        </span>
        <div>
          <b>
            {name} {item.level > 0 && <span className="gear-plus">+{item.level}</span>}
          </b>
          <div className={`r${item.rarity}-text small`}>
            {'★'.repeat(item.rarity)} · {GEAR_SLOT_INFO[item.slot].icon} {GEAR_SLOT_INFO[item.slot].label}
          </div>
          <div className="small muted">{wearer ? `Worn by ${wearer.emoji} ${wearer.name}` : 'Not equipped'} · score {gearScore(item)}</div>
        </div>
      </div>
      <ItemSet item={item} />
      <div className="gear-stats">
        <div className="gear-stat main">
          {formatGearRoll(item.main)}
          {!maxed && <span className="up"> → {formatGearRoll({ stat: item.main.stat, value: nextMain })}</span>}
        </div>
        {item.subs.map((s, i) => (
          <div key={i} className="gear-stat">
            {formatGearRoll(s)}
          </div>
        ))}
        {!maxed && <div className="small muted">A new bonus stat (or a boost) every 3 levels.</div>}
      </div>
      <div className="gear-actions">
        {equipTo && item.equippedTo !== equipTo.id && (
          <button className="btn small primary" disabled={busy} onClick={() => run(() => api.gear.equip(item.id, equipTo.id), sfx.click)}>
            Equip on {equipTo.name}
          </button>
        )}
        {item.equippedTo && (
          <button className="btn small" disabled={busy} onClick={() => run(() => api.gear.equip(item.id, null))}>
            Unequip
          </button>
        )}
        <button
          className="btn small"
          disabled={busy || maxed || profile.wallet.gold < cost}
          onClick={() => run(() => api.gear.upgrade(item.id), sfx.buff)}
        >
          {maxed ? 'Max level' : `Upgrade · 🪙 ${cost}`}
        </button>
        <button className="btn small" disabled={busy} onClick={() => run(() => api.gear.lock(item.id, !item.locked))} title="Locked gear can't be salvaged or sold">
          {item.locked ? '🔓 Unlock' : '🔒 Lock'}
        </button>
        <button
          className="btn small danger"
          disabled={busy || item.locked}
          title={item.locked ? 'Unlock it first' : undefined}
          onClick={() => {
            if (confirm(`Salvage ${name} for ${salvage} gold?`)) void run(() => api.gear.salvage(item.id), sfx.coins);
          }}
        >
          Salvage · 🪙 {salvage}
          {salvageStones(settings, item.rarity) > 0 && ` · 🔨 ${salvageStones(settings, item.rarity)}`}
        </button>
      </div>
      {item.subs.length > 0 && <Forge item={item} busy={busy} run={run} />}
    </div>
  );
}

/** The item's set and its bonuses; for worn gear, which bonuses the wearer has earned. */
function ItemSet({ item }: { item: GearItem }) {
  const content = useContent();
  const { profile } = useProfile();
  const set = item.set ? content.gearSetsById[item.set] : undefined;
  if (!set) return null;
  const worn = item.equippedTo ? wornSets(profile.gear.filter((g) => g.equippedTo === item.equippedTo), content.gearSetsById).find((w) => w.set.id === set.id) : undefined;
  return (
    <div className="gear-set-info">
      <b>
        <IconOr icon={set.icon} emoji={set.emoji} size={16} /> {set.name} set{worn && <span className="muted"> · {worn.pieces} worn</span>}
      </b>
      {set.bonuses.map((b, i) => (
        <span key={i} className={worn ? (worn.pieces >= b.pieces ? 'set-on' : 'set-off') : ''}>
          {b.pieces} pc: {formatGearRoll(b)}
        </span>
      ))}
    </div>
  );
}

/** A hero's set bonuses: each set they wear, its pieces and which bonuses are earned. */
export function SetBonuses({ worn }: { worn: GearItem[] }) {
  const content = useContent();
  const sets = wornSets(worn, content.gearSetsById);
  if (!sets.length) return null;
  return (
    <div className="set-bonuses">
      {sets.map((w) => (
        <div key={w.set.id} className={`set-bonus ${w.bonuses.some((b) => b.active) ? 'active' : ''}`}>
          <b>
            <IconOr icon={w.set.icon} emoji={w.set.emoji} size={16} /> {w.set.name} <span className="muted">×{w.pieces}</span>
          </b>
          {w.bonuses.map((b, i) => (
            <span key={i} className={b.active ? 'set-on' : 'set-off'}>
              {b.pieces} pc: {formatGearRoll(b)}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Reforging: reroll a bonus stat into a random new one (earns a forge point), or,
 * with enough forge points, pick the stat and get its best possible value.
 */
function Forge({
  item,
  busy,
  run,
}: {
  item: GearItem;
  busy: boolean;
  run: (call: () => Promise<{ item: GearItem | null; profile: ReturnType<typeof useProfile>['profile'] }>, after?: () => void) => Promise<void>;
}) {
  const content = useContent();
  const { profile } = useProfile();
  const r = content.settings.reforge;
  const stone = content.materialsById[r.material];
  const stones = profile.materials[r.material] ?? 0;
  const gold = reforgeGold(content.settings, item);
  const canReforge = profile.wallet.gold >= gold && stones >= r.stones;
  // Bonus stats that suit whoever wears the item are marked.
  const wearer = item.equippedTo ? content.charactersById[item.equippedTo] : undefined;
  const build = wearer ? heroBuild(content, wearer) : null;

  return (
    <details className="forge">
      <summary>
        🔨 Forge <small className="muted">· reroll bonus stats</small>
      </summary>
      <div className="forge-head small">
        <span>{build && wearer ? `✓ = fits ${wearer.name}'s build` : 'Equip it to see which stats fit the hero.'}</span>
        <span title={stone?.description}>
          {stone?.emoji ?? '🔨'} {stone?.name ?? 'Stones'}: <b>{stones}</b>
        </span>
      </div>
      {item.subs.map((s, i) => {
        const q = subQuality(s, item.rarity);
        const rolls = subRolls(s, item.rarity);
        return (
          <div key={i} className="forge-row">
            <div className="forge-stat">
              <span>
                {formatGearRoll(s)} {build?.subs.includes(s.stat) && <span className="fits" title="On this hero's recommended build">✓</span>}
              </span>
              <span className="forge-quality" title={`${Math.round(q * 100)}% of the best value for ${rolls} roll${rolls === 1 ? '' : 's'}`}>
                <span style={{ width: `${q * 100}%` }} className={q >= 0.999 ? 'perfect' : ''} />
              </span>
              <small className="muted">{q >= 0.999 ? 'Perfect' : `${Math.round(q * 100)}%`}</small>
            </div>
            <div className="forge-actions">
              <button
                className="btn small"
                disabled={busy || !canReforge}
                onClick={() => run(() => api.gear.reforge(item.id, i), sfx.buff)}
                title="Rerolls this stat into a different random stat with fresh values. Its upgrade rolls are kept."
              >
                🎲 Reforge · 🪙 {gold.toLocaleString()} · 🔨 {r.stones}
              </button>
            </div>
          </div>
        );
      })}
      <p className="small muted">
        Reforging turns a bonus stat into a random different one with fresh values, and keeps its upgrade rolls. Get {stone?.name ?? 'stones'} by salvaging
        ★4/★5 gear and from tower milestones.
      </p>
    </details>
  );
}

/** Modal for choosing what a hero wears in one slot. */
export function GearPicker({ heroId, slot, onClose }: { heroId: string; slot: GearSlot; onClose: () => void }) {
  const content = useContent();
  const { profile } = useProfile();
  const hero = content.charactersById[heroId]!;
  const items = profile.gear.filter((g) => g.slot === slot).sort((a, b) => gearScore(b) - gearScore(a));
  const current = items.find((g) => g.equippedTo === heroId);
  const [selected, setSelected] = useState<string | null>(current?.id ?? items[0]?.id ?? null);
  const item = items.find((g) => g.id === selected);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal gear-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gear-modal-head">
          <h3>
            {GEAR_SLOT_INFO[slot].icon} {GEAR_SLOT_INFO[slot].label} for {hero.emoji} {hero.name}
          </h3>
          <button className="icon-mini" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
        {items.length ? (
          <div className="gear-modal-body">
            <div className="gear-grid">
              {items.map((g) => {
                const wearer = g.equippedTo ? content.charactersById[g.equippedTo] : null;
                return (
                  <GearChip
                    key={g.id}
                    item={g}
                    selected={g.id === selected}
                    onClick={() => setSelected(g.id)}
                    note={wearer ? (g.equippedTo === heroId ? 'Equipped' : wearer.emoji) : undefined}
                  />
                );
              })}
            </div>
            {item && <GearDetail item={item} equipTo={{ id: hero.id, name: hero.name }} onChanged={(g) => !g && setSelected(null)} />}
          </div>
        ) : (
          <p className="muted">No {GEAR_SLOT_INFO[slot].label.toLowerCase()} yet. Gear drops from campaign stages.</p>
        )}
      </div>
    </div>
  );
}
