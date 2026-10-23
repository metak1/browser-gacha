import { FEATURE_INFO, isFeatureUnlocked, type Feature } from '@gacha/shared';
import { Link } from 'react-router-dom';
import { useContent } from '../state/content';
import { useProfile } from '../state/profile';

export function useFeature(feature: Feature): { unlocked: boolean; need: string | null } {
  const settings = useContent().settings;
  const { profile } = useProfile();
  return { unlocked: isFeatureUnlocked(settings, feature, profile.clearedStages), need: settings.unlocks[feature] };
}

/** Shown instead of a feature's page until it's unlocked. */
export function LockedFeature({ feature }: { feature: Feature }) {
  const info = FEATURE_INFO[feature];
  const { need } = useFeature(feature);
  const stage = useContent().stagesById[need ?? ''];
  return (
    <div className="locked-feature panel">
      <div className="locked-icon">
        {info.icon}
        <span>🔒</span>
      </div>
      <h1>{info.label}</h1>
      <p className="muted">{info.blurb}</p>
      <p>
        Unlocks after you clear{' '}
        <b>
          {need} {stage ? `· ${stage.name}` : ''}
        </b>
        .
      </p>
      <Link className="btn primary" to="/campaign">
        ⚔️ To the campaign
      </Link>
    </div>
  );
}
