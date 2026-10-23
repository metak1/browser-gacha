import { eventDaysLeft, eventKey, isEventActive, staminaCost, type EventDef } from '@gacha/shared';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TeamSwitcher } from '../components/TeamSwitcher';
import { api } from '../api';
import { sfx } from '../audio/sfx';
import { IconOr, PixelEmoji, UnitArt } from '../components/Art';
import { FriendPicker } from '../components/FriendPicker';
import { RewardList } from '../components/Materials';
import { Scene } from '../components/Scene';
import { StaminaShort, useLiveStamina } from '../components/Stamina';
import { useContent } from '../state/content';
import { useProfile } from '../state/profile';
import './events.css';

export function EventsScreen() {
  const content = useContent();
  const now = Date.now();
  const active = content.bundle.events.filter((e) => isEventActive(e, now));
  const upcoming = content.bundle.events.filter((e) => e.start > new Date(now).toISOString().slice(0, 10));

  return (
    <div className="events-page">
      <div className="page-head">
        <h1>Events</h1>
        <span className="muted">Limited-time stages, currencies and rewards</span>
      </div>
      {!active.length && <p className="center muted">No event is running right now.{upcoming.length ? ` Next: ${upcoming[0]!.name} on ${upcoming[0]!.start}.` : ''}</p>}
      {active.map((e) => (
        <EventView key={e.id} event={e} now={now} />
      ))}
    </div>
  );
}

function EventView({ event, now }: { event: EventDef; now: number }) {
  const navigate = useNavigate();
  const content = useContent();
  const { profile, mutate } = useProfile();
  const stamina = useLiveStamina();
  const [friend, setFriend] = useState<string | null>(null);
  const mine = profile.events[event.id] ?? { currency: 0, purchases: {} };
  const cost = staminaCost(content.settings.stamina, false);
  const cleared = new Set(profile.clearedStages);
  const days = eventDaysLeft(event, now);
  const coin = <IconOr icon={event.currency.icon} emoji={event.currency.emoji} size={18} />;

  return (
    <section className="event">
      <div className="event-banner">
        <Scene theme={event.theme} weather={0.5} />
        <div className="event-title">
          <span className="event-emoji">
            <PixelEmoji emoji={event.emoji} />
          </span>
          <div>
            <h2>{event.name}</h2>
            <p>{event.description}</p>
          </div>
          <div className="event-side">
            <span className="pill">
              {coin} {mine.currency.toLocaleString()}
            </span>
            <span className="small">
              {days} day{days === 1 ? '' : 's'} left · ends {event.end}
            </span>
          </div>
        </div>
      </div>

      <div className="event-body">
        <div className="panel event-stages">
          <h3>Stages</h3>
          <TeamSwitcher />
          <FriendPicker value={friend} onChange={setFriend} />
          {event.stages.map((s, i) => {
            const unlocked = i === 0 || cleared.has(eventKey(event.id, i - 1));
            const done = cleared.has(eventKey(event.id, i));
            const foes = [...s.enemies, ...s.waves.flat()];
            return (
              <div key={i} className={`event-stage ${unlocked ? '' : 'locked'}`}>
                <div>
                  <b>
                    {i + 1}. {s.name} {done && <span className="tag ok">Cleared</span>}
                  </b>
                  <div className="small muted">
                    Recommended Lv {s.recommendedLevel}
                    {s.waves.length > 0 && ` · ${s.waves.length + 1} waves`}
                  </div>
                  <div className="event-foes">
                    {foes.map((f, j) => {
                      const d = content.enemiesById[f.id];
                      return d ? <UnitArt key={j} sprite={d.sprite} emoji={d.emoji} height="24px" flip /> : null;
                    })}
                  </div>
                </div>
                <div className="event-stage-rewards">
                  <span className="pill">
                    {coin} {s.currencyMin}–{s.currencyMax}
                  </span>
                  {!done && s.firstClearGems > 0 && <span className="pill">💎 {s.firstClearGems}</span>}
                </div>
                <button
                  className={`btn ${unlocked ? 'primary' : ''}`}
                  disabled={!unlocked || stamina.current < cost}
                  onClick={() => {
                    sfx.click();
                    navigate(`/event/${event.id}/${i}${friend ? `?friend=${friend}` : ''}`);
                  }}
                >
                  {unlocked ? '⚔️ Battle' : '🔒'} <small className="cost-tag">⚡{cost}</small>
                </button>
              </div>
            );
          })}
          {stamina.current < cost && <StaminaShort need={cost} />}
        </div>

        <div className="panel event-shop">
          <h3>Exchange</h3>
          <div className="shop-grid">
            {event.shop.map((item) => {
              const bought = mine.purchases[item.id] ?? 0;
              const left = item.limit - bought;
              const hero = item.character ? content.charactersById[item.character] : undefined;
              const afford = mine.currency >= item.cost;
              return (
                <div key={item.id} className={`shop-item ${hero ? 'hero' : ''} ${left <= 0 ? 'sold' : ''}`}>
                  <div className="shop-item-art">
                    {hero ? <UnitArt sprite={hero.sprite} emoji={hero.emoji} height="56px" /> : <RewardList reward={item.reward} size={24} />}
                  </div>
                  {hero && (
                    <div className="small">
                      <b>{hero.name}</b> <span className={`r${hero.rarity}-text`}>{'★'.repeat(hero.rarity)}</span>
                    </div>
                  )}
                  <div className="small muted">
                    {left > 0 ? `${left} left` : 'Sold out'}
                  </div>
                  <button
                    className={`btn small ${afford && left > 0 ? 'primary' : ''}`}
                    disabled={!afford || left <= 0}
                    onClick={() => void mutate(() => api.buyEvent(event.id, item.id, 1), hero ? `${hero.name} joins you!` : 'Purchased')}
                  >
                    {coin} {item.cost}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
