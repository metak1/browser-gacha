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
  describePassive,
  describeSkill,
  ELEMENT_BEATS,
  ELEMENTS,
  buildMatch,
  gearStatLabel,
  heroBuild,
  applyGearCombat,
  COMBAT_LABEL,
  COMBAT_STATS,
  type CharacterDef,
  type GearItem,
  GEAR_SLOT_INFO,
  GEAR_SLOTS,
  levelUpCost,
  type GearSlot,
  type OwnedCharacterDTO,
  type Skill,
  unitBase,
} from '@gacha/shared';
import { useState } from 'react';
import { api } from '../../api';
import { sfx } from '../../audio/sfx';
import { Icon, UnitArt, PixelEmoji } from '../../components/Art';
import { AscensionPips, CostList } from '../../components/Materials';
import { ROLE_INFO } from '../../components/CharacterCard';
import { GearChip, GearPicker, SetBonuses } from '../../components/Gear';
import { useContent } from '../../state/content';
import { useProfile } from '../../state/profile';
import { useToast } from '../../state/toast';

/** 0.155 → "15.5%". */
const pctText = (n: number) => `${(Math.round(n * 1000) / 10).toString()}%`;

/** One hero's sheet: stats, level-up, ascension, gear, skills and story. */
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

export function CharacterDetail({ charId, owned }: { charId: string; owned?: OwnedCharacterDTO }) {
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
  const { stats: base, combat: combatBase } = unitBase(prog, c, level, con, rank);
  const sets = content.gearSetsById;
  const stats = applyGear(base, worn, sets);
  const next = level < cap ? applyGear(unitBase(prog, c, level + 1, con, rank).stats, worn, sets) : null;
  const cost = levelUpCost(settings, level);
  const bulk5 = bulkLevelUp(settings, level, cap, profile.wallet.gold, 5);
  const bulkMax = bulkLevelUp(settings, level, cap, profile.wallet.gold, cap - level);
  // What auto-equip would add: the best free gear per slot, compared with what's worn.
  const combat = applyGearCombat(combatBase, worn, sets);
  const targetSet = owned?.gearSet && sets[owned.gearSet] ? owned.gearSet : null;
  const best = bestLoadout(base, profile.gear, charId, sets, combatBase, targetSet);
  const bestGear = best.flatMap((s) => (s.best ? [s.best] : []));
  const loadoutGain = owned
    ? statPower(applyGear(base, bestGear, sets), applyGearCombat(combatBase, bestGear, sets)) - statPower(applyGear(base, worn, sets), combat)
    : 0;
  const inTeam = profile.team.includes(charId);
  const atCap = level >= cap;

  const step = nextAscension(prog, rank);
  const essence = essenceFor(content, c.element);
  const ascendCost = step
    ? [...(step.essence && essence ? [{ id: essence.id, count: step.essence }] : []), ...(step.crystals ? [{ id: prog.crystal, count: step.crystals }] : [])]
    : [];
  const canAscend = Boolean(step) && profile.wallet.gold >= (step?.gold ?? 0) && ascendCost.every((m) => (profile.materials[m.id] ?? 0) >= m.count);

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
              <button className="btn primary" disabled={atCap || profile.wallet.gold < cost} onClick={() => mutate(() => api.levelUp(charId))}>
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
                  {!canAscend && essence && (
                    <p className="small muted">
                      {essence.name} drops from {c.element} enemies, or buy it in Roster → Materials.
                    </p>
                  )}
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
              <span className="gear-head-actions">
                {owned && (
                  <label className="small" title="Auto-equip fills every slot it can with this set first, then takes the strongest gear for the rest.">
                    Aim for{' '}
                    <select className="sort-select" value={targetSet ?? ''} onChange={(e) => void mutate(() => api.setGearSet(charId, e.target.value || null))}>
                      <option value="">Strongest</option>
                      {content.bundle.gearSets.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.emoji} {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button
                  className="btn small"
                  disabled={!best.some((s) => s.best && s.best.id !== s.current?.id)}
                  onClick={() => mutate(() => api.autoEquip(charId), 'Equipped the best gear')}
                  title={`Puts on the best free gear from your bag${targetSet ? `, ${sets[targetSet]!.name} pieces first` : ''}. Gear worn by other heroes is left alone.`}
                >
                  ✨ Auto-equip
                  {best.some((s) => s.best && s.best.id !== s.current?.id)
                    ? loadoutGain
                      ? ` · ${loadoutGain > 0 ? '+' : ''}${loadoutGain.toLocaleString()} power`
                      : ''
                    : ' · already best'}
                </button>
              </span>
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
function SkillCard({ label, skill, charId, slot, level }: { label: string; skill: Skill; charId?: string; slot?: 'skill' | 'ultimate'; level?: number }) {
  const { mutate } = useProfile();
  const content = useContent();
  const prog = content.settings.progression;
  const lv = level ?? 1;
  const max = maxSkillLevel(prog);
  const leveled = slot ? levelSkill(skill, lv, prog.skillLevelBonus) : skill;
  const nextCost = slot && level !== undefined ? skillLevelCost(prog, lv) : null;
  const nextSkill = nextCost ? levelSkill(skill, lv + 1, prog.skillLevelBonus) : null;
  const { profile } = useProfile();
  const affordable = nextCost ? profile.wallet.gold >= nextCost.gold && (profile.materials[prog.tome] ?? 0) >= nextCost.tomes : false;

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
