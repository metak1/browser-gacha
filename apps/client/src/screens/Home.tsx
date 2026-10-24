import {
  chapterOf,
  ELEMENTS,
  eventDaysLeft,
  FEATURE_INFO,
  FEATURES,
  firstSummonFree,
  isEventActive,
  isFeatureUnlocked,
  levelCap,
  levelUpCost,
  UI_ICONS,
  type ContentIndex,
  type ProfileDTO,
  type Reward,
} from '@gacha/shared';
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { sfx } from '../audio/sfx';
import { Icon, IconOr, PixelEmoji, UnitArt } from '../components/Art';
import { TodayPanel } from '../components/DailyActivity';
import { Scene } from '../components/Scene';
import { useContent } from '../state/content';
import { useProfile } from '../state/profile';

// Where team members stand in the lobby scene (percent of width / height).
const LOBBY_SPOTS = [
  { x: 50, y: 84 },
  { x: 33, y: 78 },
  { x: 67, y: 78 },
  { x: 18, y: 88 },
];

export function HomeScreen() {
  const { profile, mutate } = useProfile();
  const content = useContent();
  const { stages, settings } = content;
  const next = stages.find((s) => !profile.clearedStages.includes(s.id));
  const levels = new Map(profile.roster.map((c) => [c.id, c.level]));
  const theme = chapterOf(content, next?.id ?? stages[stages.length - 1]?.id ?? '')?.theme ?? 'meadow';

  return (
    <div className="home">
      <section className="lobby">
        <Scene theme={theme} />
        <div className="lobby-logo">
          <span className="logo-star">✦</span>
          <h1>Starlit Summons</h1>
          <p>Welcome, {profile.user.username ?? 'Traveler'}</p>
        </div>
        {profile.team.map((id, i) => {
          const c = content.charactersById[id];
          const spot = LOBBY_SPOTS[i]!;
          if (!c) return null;
          return (
            <Link
              to="/roster"
              key={id}
              className="lobby-hero"
              style={{ '--x': spot.x, '--y': spot.y, zIndex: spot.y, '--el': ELEMENTS[c.element].color, animationDelay: `${i * 0.12}s` } as CSSProperties}
              title={`${c.name}: open roster`}
            >
              {c.sprite ? (
                <span className="lobby-art">
                  <UnitArt sprite={c.sprite} emoji={c.emoji} height="clamp(44px, 7cqw, 92px)" />
                </span>
              ) : (
                <span className="lobby-emoji" style={{ animationDelay: `${-i * 0.6}s` }}>
                  <PixelEmoji emoji={c.emoji} />
                </span>
              )}
              <span className="lobby-shadow" />
              <span className="lobby-plate">
                {c.name} <b>Lv{levels.get(id) ?? 1}</b>
              </span>
            </Link>
          );
        })}
        <div className="lobby-actions">
          {next ? (
            <Link className="btn primary big glow" to={`/battle/${next.id}`} onClick={() => sfx.click()}>
              ⚔️ Adventure
              <small>
                {next.id} · {next.name}
              </small>
            </Link>
          ) : (
            <Link className="btn primary big" to="/campaign">
              🏆 Campaign complete
            </Link>
          )}
          <Link className="btn big summon-cta" to="/summon" onClick={() => sfx.click()}>
            ✦ Summon
            <small>{firstSummonFree(content, profile.flags) ? 'First 10× free!' : 'Limited banner live'}</small>
          </Link>
        </div>
      </section>

      <EventCard />
      <NextStep />

      {!profile.user.username && (
        <section className="panel notice">
          <span>
            You're playing as a <b>guest</b>. Your progress lives on this device only.
          </span>
          <Link className="btn small" to="/account">
            Link an account
          </Link>
        </section>
      )}

      <TodayPanel
        supplies={
          <div className={`daily-head ${profile.dailyAvailable ? 'available' : ''}`}>
            <div className="daily-gift">🎁</div>
            <div>
              <b>Daily supplies</b>
              <p className="muted small">
                <Icon id={UI_ICONS.gems} size={14} /> {settings.dailyGems} and <Icon id={UI_ICONS.gold} size={14} /> {settings.dailyGold} every day, plus the
                login calendar.
              </p>
            </div>
            <button
              className={`btn ${profile.dailyAvailable ? 'primary glow' : ''}`}
              disabled={!profile.dailyAvailable}
              onClick={async () => {
                if (await mutate(api.claimDaily, `Claimed 💎 ${settings.dailyGems} and 🪙 ${settings.dailyGold}`)) sfx.coins();
              }}
            >
              {profile.dailyAvailable ? 'Claim' : 'Claimed ✓'}
            </button>
          </div>
        }
        calendar={<LoginCalendar />}
      />
    </div>
  );
}

interface Step {
  icon: string;
  title: string;
  text: string;
  to: string;
  cta: string;
}

