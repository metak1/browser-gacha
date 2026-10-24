import { ELEMENTS, maxAscension, type GuildDTO, type GuildSummaryDTO, type SocialDTO, type SupportHeroDTO } from '@gacha/shared';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { TeamSwitcher } from '../components/TeamSwitcher';
import { api, errorMessage } from '../api';
import { sfx } from '../audio/sfx';
import { UnitArt } from '../components/Art';
import { GearChip } from '../components/Gear';
import { AscensionPips, RewardList } from '../components/Materials';
import { useContent } from '../state/content';
import { useProfile } from '../state/profile';
import { useToast } from '../state/toast';
import './social.css';

export function SocialScreen() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'guild' ? 'guild' : 'friends';
  return (
    <div className="social-page">
      <div className="page-head">
        <h1>Social</h1>
        <div className="filters">
          <button className={`chip ${tab === 'friends' ? 'active' : ''}`} onClick={() => setParams({})}>
            🤝 Friends
          </button>
          <button className={`chip ${tab === 'guild' ? 'active' : ''}`} onClick={() => setParams({ tab: 'guild' })}>
            🛡️ Guild
          </button>
        </div>
      </div>
      {tab === 'friends' ? <Friends /> : <Guild />}
    </div>
  );
}

// ---------- friends ----------

