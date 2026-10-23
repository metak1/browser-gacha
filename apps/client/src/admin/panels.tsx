import { FEATURE_INFO, FEATURES, type AdminPlayerDTO, type ArenaTier, type GameSettings, type GachaRules, type ProgressionSettings } from '@gacha/shared';
import { RewardEditor } from './RewardEditor';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError, errorMessage } from '../api';
import { useContent, useContentState } from '../state/content';
import { useProfile } from '../state/profile';
import { useToast } from '../state/toast';
import { Check, Field, FormGrid, MultiPick, NumberInput, Section } from './fields';
import { SocialSettings } from './SocialSettings';

// ---------- settings ----------

export function SettingsPanel() {
  const content = useContent();
  const { setBundle } = useContentState();
  const toast = useToast();
  const [draft, setDraft] = useState<GameSettings>(() => structuredClone(content.settings));
  const [errors, setErrors] = useState<string[]>([]);
  useEffect(() => setDraft(structuredClone(content.settings)), [content.settings]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(content.settings);
  const set = <K extends keyof GameSettings>(k: K, v: GameSettings[K]) => setDraft({ ...draft, [k]: v });
  const setGacha = (k: keyof GachaRules, v: number) => set('gacha', { ...draft.gacha, [k]: v });
  type NumKey = { [K in keyof GameSettings]: GameSettings[K] extends number ? K : never }[keyof GameSettings];
  const num = (label: string, k: NumKey, hint?: string) => (
    <Field label={label} hint={hint}>
      <NumberInput value={draft[k]} onChange={(v) => set(k, v)} min={0} />
    </Field>
  );
  const pct = (label: string, k: keyof GachaRules, hint?: string) => (
    <Field label={label} hint={hint}>
      <NumberInput value={+(draft.gacha[k] * 100).toFixed(3)} onChange={(v) => setGacha(k, v / 100)} step={0.1} min={0} max={100} />
    </Field>
  );
  const pull = (label: string, k: keyof GachaRules, hint?: string) => (
    <Field label={label} hint={hint}>
      <NumberInput value={draft.gacha[k]} onChange={(v) => setGacha(k, v)} min={1} />
    </Field>
  );

  async function save() {
    try {
      setBundle(await api.admin.saveSettings(draft));
      setErrors([]);
      toast('Settings saved');
    } catch (err) {
      setErrors(err instanceof ApiError ? err.message.split(/\n|; /) : [errorMessage(err)]);
    }
  }

  return (
    <div className="ed-form solo">
      <div className="ed-toolbar">
        <h2>Game settings {dirty && <span className="ed-dirty">● unsaved</span>}</h2>
        <div className="ed-actions">
          {dirty && (
            <button className="btn small" onClick={() => setDraft(structuredClone(content.settings))}>
              Revert
            </button>
          )}
          <button className="btn small primary" disabled={!dirty} onClick={save}>
            Save
          </button>
        </div>
      </div>
      {errors.length > 0 && (
        <div className="ed-errors">
          <b>Can't save:</b>
          <ul>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}
      <Section title="Economy">
        <FormGrid>
          {num('Summon cost 💎', 'pullCost')}
          {num('Starting gems 💎', 'startingGems', 'For newly created players.')}
          {num('Starting gold 🪙', 'startingGold')}
          {num('Daily gems 💎', 'dailyGems')}
          {num('Daily gold 🪙', 'dailyGold')}
          {num('Stardust per summon ✨', 'stardustExchangeCost', 'Stardust traded for one summon’s worth of gems.')}
        </FormGrid>
        <FormGrid>
          {(['r3', 'r4', 'r5'] as const).map((r) => (
            <Field key={r} label={`Stardust per ${'★'.repeat(Number(r[1]))} duplicate`} hint={r === 'r5' ? 'Doubled once C6 is reached.' : undefined}>
              <NumberInput value={draft.stardustPerDupe[r]} onChange={(v) => set('stardustPerDupe', { ...draft.stardustPerDupe, [r]: v })} min={0} />
            </Field>
          ))}
        </FormGrid>
        <FormGrid>
          <Field label="First 10× summon" hint="The new-player tutorial ends on it.">
            <Check checked={draft.firstSummon.free} onChange={(free) => set('firstSummon', { ...draft.firstSummon, free })} label="Free" />
          </Field>
          <Field label="First 10× ★5" hint="If none rolls, the last pull is a ★5. Banner rules and the 50/50 still apply.">
            <Check checked={draft.firstSummon.guarantee5} onChange={(guarantee5) => set('firstSummon', { ...draft.firstSummon, guarantee5 })} label="Guaranteed" />
          </Field>
        </FormGrid>
      </Section>
      <Section title="Progression">
        <FormGrid>
          {num('Max level', 'maxLevel')}
          {num('Team size', 'maxTeamSize', '1–6 heroes.')}
          {num('Level-up base cost 🪙', 'levelCostBase')}
          {num('Level-up cost per level 🪙', 'levelCostPerLevel', `Lv1→2 costs ${draft.levelCostBase + draft.levelCostPerLevel}, Lv20→21 costs ${draft.levelCostBase + draft.levelCostPerLevel * 20}.`)}
        </FormGrid>
        <Field label={`Starter heroes (${draft.starterCharacters.length}) for new players`} wide>
          <MultiPick
            values={draft.starterCharacters}
            onChange={(v) => set('starterCharacters', v)}
            max={draft.maxTeamSize}
            options={[...content.bundle.characters]
              .sort((a, b) => a.rarity - b.rarity)
              .map((c) => ({ value: c.id, label: `${c.emoji} ${c.name} ${'★'.repeat(c.rarity)}` }))}
          />
        </Field>
      </Section>
      <Section title="Gear">
        <FormGrid>
          {num('Max gear level', 'gearMaxLevel')}
          {num('Upgrade base cost 🪙', 'gearUpgradeBase')}
          {num('Upgrade cost per level 🪙', 'gearUpgradePerLevel', 'Scaled by rarity (×0.8 / ×1 / ×1.25).')}
          {num('Salvage base 🪙', 'gearSalvageBase', 'A +0 ★3 item. Scales with rarity and level.')}
          {num('Inventory size', 'gearInventoryCap', 'Drops are lost when the bag is full.')}
        </FormGrid>
      </Section>
      <Section title="Arena">
        <FormGrid>
          {num('Tickets per day 🎟️', 'arenaTicketsPerDay')}
          {num('Starting rating', 'arenaStartRating')}
          {num('Rating K-factor', 'arenaK', 'Bigger = faster rating swings. Defenders move by half.')}
          {num('Win gold 🪙', 'arenaWinGold')}
          {num('Win gems 💎', 'arenaWinGems')}
        </FormGrid>
        <TierEditor tiers={draft.arenaTiers} onChange={(t) => set('arenaTiers', t)} />
      </Section>
      <Section title="Hard mode & dungeons">
        <FormGrid>
          <Field label="Hard mode" hint="Replays cleared chapters with stronger enemies.">
            <Check checked={draft.hardMode.enabled} onChange={(enabled) => set('hardMode', { ...draft.hardMode, enabled })} label="Enabled" />
          </Field>
          <Field label="Enemy level bonus">
            <NumberInput value={draft.hardMode.levelBonus} onChange={(levelBonus) => set('hardMode', { ...draft.hardMode, levelBonus })} min={0} />
          </Field>
          <Field label="Enemy stat ×" hint="Multiplies HP, ATK and DEF.">
            <NumberInput value={draft.hardMode.statMult} onChange={(statMult) => set('hardMode', { ...draft.hardMode, statMult })} step={0.05} min={0.1} />
          </Field>
          <Field label="Gold & material ×">
            <NumberInput value={draft.hardMode.rewardMult} onChange={(rewardMult) => set('hardMode', { ...draft.hardMode, rewardMult })} step={0.1} min={0} />
          </Field>
          <Field label="Gear drop chance ×" hint="Capped at 100%.">
            <NumberInput value={draft.hardMode.gearChanceMult} onChange={(gearChanceMult) => set('hardMode', { ...draft.hardMode, gearChanceMult })} step={0.1} min={0} />
          </Field>
          <Field label="Hard first-clear gems 💎">
            <NumberInput value={draft.hardMode.firstClearGems} onChange={(firstClearGems) => set('hardMode', { ...draft.hardMode, firstClearGems })} min={0} />
          </Field>
          {num('Dungeon runs per day', 'dungeonRunsPerDay', 'Winning runs per dungeon per UTC day. Losses are free.')}
          {num('Most runs per sweep', 'maxSweep', 'Sweeps instantly repeat 3★ stages, hard clears and cleared dungeon tiers.')}
        </FormGrid>
      </Section>
      <SocialSettings draft={draft} set={set} />
      <Section title="Stamina">
        <FormGrid>
          {(
            [
              ['max', 'Max stamina', 'Regenerates up to this. Refills can go above it.'],
              ['regenMinutes', 'Minutes per point'],
              ['campaignCost', 'Campaign battle / sweep cost', 'Refunded when the battle is lost.'],
              ['hardCost', 'Hard battle / sweep cost'],
              ['refillGems', 'Refill price 💎'],
              ['refillAmount', 'Refill amount'],
            ] as const
          ).map(([k, label, hint]) => (
            <Field key={k} label={label} hint={hint}>
              <NumberInput value={draft.stamina[k]} onChange={(v) => set('stamina', { ...draft.stamina, [k]: v })} min={0} step={k === 'regenMinutes' ? 0.5 : 1} />
            </Field>
          ))}
        </FormGrid>
      </Section>
      <Section title="Feature unlocks">
        <p className="small muted">New players see these features locked until they clear the chosen stage.</p>
        <FormGrid>
          {FEATURES.map((f) => (
            <Field key={f} label={`${FEATURE_INFO[f].label} opens after`}>
              <select
                value={draft.unlocks[f] ?? ''}
                onChange={(e) => set('unlocks', { ...draft.unlocks, [f]: e.target.value || null })}
              >
                <option value="">Always open</option>
                {content.stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id} · {s.name}
                  </option>
                ))}
              </select>
            </Field>
          ))}
        </FormGrid>
      </Section>
      <Section title="Gear forge">
        <p className="small muted">
          Reforging rerolls one bonus stat into a random different stat, keeping its upgrade rolls. The result is always random.
        </p>
        <FormGrid>
          {(
            [
              ['gold', 'Gold per reforge 🪙', 'Scaled by rarity (×0.8 / ×1 / ×1.25).'],
              ['stones', 'Stones per reforge'],
            ] as const
          ).map(([k, label, hint]) => (
            <Field key={k} label={label} hint={hint}>
              <NumberInput value={draft.reforge[k]} onChange={(v) => set('reforge', { ...draft.reforge, [k]: v })} min={0} />
            </Field>
          ))}
          {(['r3', 'r4', 'r5'] as const).map((r) => (
            <Field key={r} label={`Stones from salvaging ${'★'.repeat(Number(r[1]))}`}>
              <NumberInput
                value={draft.reforge.salvageStones[r]}
                onChange={(v) => set('reforge', { ...draft.reforge, salvageStones: { ...draft.reforge.salvageStones, [r]: v } })}
                min={0}
              />
            </Field>
          ))}
        </FormGrid>
      </Section>
      <Section title="Endless tower">
        <p className="small muted">
          Floors are generated: enemies gain a level per floor up to the level cap, then keep growing through the stat multiplier. Tune with the tower simulation
          in the README.
        </p>
        <FormGrid>
          {(
            [
              ['startLevel', 'Enemy level on floor 1', 1],
              ['baseMult', 'Base stat ×', 0.05],
              ['multPerFloor', 'Stat × added per floor', 0.001],
              ['multPastCap', 'Extra growth per floor past the level cap', 0.005],
              ['bossEvery', 'Boss every N floors', 1],
              ['bossMult', 'Boss floor stat ×', 0.05],
              ['wavesFrom', 'Second wave from floor', 1],
              ['floorGems', 'Gems per floor 💎', 1],
              ['floorGold', 'Gold per floor 🪙', 10],
              ['floorGoldPerFloor', 'Extra gold per floor number 🪙', 5],
              ['milestoneEvery', 'Milestone every N floors', 1],
            ] as const
          ).map(([k, label, step]) => (
            <Field key={k} label={label}>
              <NumberInput value={draft.tower[k]} onChange={(v) => set('tower', { ...draft.tower, [k]: v })} min={0} step={step} />
            </Field>
          ))}
        </FormGrid>
        <h4 className="sub-head">Milestone reward (on top of the floor reward)</h4>
        <RewardEditor value={draft.tower.milestoneReward} onChange={(milestoneReward) => set('tower', { ...draft.tower, milestoneReward })} />
      </Section>
      <ProgressionEditor value={draft.progression} maxLevel={draft.maxLevel} onChange={(p) => set('progression', p)} />
      <Section title="Gacha rates">
        <FormGrid>
          {pct('★5 base rate %', 'base5')}
          {pull('★5 soft pity from pull', 'softPity5')}
          {pct('★5 soft pity step %', 'softStep5', 'Added to the rate per pull past soft pity.')}
          {pull('★5 hard pity', 'hardPity5', 'Guaranteed by this pull.')}
          {pct('★4 base rate %', 'base4')}
          {pull('★4 soft pity from pull', 'softPity4')}
          {pct('★4 soft pity step %', 'softStep4')}
          {pull('★4 hard pity', 'hardPity4')}
        </FormGrid>
      </Section>
    </div>
  );
}