/** The single most useful thing to do next, for players finding their feet. */
function nextStep(content: ContentIndex, profile: ProfileDTO): Step | null {
  const cleared = new Set(profile.clearedStages);
  // New players start without heroes: the free summon comes before anything else.
  if (firstSummonFree(content, profile.flags)) {
    return { icon: '✦', title: 'Your first 10× summon is free', text: 'Recruit ten new heroes on any banner, on the house.', to: '/summon', cta: 'Summon' };
  }
  const first = content.stages[0];
  if (first && !cleared.has(first.id)) {
    return {
      icon: '⚔️',
      title: 'Start your adventure',
      text: 'Your first battle comes with a quick tour of how combat works.',
      to: `/battle/${first.id}`,
      cta: `Battle ${first.id}`,
    };
  }
  if (profile.missionsReady > 0) {
    const n = profile.missionsReady;
    // missionsReady counts finished missions and ready daily chests.
    return { icon: '📜', title: 'Rewards are waiting', text: `${n} reward${n === 1 ? ' is' : 's are'} ready to claim.`, to: '/missions', cta: 'Open missions' };
  }
  if (profile.roster.length <= content.settings.starterCharacters.length && profile.wallet.gems >= content.settings.pullCost) {
    return { icon: '✦', title: 'Recruit new heroes', text: 'Spend your gems on the summon banners to grow your team.', to: '/summon', cta: 'Summon' };
  }
  const { progression: prog, maxLevel } = content.settings;
  const levelable = profile.team
    .map((id) => profile.roster.find((c) => c.id === id))
    .find((c) => c && c.level < levelCap(prog, c.ascension, maxLevel) && profile.wallet.gold >= levelUpCost(content.settings, c.level));
  if (levelable) {
    const name = content.charactersById[levelable.id]?.name ?? levelable.id;
    return {
      icon: '⬆️',
      title: 'Power up',
      text: `You have the gold to level up ${name}. Stronger heroes clear tougher stages.`,
      to: '/roster',
      cta: 'Open roster',
    };
  }
  for (const f of FEATURES) {
    if (isFeatureUnlocked(content.settings, f, cleared)) continue;
    const need = content.settings.unlocks[f];
    const info = FEATURE_INFO[f];
    if (need)
      return {
        icon: info.icon,
        title: `Unlock the ${info.label}`,
        text: `Clear stage ${need} to open it. ${info.blurb}`,
        to: '/campaign',
        cta: 'To the campaign',
      };
  }
  return null;
}

function NextStep() {
  const { profile } = useProfile();
  const content = useContent();
  const step = nextStep(content, profile);
  if (!step) return null;
  return (
    <section className="panel next-step">
      <span className="next-step-icon">{step.icon}</span>
      <div>
        <small className="muted">Next step</small>
        <h3>{step.title}</h3>
        <p className="muted">{step.text}</p>
      </div>
      <Link className="btn primary" to={step.to} onClick={() => sfx.click()}>
        {step.cta}
      </Link>
    </section>
  );
}

/** The login calendar: rewards for successive daily claims, cycling. */
function LoginCalendar() {
  const { profile } = useProfile();
  const days = useContent().settings.loginCalendar;
  if (!days.length) return null;
  const claimed = profile.account.loginDays;
  // Position in the current cycle; today's reward is the next one when not yet claimed.
  const cycle = Math.floor((claimed - (profile.dailyAvailable ? 0 : 1)) / days.length);
  const doneInCycle = claimed - cycle * days.length;
  return (
    <div className="login-calendar">
      {days.map((r, i) => {
        const state = i < doneInCycle ? 'done' : i === doneInCycle ? (profile.dailyAvailable ? 'today' : 'next') : '';
        return (
          <div key={i} className={`login-day ${state} ${i === days.length - 1 ? 'last' : ''}`}>
            <small>{state === 'today' ? 'Today' : state === 'next' ? 'Tomorrow' : `Day ${i + 1}`}</small>
            <DayReward reward={r} />
            {state === 'done' && <span className="login-check">✓</span>}
          </div>
        );
      })}
    </div>
  );
}

/** A calendar day's reward: each part as a big icon over its amount. */
function DayReward({ reward }: { reward: Reward }) {
  const materials = useContent().materialsById;
  const parts: { key: string; icon: ReactNode; amount: string; title: string }[] = [];
  if (reward.gems) parts.push({ key: 'g', icon: <Icon id={UI_ICONS.gems} size={26} />, amount: reward.gems.toLocaleString(), title: 'Gems' });
  if (reward.gold) parts.push({ key: 'o', icon: <Icon id={UI_ICONS.gold} size={26} />, amount: reward.gold.toLocaleString(), title: 'Gold' });
  if (reward.stardust) parts.push({ key: 's', icon: <Icon id={UI_ICONS.stardust} size={26} />, amount: reward.stardust.toLocaleString(), title: 'Stardust' });
  for (const m of reward.materials ?? []) {
    const def = materials[m.id];
    parts.push({ key: m.id, icon: <IconOr icon={def?.icon} emoji={def?.emoji ?? '❔'} size={26} />, amount: `×${m.count}`, title: def?.name ?? m.id });
  }
  return (
    <div className="day-reward">
      {parts.map((p) => (
        <span key={p.key} title={p.title}>
          {p.icon}
          <b>{p.amount}</b>
        </span>
      ))}
    </div>
  );
}

/** A banner for the running event, if any. */
function EventCard() {
  const content = useContent();
  const { profile } = useProfile();
  const now = Date.now();
  const ev = content.bundle.events.find((e) => isEventActive(e, now));
  if (!ev) return null;
  const days = eventDaysLeft(ev, now);
  return (
    <Link to="/events" className="panel event-card" onClick={() => sfx.click()}>
      <span className="event-card-emoji">
        <PixelEmoji emoji={ev.emoji} />
      </span>
      <div>
        <small className="muted">
          Limited event · {days} day{days === 1 ? '' : 's'} left
        </small>
        <h3>{ev.name}</h3>
        <p className="muted small">{ev.description}</p>
      </div>
      <span className="pill">
        {ev.currency.emoji} {(profile.events[ev.id]?.currency ?? 0).toLocaleString()}
      </span>
    </Link>
  );
}