function Friends() {
  const content = useContent();
  const { profile, mutate } = useProfile();
  const toast = useToast();
  const [data, setData] = useState<SocialDTO | null>(null);
  const [code, setCode] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const run = useCallback(
    async (call: () => Promise<SocialDTO>, ok?: string) => {
      try {
        setData(await call());
        if (ok) toast(ok);
      } catch (err) {
        toast(errorMessage(err), 'error');
      }
    },
    [toast],
  );
  useEffect(() => void run(api.social.get), [run]);
  if (!data) return <p className="center muted">Loading…</p>;

  const support = profile.account.supportChar ? content.charactersById[profile.account.supportChar] : undefined;
  const incoming = data.requests.filter((r) => r.incoming);
  const outgoing = data.requests.filter((r) => !r.incoming);

  return (
    <div className="social-grid">
      <section className="panel">
        <h3>Your friend code</h3>
        <div className="friend-code">
          <code>{data.code}</code>
          <button className="btn small" onClick={() => void navigator.clipboard?.writeText(data.code).then(() => toast('Copied!'))}>
            Copy
          </button>
        </div>
        <p className="small muted">Share it so others can add you. Friends can borrow your support hero once a day, and you earn gold each time.</p>
        <h3>Support hero</h3>
        <div className="support-pick">
          {support && <UnitArt sprite={support.sprite} emoji={support.emoji} height="40px" />}
          <select
            className="sort-select"
            value={profile.account.supportChar ?? ''}
            onChange={(e) => void mutate(() => api.setSupport(e.target.value), 'Support hero set')}
          >
            {profile.roster
              .filter((c) => content.charactersById[c.id])
              .sort((a, b) => b.level - a.level)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {content.charactersById[c.id]!.name} · Lv {c.level}
                </option>
              ))}
          </select>
        </div>
        {data.mySupport && <SupportCard hero={data.mySupport} />}
        <h3>Add a friend</h3>
        <form
          className="friend-add"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) void run(() => api.social.add(code), 'Request sent').then(() => setCode(''));
          }}
        >
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="FRIEND CODE" maxLength={12} />
          <button className="btn primary small" disabled={!code.trim()}>
            Send
          </button>
        </form>
        {(incoming.length > 0 || outgoing.length > 0) && <h3>Requests</h3>}
        {incoming.map((r) => (
          <div key={r.id} className="request-row">
            <span>
              <b>{r.name}</b> <small className="muted">Lv {r.level}</small>
            </span>
            <span>
              <button className="btn small primary" onClick={() => void run(() => api.social.accept(r.id), `You and ${r.name} are friends!`)}>
                Accept
              </button>{' '}
              <button className="btn small" onClick={() => void run(() => api.social.remove(r.id))}>
                Decline
              </button>
            </span>
          </div>
        ))}
        {outgoing.map((r) => (
          <div key={r.id} className="request-row">
            <span className="muted">
              Waiting for <b>{r.name}</b>
            </span>
            <button className="btn small" onClick={() => void run(() => api.social.remove(r.id))}>
              Cancel
            </button>
          </div>
        ))}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>Friends</h3>
          <span className="muted small">
            {data.friends.length}/{data.maxFriends}
          </span>
        </div>
        {!data.friends.length && <p className="muted">No friends yet. Trade friend codes to add some!</p>}
        <div className="friend-list">
          {data.friends.map((f) => {
            const c = f.support ? content.charactersById[f.support.charId] : undefined;
            return (
              <div key={f.id} className={`friend-entry ${open === f.id ? 'open' : ''}`}>
                <div className="friend-row">
                  <span className="friend-art">{c ? <UnitArt sprite={c.sprite} emoji={c.emoji} height="40px" /> : '❔'}</span>
                  <button className="friend-info" onClick={() => setOpen(open === f.id ? null : f.id)} title="Show support hero">
                    <b>{f.name}</b>
                    {f.title && <span className="title-tag">{f.title}</span>}
                    <small className="muted">
                      Lv {f.level}
                      {c && f.support && ` · lends ${c.name} Lv ${f.support.level}`}
                      {f.usedToday && ' · helped today'}
                    </small>
                    {f.support && <small className="friend-more">{open === f.id ? '▲ hide' : '▼ stats & gear'}</small>}
                  </button>
                  <button
                    className="icon-mini danger"
                    title="Remove friend"
                    onClick={() => {
                      if (window.confirm(`Remove ${f.name} from your friends?`)) void run(() => api.social.remove(f.id));
                    }}
                  >
                    ✕
                  </button>
                </div>
                {open === f.id && f.support && <SupportCard hero={f.support} />}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/** A support hero as friends get it in battle: final stats (gear, ascension, passive) and equipped gear. */
function SupportCard({ hero }: { hero: SupportHeroDTO }) {
  const content = useContent();
  const c = content.charactersById[hero.charId];
  if (!c) return null;
  const el = ELEMENTS[c.element];
  const stats: [string, number][] = [
    ['HP', hero.stats.hp],
    ['ATK', hero.stats.atk],
    ['DEF', hero.stats.def],
    ['SPD', hero.stats.spd],
  ];
  return (
    <div className="support-card">
      <div className="support-head">
        <span className="support-art">
          <UnitArt sprite={c.sprite} emoji={c.emoji} height="56px" />
        </span>
        <div>
          <b>{c.name}</b>
          <div className="small">
            <span className={`r${c.rarity}-text`}>{'★'.repeat(c.rarity)}</span> · {el.icon} {el.label} · Lv {hero.level}
            {hero.constellation > 0 && ` · C${hero.constellation}`}
          </div>
          <div className="small muted">
            <AscensionPips rank={hero.ascension} max={maxAscension(content.settings.progression)} size="sm" /> Skill Lv {hero.skillLevel} · Ult Lv{' '}
            {hero.ultLevel}
          </div>
        </div>
      </div>
      <div className="support-stats">
        {stats.map(([k, v]) => (
          <span key={k}>
            <small className="muted">{k}</small>
            <b>{v.toLocaleString()}</b>
          </span>
        ))}
      </div>
      {c.passive && <div className="small muted">✦ {c.passive.name}</div>}
      <div className="support-gear">
        {hero.gear.length ? hero.gear.map((g) => <GearChip key={g.id} item={g} />) : <small className="muted">No gear equipped</small>}
      </div>
    </div>
  );
}

// ---------- guild ----------

function Guild() {
  const toast = useToast();
  const [guild, setGuild] = useState<GuildDTO | null | undefined>(undefined);
  const load = useCallback(() => api.guild.get().then(setGuild, (err) => toast(errorMessage(err), 'error')), [toast]);
  useEffect(() => void load(), [load]);
  if (guild === undefined) return <p className="center muted">Loading…</p>;
  return guild ? <GuildHome guild={guild} onChange={setGuild} /> : <GuildFinder onJoined={setGuild} />;
}

function GuildFinder({ onJoined }: { onJoined: (g: GuildDTO | null) => void }) {
  const content = useContent();
  const toast = useToast();
  const { profile, setProfile } = useProfile();
  const [q, setQ] = useState('');
  const [list, setList] = useState<GuildSummaryDTO[]>([]);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  useEffect(() => {
    const t = setTimeout(() => api.guild.search(q).then(setList, () => {}), 250);
    return () => clearTimeout(t);
  }, [q]);
  const cost = content.settings.guild.createCost;

  async function act(call: () => Promise<GuildDTO | null>, ok: string) {
    try {
      const g = await call();
      setProfile(await api.me());
      onJoined(g);
      sfx.coins();
      toast(ok);
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  return (
    <div className="social-grid">
      <section className="panel">
        <h3>Join a guild</h3>
        <input className="guild-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search guilds…" />
        {!list.length && <p className="muted small">No guilds found. Why not found one?</p>}
        {list.map((g) => (
          <div key={g.id} className="request-row">
            <span>
              <b>{g.name}</b>{' '}
              <small className="muted">
                {g.members}/{g.maxMembers}
              </small>
              {g.description && <small className="muted guild-desc">{g.description}</small>}
            </span>
            <button
              className="btn small primary"
              disabled={!g.open || g.members >= g.maxMembers}
              onClick={() => void act(() => api.guild.join(g.id), `Welcome to ${g.name}!`)}
            >
              {g.open ? (g.members >= g.maxMembers ? 'Full' : 'Join') : 'Closed'}
            </button>
          </div>
        ))}
      </section>
      <section className="panel">
        <h3>Found a guild</h3>
        <p className="small muted">Guild members fight a weekly boss together and share its chests.</p>
        <form
          className="guild-create"
          onSubmit={(e) => {
            e.preventDefault();
            void act(() => api.guild.create(name, desc), `${name} is founded!`);
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Guild name" maxLength={24} />
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description (optional)" maxLength={200} />
          <button className="btn primary" disabled={name.trim().length < 3 || profile.wallet.gold < cost}>
            Found for 🪙 {cost.toLocaleString()}
          </button>
        </form>
      </section>
    </div>
  );
}

function GuildHome({ guild, onChange }: { guild: GuildDTO; onChange: (g: GuildDTO | null) => void }) {
  const content = useContent();
  const navigate = useNavigate();
  const toast = useToast();
  const { setProfile } = useProfile();
  const boss = content.enemiesById[guild.boss.enemy];
  const pct = Math.min(100, (guild.boss.damage / guild.boss.pool) * 100);

  async function claim(percent: number) {
    try {
      const res = await api.guild.claim(percent);
      setProfile(res.profile);
      onChange(res.guild);
      sfx.coins();
      toast(`Opened the ${percent}% chest`);
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  return (
    <div className="guild-home">
      <section className="panel guild-head">
        <div>
          <h2>🛡️ {guild.name}</h2>
          {guild.description && <p className="muted">{guild.description}</p>}
          <small className="muted">
            {guild.memberCount}/{guild.maxMembers} members · you are {guild.role === 'leader' ? 'the leader' : 'a member'}
          </small>
        </div>
        <span className="guild-head-actions">
          {guild.role === 'leader' && (
            <button className="btn small" onClick={() => void api.guild.update(guild.description, !guild.open).then(onChange)}>
              {guild.open ? '🔓 Open' : '🔒 Closed'}
            </button>
          )}
          <button
            className="btn small"
            onClick={() => {
              if (window.confirm(`Leave ${guild.name}?`)) void api.guild.leave().then(() => onChange(null));
            }}
          >
            Leave
          </button>
        </span>
      </section>

      <section className="panel guild-boss">
        <div className="boss-art">{boss && <UnitArt sprite={boss.sprite} emoji={boss.emoji} height="110px" flip />}</div>
        <div className="boss-info">
          <small className="muted">Weekly boss · {guild.boss.week}</small>
          <h2>
            {boss?.name ?? guild.boss.enemy} <small className="muted">Lv {guild.boss.level}</small>
          </h2>
          <div className="boss-hp">
            <span style={{ width: `${pct}%` }} />
            <b>
              {guild.boss.damage.toLocaleString()} / {guild.boss.pool.toLocaleString()} ({Math.floor(pct)}%)
            </b>
          </div>
          <div className="boss-chests">
            {guild.chests.map((c) => (
              <button
                key={c.percent}
                className={`chest ${c.claimed ? 'claimed' : c.unlocked ? 'ready' : 'locked'}`}
                disabled={!c.unlocked || c.claimed}
                onClick={() => void claim(c.percent)}
              >
                <span className="chest-icon">{c.claimed ? '📭' : '🎁'}</span>
                <span className="chest-need">{c.percent}%</span>
                <RewardList reward={c.reward} />
              </button>
            ))}
          </div>
          <small className="muted">Attack at least once this week to share the chests. Each attack lasts {content.settings.guild.turnLimit} turns.</small>
        </div>
        <div className="guild-attack">
          <TeamSwitcher />
          <button
            className="btn primary big"
            disabled={guild.boss.attemptsLeft <= 0}
            onClick={() => {
              sfx.click();
              navigate(`/guild-battle/${guild.boss.enemy}`);
            }}
          >
            ⚔️ Attack
            <small>
              {guild.boss.attemptsLeft}/{guild.boss.attemptsPerDay} left today
            </small>
          </button>
        </div>
      </section>

      <section className="panel">
        <h3>Members this week</h3>
        <div className="member-list">
          {guild.members.map((m, i) => (
            <div key={m.id} className="member-row">
              <span className="member-rank">{i + 1}</span>
              <span>
                <b>{m.name}</b> {m.role === 'leader' && <span className="tag">Leader</span>}
                {m.title && <span className="title-tag">{m.title}</span>}
                <small className="muted"> Lv {m.level}</small>
              </span>
              <span className="member-dmg">
                💥 {m.weeklyDamage.toLocaleString()} <small className="muted">({m.weeklyAttacks} attacks)</small>
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