/** Ascension steps, skill levels and the material shop. */
function ProgressionEditor({ value, maxLevel, onChange }: { value: ProgressionSettings; maxLevel: number; onChange: (p: ProgressionSettings) => void }) {
  const content = useContent();
  const matOptions = content.bundle.materials.map((m) => ({ value: m.id, label: `${m.emoji} ${m.name}` }));
  const set = <K extends keyof ProgressionSettings>(k: K, v: ProgressionSettings[K]) => onChange({ ...value, [k]: v });
  const setStep = (i: number, patch: Partial<ProgressionSettings['ascension'][number]>) =>
    set('ascension', value.ascension.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const setSkill = (i: number, patch: Partial<ProgressionSettings['skillLevels'][number]>) =>
    set('skillLevels', value.skillLevels.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const setShop = (i: number, patch: Partial<ProgressionSettings['shop'][number]>) =>
    set('shop', value.shop.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const lastCap = value.ascension[value.ascension.length - 1]?.cap ?? value.baseCap;
  return (
    <Section title="Hero progression">
      <FormGrid>
        <Field label="Level cap before ascension">
          <NumberInput value={value.baseCap} onChange={(v) => set('baseCap', v)} min={1} />
        </Field>
        <Field label="Ascension crystal" hint="Material used as “crystals” in the steps below.">
          <select className="f-select" value={value.crystal} onChange={(e) => set('crystal', e.target.value)}>
            {matOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Skill tome" hint="Material used to level skills.">
          <select className="f-select" value={value.tome} onChange={(e) => set('tome', e.target.value)}>
            {matOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Skill power per level %" hint="Damage/heal/shield multipliers gain this much per level above 1.">
          <NumberInput value={Math.round(value.skillLevelBonus * 100)} onChange={(v) => set('skillLevelBonus', Math.max(0, v) / 100)} min={0} />
        </Field>
      </FormGrid>

      <div className="ed-section-head"><span className="f-label">Ascension steps (essence = the hero's own element)</span>
        <button className="btn small" disabled={value.ascension.length >= 12}
          onClick={() => set('ascension', [...value.ascension, { cap: Math.min(maxLevel, lastCap + 10), gold: 10000, essence: 10, crystals: 2, statBonus: 0.05 }])}>+ Step</button>
      </div>
      {value.ascension.map((s, i) => (
        <div key={i} className="effect-row">
          <span className="effect-n">{i + 1}</span>
          <label className="inline">cap <NumberInput value={s.cap} onChange={(v) => setStep(i, { cap: v })} min={1} /></label>
          <label className="inline">🪙 <NumberInput value={s.gold} onChange={(v) => setStep(i, { gold: v })} min={0} /></label>
          <label className="inline">essence <NumberInput value={s.essence} onChange={(v) => setStep(i, { essence: v })} min={0} /></label>
          <label className="inline">crystals <NumberInput value={s.crystals} onChange={(v) => setStep(i, { crystals: v })} min={0} /></label>
          <label className="inline">stats +% <NumberInput value={Math.round(s.statBonus * 100)} onChange={(v) => setStep(i, { statBonus: Math.max(0, v) / 100 })} min={0} /></label>
          <span className="effect-tools"><button className="icon-mini danger" onClick={() => set('ascension', value.ascension.filter((_, j) => j !== i))}>✕</button></span>
        </div>
      ))}

      <div className="ed-section-head"><span className="f-label">Skill level costs (max level {value.skillLevels.length + 1})</span>
        <button className="btn small" disabled={value.skillLevels.length >= 9}
          onClick={() => set('skillLevels', [...value.skillLevels, { gold: 10000, tomes: 5 }])}>+ Level</button>
      </div>
      {value.skillLevels.map((s, i) => (
        <div key={i} className="effect-row">
          <span className="effect-n">{i + 2}</span>
          <label className="inline">🪙 <NumberInput value={s.gold} onChange={(v) => setSkill(i, { gold: v })} min={0} /></label>
          <label className="inline">tomes <NumberInput value={s.tomes} onChange={(v) => setSkill(i, { tomes: v })} min={0} /></label>
          <span className="effect-tools"><button className="icon-mini danger" onClick={() => set('skillLevels', value.skillLevels.filter((_, j) => j !== i))}>✕</button></span>
        </div>
      ))}

      <div className="ed-section-head"><span className="f-label">Material shop (prices per unit)</span>
        <button className="btn small" disabled={!matOptions.length || value.shop.length >= 30}
          onClick={() => set('shop', [...value.shop, { material: matOptions[0]!.value, gold: 1000, stardust: 0 }])}>+ Item</button>
      </div>
      {value.shop.map((s, i) => (
        <div key={i} className="effect-row">
          <select className="f-select" value={s.material} onChange={(e) => setShop(i, { material: e.target.value })}>
            {matOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <label className="inline">🪙 <NumberInput value={s.gold} onChange={(v) => setShop(i, { gold: v })} min={0} /></label>
          <label className="inline">✨ <NumberInput value={s.stardust} onChange={(v) => setShop(i, { stardust: v })} min={0} /></label>
          <span className="effect-tools"><button className="icon-mini danger" onClick={() => set('shop', value.shop.filter((_, j) => j !== i))}>✕</button></span>
        </div>
      ))}
    </Section>
  );
}

/** Weekly arena tiers: each pays its reward to players in it when the season ends. */
function TierEditor({ tiers, onChange }: { tiers: ArenaTier[]; onChange: (t: ArenaTier[]) => void }) {
  const set = (i: number, patch: Partial<ArenaTier>) => onChange(tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const setReward = (i: number, k: keyof ArenaTier['reward'], v: number) => set(i, { reward: { ...tiers[i]!.reward, [k]: v } });
  return (
    <div className="tier-editor">
      <div className="ed-section-head">
        <span className="f-label">Tiers & weekly rewards (one must start at 0)</span>
        <button
          className="btn small"
          onClick={() => {
            const top = Math.max(0, ...tiers.map((t) => t.minRating));
            onChange([...tiers, { name: 'New tier', icon: '🏅', minRating: top + 200, reward: { gems: 0, gold: 0, stardust: 0, materials: [] } }]);
          }}
        >
          + Add tier
        </button>
      </div>
      {[...tiers.keys()]
        .sort((a, b) => tiers[a]!.minRating - tiers[b]!.minRating)
        .map((i) => {
          const t = tiers[i]!;
          return (
            <div key={i} className="effect-row">
              <input className="tier-icon" value={t.icon} onChange={(e) => set(i, { icon: e.target.value })} />
              <input value={t.name} onChange={(e) => set(i, { name: e.target.value })} />
              <label className="inline">
                from
                <NumberInput value={t.minRating} onChange={(v) => set(i, { minRating: v })} min={0} />
              </label>
              <label className="inline">
                💎
                <NumberInput value={t.reward.gems} onChange={(v) => setReward(i, 'gems', v)} min={0} />
              </label>
              <label className="inline">
                🪙
                <NumberInput value={t.reward.gold} onChange={(v) => setReward(i, 'gold', v)} min={0} />
              </label>
              <label className="inline">
                ✨
                <NumberInput value={t.reward.stardust} onChange={(v) => setReward(i, 'stardust', v)} min={0} />
              </label>
              <span className="effect-tools">
                <button className="icon-mini danger" disabled={tiers.length <= 1} onClick={() => onChange(tiers.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </span>
            </div>
          );
        })}
    </div>
  );
}

// ---------- players ----------

export function PlayersPanel() {
  const { profile } = useProfile();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [players, setPlayers] = useState<AdminPlayerDTO[]>([]);
  const [selected, setSelected] = useState<AdminPlayerDTO | null>(null);

  useEffect(() => {
    const t = setTimeout(() => api.admin.players(query).then(setPlayers, (e) => toast(errorMessage(e), 'error')), 250);
    return () => clearTimeout(t);
  }, [query, toast]);

  const update = (p: AdminPlayerDTO) => {
    setSelected(p);
    setPlayers((list) => list.map((x) => (x.id === p.id ? p : x)));
  };

  return (
    <div className="ed">
      <aside className="ed-list">
        <div className="ed-list-head">
          <h2>Players</h2>
        </div>
        <input className="ed-search" placeholder="Username or id…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="ed-items">
          {players.map((p) => (
            <button key={p.id} className={`ed-item ${selected?.id === p.id ? 'active' : ''}`} onClick={() => setSelected(p)}>
              <span>{p.username ?? <i className="muted">guest {p.id.slice(0, 8)}</i>}</span>
              {p.role === 'admin' && <small className="tag ok">Admin</small>}
              {p.id === profile.user.id && <small className="tag">You</small>}
            </button>
          ))}
          {!players.length && <p className="muted small">No players found.</p>}
        </div>
        <small className="muted">Showing up to 50, newest first</small>
      </aside>
      <section className="ed-form">
        {selected ? <PlayerDetail key={selected.id} player={selected} onUpdate={update} isSelf={selected.id === profile.user.id} /> : <p className="muted center">Pick a player.</p>}
      </section>
    </div>
  );
}

function PlayerDetail({ player, onUpdate, isSelf }: { player: AdminPlayerDTO; onUpdate: (p: AdminPlayerDTO) => void; isSelf: boolean }) {
  const toast = useToast();
  const { mutate } = useProfile();
  const content = useContent();
  const [gems, setGems] = useState(0);
  const [gold, setGold] = useState(0);
  const [stardust, setStardust] = useState(0);
  const [allCharacters, setAll] = useState(false);
  const [level, setLevel] = useState(0);
  const [materialsEach, setMaterialsEach] = useState(0);

  async function grant() {
    try {
      const p = await api.admin.grant(player.id, {
        gems,
        gold,
        stardust,
        allCharacters,
        ...(level ? { level } : {}),
        ...(materialsEach ? { materialsEach } : {}),
      });
      onUpdate(p);
      toast('Granted');
      // If it was you, refresh your own wallet/roster too.
      if (isSelf) await mutate(api.me);
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  async function toggleRole() {
    try {
      onUpdate(await api.admin.setRole(player.id, player.role === 'admin' ? 'player' : 'admin'));
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  return (
    <>
      <div className="ed-toolbar">
        <h2>{player.username ?? 'Guest'}</h2>
        <div className="ed-actions">
          <button className="btn small" onClick={toggleRole} disabled={isSelf}>
            {player.role === 'admin' ? 'Remove admin' : 'Make admin'}
          </button>
        </div>
      </div>
      <Section title="Overview">
        <div className="player-stats">
          <span>ID <code>{player.id}</code></span>
          <span>Joined {new Date(player.createdAt).toLocaleDateString()}</span>
          <span>💎 {player.wallet.gems.toLocaleString()}</span>
          <span>🪙 {player.wallet.gold.toLocaleString()}</span>
          <span>✨ {player.wallet.stardust.toLocaleString()}</span>
          <span>Heroes {player.characters}</span>
          <span>Stages cleared {player.clears}</span>
        </div>
      </Section>
      <Section title="Grant">
        <FormGrid>
          <Field label="Gems 💎" hint="Negative numbers take away.">
            <NumberInput value={gems} onChange={setGems} />
          </Field>
          <Field label="Gold 🪙">
            <NumberInput value={gold} onChange={setGold} />
          </Field>
          <Field label="Stardust ✨">
            <NumberInput value={stardust} onChange={setStardust} />
          </Field>
          <Field label="Set all heroes to level" hint="0 = leave levels alone.">
            <NumberInput value={level} onChange={setLevel} min={0} max={content.settings.maxLevel} />
          </Field>
          <Field label="Each material ×" hint="Gives this many of every material. 0 = none.">
            <NumberInput value={materialsEach} onChange={setMaterialsEach} min={0} />
          </Field>
          <Field label="Roster">
            <Check checked={allCharacters} onChange={setAll} label={`Unlock all ${content.bundle.characters.length} heroes`} />
          </Field>
        </FormGrid>
        <button className="btn primary" onClick={grant}>
          Grant
        </button>
      </Section>
    </>
  );
}

// ---------- import / export ----------

export function DataPanel() {
  const content = useContent();
  const { setBundle } = useContentState();
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const b = content.bundle;

  function exportJson() {
    const blob = new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `starlit-content-v${b.version}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importJson(f: File) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await f.text());
    } catch {
      setErrors(['That file is not valid JSON.']);
      return;
    }
    if (!confirm('Replace ALL game content with this file? Current content will be overwritten.')) return;
    try {
      setBundle(await api.admin.importBundle(parsed));
      setErrors([]);
      toast('Content imported');
    } catch (err) {
      setErrors(err instanceof ApiError ? err.message.split(/\n|; /) : [errorMessage(err)]);
    }
  }

  async function reset() {
    if (!confirm('Reset ALL content to the built-in defaults? Your custom units, spells and stages will be lost.')) return;
    try {
      setBundle(await api.admin.reset());
      toast('Content reset to defaults');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  return (
    <div className="ed-form solo">
      <div className="ed-toolbar">
        <h2>Content data</h2>
      </div>
      <Section title="Overview">
        <div className="player-stats">
          <span>Version {b.version}</span>
          <span>{b.characters.length} units</span>
          <span>{b.enemies.length} enemies</span>
          <span>{b.skills.length} spells</span>
          <span>{b.chapters.length} chapters</span>
          <span>{b.stages.length} stages</span>
          <span>{b.banners.length} banners</span>
          <span>{b.missions.length} missions</span>
        </div>
        <p className="small muted">
          Every save bumps the version. Battles already in progress keep the units and spells they started with.
        </p>
      </Section>
      <Section title="Backup & restore">
        <div className="data-actions">
          <button className="btn" onClick={exportJson}>
            ⬇ Export JSON
          </button>
          <button className="btn" onClick={() => file.current?.click()}>
            ⬆ Import JSON…
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importJson(f);
            }}
          />
          <button className="btn danger" onClick={reset}>
            Reset to defaults
          </button>
        </div>
        {errors.length > 0 && (
          <div className="ed-errors">
            <b>Import rejected:</b>
            <ul>{errors.slice(0, 30).map((e, i) => <li key={i}>{e}</li>)}</ul>
          </div>
        )}
      </Section>
    </div>
  );
}
