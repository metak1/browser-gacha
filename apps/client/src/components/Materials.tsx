import { UI_ICONS, type MaterialStack, type Reward } from '@gacha/shared';
import { useContent } from '../state/content';
import { useProfile } from '../state/profile';
import { Icon, IconOr } from './Art';
import './materials.css';

/** A material with its count, e.g. "🔥 ×4". */
export function MaterialChip({ id, count, size = 24 }: { id: string; count: number; size?: number }) {
  const m = useContent().materialsById[id];
  return (
    <span className={`mat-chip r${m?.rarity ?? 3}`} title={m?.name ?? id}>
      <IconOr icon={m?.icon} emoji={m?.emoji ?? '❔'} size={size} />
      <b>×{count}</b>
    </span>
  );
}

/** A cost line: shows what you have against what's needed, red when short. */
export function CostList({ gold, materials }: { gold: number; materials: MaterialStack[] }) {
  const { profile } = useProfile();
  const content = useContent();
  return (
    <div className="cost-list">
      {gold > 0 && (
        <span className={`cost ${profile.wallet.gold < gold ? 'short' : ''}`}>
          <Icon id={UI_ICONS.gold} size={16} /> {gold.toLocaleString()}
        </span>
      )}
      {materials.map((m) => {
        const have = profile.materials[m.id] ?? 0;
        const def = content.materialsById[m.id];
        return (
          <span key={m.id} className={`cost ${have < m.count ? 'short' : ''}`} title={def?.name ?? m.id}>
            <IconOr icon={def?.icon} emoji={def?.emoji ?? '❔'} size={16} /> {have}/{m.count}
          </span>
        );
      })}
    </div>
  );
}

/** Every part of a reward, with icons. */
export function RewardList({ reward, size = 16 }: { reward: Partial<Reward>; size?: number }) {
  const parts = [
    reward.gems ? (
      <span key="g">
        <Icon id={UI_ICONS.gems} size={size} /> {reward.gems}
      </span>
    ) : null,
    reward.gold ? (
      <span key="o">
        <Icon id={UI_ICONS.gold} size={size} /> {reward.gold}
      </span>
    ) : null,
    reward.stardust ? (
      <span key="s">
        <Icon id={UI_ICONS.stardust} size={size} /> {reward.stardust}
      </span>
    ) : null,
    ...(reward.materials ?? []).map((m) => <MaterialChip key={m.id} id={m.id} count={m.count} size={size} />),
  ].filter(Boolean);
  return <span className="reward-list">{parts.length ? parts : <span className="muted">No reward</span>}</span>;
}

/** Ascension pips: filled for ranks reached. */
export function AscensionPips({ rank, max, size = 'md' }: { rank: number; max: number; size?: 'sm' | 'md' }) {
  if (max <= 0) return null;
  return (
    <span className={`asc-pips ${size}`} title={`Ascension ${rank}/${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < rank ? 'on' : ''} />
      ))}
    </span>
  );
}
