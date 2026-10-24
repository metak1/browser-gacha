import { ELEMENTS } from '@gacha/shared';
import type { CSSProperties, ReactNode } from 'react';
import { useContent } from '../state/content';
import { UnitArt, PixelEmoji } from './Art';

interface Props {
  charId: string;
  locked?: boolean;
  badge?: ReactNode;
  footer?: ReactNode;
  selected?: boolean;
  onClick?: () => void;
}

export function CharacterCard({ charId, locked, badge, footer, selected, onClick }: Props) {
  const c = useContent().charactersById[charId];
  if (!c) return null;
  const el = ELEMENTS[c.element];
  const className = ['card', `r${c.rarity}`, locked && 'locked', selected && 'selected', onClick && 'clickable'].filter(Boolean).join(' ');
  return (
    <div className={className} style={{ '--el': el.color } as CSSProperties} onClick={onClick}>
      <div className="card-art">
        <span className="card-el" title={el.label}>
          {el.icon}
        </span>
        {c.sprite && !locked ? (
          <UnitArt sprite={c.sprite} emoji={c.emoji} height="var(--art-h, 54px)" className="card-sprite" />
        ) : (
          <span className="card-emoji">
            <PixelEmoji emoji={c.emoji} />
          </span>
        )}
      </div>
      <div className="card-info">
        <div className="card-name">{locked ? '???' : c.name}</div>
        <div className="card-meta">
          <span className="card-stars">{'★'.repeat(c.rarity)}</span>
          {!locked && (
            <span className="card-role" title={`${ROLE_INFO[c.role].label}: ${ROLE_INFO[c.role].description}`}>
              {ROLE_INFO[c.role].icon}
            </span>
          )}
        </div>
        {footer}
      </div>
      {badge && <div className="badge">{badge}</div>}
    </div>
  );
}

/** Player-facing names for hero roles (the ids in content stay striker/guardian/healer/support). */
export const ROLE_INFO = {
  striker: { label: 'Fighter', plural: 'Fighters', icon: '🗡️', description: 'Deals the damage: strong attacks, often on one target.' },
  guardian: { label: 'Tank', plural: 'Tanks', icon: '🛡️', description: 'Soaks up hits: high HP and DEF, taunts and shields.' },
  healer: { label: 'Healer', plural: 'Healers', icon: '💚', description: 'Keeps the team alive: heals and recovery.' },
  support: { label: 'Support', plural: 'Supports', icon: '🎶', description: 'Makes the team stronger: buffs, debuffs and turn control.' },
} as const;
