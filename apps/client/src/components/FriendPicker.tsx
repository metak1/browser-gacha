import type { FriendDTO } from '@gacha/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useContent } from '../state/content';
import { UnitArt } from './Art';

/**
 * Choose a friend's support hero to bring along (once per friend per day).
 * Calls onChange with the friend's id, or null for none.
 */
export function FriendPicker({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const content = useContent();
  const [friends, setFriends] = useState<FriendDTO[] | null>(null);
  useEffect(() => {
    api.social.get().then(
      (s) => setFriends(s.friends),
      () => setFriends([]),
    );
  }, []);
  if (friends === null) return null;
  const ready = friends.filter((f) => f.support && !f.usedToday);
  if (!friends.length) {
    return (
      <p className="small muted friend-hint">
        🤝 <Link to="/social">Add friends</Link> to borrow their heroes in battle.
      </p>
    );
  }
  return (
    <div className="friend-picker">
      <small className="muted">🤝 Bring a friend's hero</small>
      <div className="friend-options">
        <button className={`chip ${value === null ? 'active' : ''}`} onClick={() => onChange(null)}>
          None
        </button>
        {ready.map((f) => {
          const c = content.charactersById[f.support!.charId];
          return (
            <button
              key={f.id}
              className={`chip friend-option ${value === f.id ? 'active' : ''}`}
              onClick={() => onChange(f.id)}
              title={`${f.name}'s ${c?.name ?? ''}`}
            >
              {c && <UnitArt sprite={c.sprite} emoji={c.emoji} height="22px" />} Lv{f.support!.level} · {f.name}
            </button>
          );
        })}
        {!ready.length && <span className="small muted">Everyone has helped today. Come back tomorrow!</span>}
      </div>
    </div>
  );
}
