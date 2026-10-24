import { chapterStars, hardKey, isHardUnlocked, isStageUnlocked, staminaCost, type ChapterDef, type StageDef } from '@gacha/shared';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { TeamSwitcher } from '../components/TeamSwitcher';
import { api, errorMessage } from '../api';
import { sfx } from '../audio/sfx';
import { UnitArt, PixelEmoji } from '../components/Art';
import { RewardList } from '../components/Materials';
import { FriendPicker } from '../components/FriendPicker';
import { Scene } from '../components/Scene';
import { StaminaShort, useLiveStamina } from '../components/Stamina';
import { SweepButtons } from '../components/Sweep';
import { ObjectiveList, Stars } from '../components/Stars';
import { useContent } from '../state/content';
import { useProfile } from '../state/profile';
import { useToast } from '../state/toast';

/** Node position along a chapter's zig-zag trail (percent of the map), for any number of stages. */
function nodeSpot(i: number, n: number) {
  return { x: n === 1 ? 50 : 10 + (80 * i) / (n - 1), y: i % 2 === 0 ? 70 : 50 };
}

export function CampaignScreen() {
  const { profile } = useProfile();
  const content = useContent();
  const cleared = new Set(profile.clearedStages);
  const [params, setParams] = useSearchParams();
  const hardOn = content.settings.hardMode.enabled;
  const hard = hardOn && params.get('hard') === '1';
  // In hard mode a stage's progress lives under its hard key.
  const isDone = (id: string) => cleared.has(hard ? hardKey(id) : id);
  const isOpen = (id: string) => (hard ? isHardUnlocked(content, id, cleared) : isStageUnlocked(content, id, cleared));
  const current = content.stages.find((s) => !isDone(s.id) && isOpen(s.id));
  const [selected, setSelected] = useState<string>(current?.id ?? content.stages[0]?.id ?? '');
  const levels = new Map(profile.roster.map((c) => [c.id, c.level]));
  const teamLevel = profile.team.length ? Math.round(profile.team.reduce((sum, id) => sum + (levels.get(id) ?? 1), 0) / profile.team.length) : 0;

  return (
    <div className="campaign">
      <div className="page-head">
        <h1>Campaign</h1>
        {hardOn && (
          <div className="mode-toggle">
            <button className={`chip ${hard ? '' : 'active'}`} onClick={() => setParams({})}>
              Normal
            </button>
            <button className={`chip hard ${hard ? 'active' : ''}`} onClick={() => setParams({ hard: '1' })}>
              💀 Hard
            </button>
          </div>
        )}
        <span className="muted">Average team level: {teamLevel}</span>
      </div>
      {hard && (
        <p className="hard-note small">
          Hard mode: enemies are {content.settings.hardMode.levelBonus} levels higher and much stronger, with ×{content.settings.hardMode.rewardMult} gold and
          materials and better gear drops. A chapter opens on hard once you've cleared it on normal.
        </p>
      )}
      {content.chapters.map((chapter) => {
        const stages = content.stages.filter((s) => s.chapter === chapter.id);
        if (!stages.length) return null;
        const chapterOpen = isOpen(stages[0]!.id);
        const selectedHere = stages.find((s) => s.id === selected);
        const total = chapterStars(content.stages, chapter.id, profile.stageStars);
        const path = stages
          .map((_, i) => nodeSpot(i, stages.length))
          .map((p, i) => `${i ? 'L' : 'M'}${p.x * 10},${p.y * 4}`)
          .join(' ');
        return (
          <section key={chapter.id} className={`chapter ${chapterOpen ? '' : 'sealed'} ${hard ? 'hard' : ''}`}>
            <div className="chapter-map">
              <Scene theme={chapter.theme} weather={0.5} />
              <div className="chapter-title">
                <small>Chapter {chapter.id}</small>
                <h2>{chapter.name}</h2>
              </div>
              {chapterOpen && !hard && (
                <div className="chapter-stars">
                  <span className="stars md">
                    <span className="on">★</span>
                  </span>
                  {total.earned}/{total.max}
                </div>
              )}
              <svg className="trail" viewBox="0 0 1000 400" preserveAspectRatio="none">
                <path d={path} />
              </svg>
              {stages.map((stage, i) => {
                const done = isDone(stage.id);
                const unlocked = isOpen(stage.id);
                const boss = stage.enemies.some((e) => content.enemiesById[e.id]?.boss);
                const spot = nodeSpot(i, stages.length);
                return (
                  <button
                    key={stage.id}
                    className={`node ${done ? 'cleared' : ''} ${unlocked ? '' : 'locked'} ${boss ? 'boss' : ''} ${stage.id === current?.id ? 'current' : ''} ${stage.id === selected ? 'selected' : ''}`}
                    style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
                    onClick={() => {
                      sfx.click();
                      setSelected(stage.id);
                    }}
                    title={`${stage.id} ${stage.name}`}
                  >
                    <span className="node-icon">
                      {!unlocked
                        ? '🔒'
                        : boss
                          ? content.enemiesById[stage.enemies.find((e) => content.enemiesById[e.id]?.boss)!.id]!.emoji
                          : done
                            ? '★'
                            : i + 1}
                    </span>
                    <span className="node-label">{stage.id}</span>
                    {done && !hard && (
                      <span className="node-stars">
                        <Stars value={profile.stageStars[stage.id] ?? 1} max={Math.max(1, stage.objectives.length)} size="sm" />
                      </span>
                    )}
                  </button>
                );
              })}
              {!chapterOpen && (
                <div className="chapter-seal">🔒 {hard ? 'Clear this chapter on normal, and the previous hard stage' : 'Clear the previous chapter'}</div>
              )}
            </div>
            {chapterOpen && !hard && chapter.starRewards.length > 0 && <ChapterChests chapter={chapter} earned={total.earned} />}
            {selectedHere && (
              <StageDetail
                stage={selectedHere}
                teamLevel={teamLevel}
                done={isDone(selectedHere.id)}
                stars={profile.stageStars[selectedHere.id] ?? 0}
                unlocked={isOpen(selectedHere.id)}
                hard={hard}
              />
            )}
          </section>
        );
      })}
    </div>
  );
}

function ChapterChests({ chapter, earned }: { chapter: ChapterDef; earned: number }) {
  const { profile, setProfile } = useProfile();
  const toast = useToast();
  const [busy, setBusy] = useState<number | null>(null);
  const claimed = new Set(profile.claimedChests);

  async function claim(stars: number) {
    setBusy(stars);
    try {
      setProfile(await api.claimChest(chapter.id, stars));
      sfx.coins();
      toast(`Opened the ${stars}★ chest`);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="chests">
      {[...chapter.starRewards]
        .sort((a, b) => a.stars - b.stars)
        .map((c) => {
          const done = claimed.has(`${chapter.id}:${c.stars}`);
          const ready = !done && earned >= c.stars;
          return (
            <button
              key={c.stars}
              className={`chest ${done ? 'claimed' : ready ? 'ready' : 'locked'}`}
              disabled={!ready || busy !== null}
              onClick={() => claim(c.stars)}
              title={done ? 'Opened' : ready ? 'Open chest' : `Earn ${c.stars} stars in this chapter`}
            >
              <span className="chest-icon">{done ? '📭' : '🎁'}</span>
              <span className="chest-need">{c.stars}★</span>
              <RewardList reward={c.reward} />
              {done && <span className="muted">✓</span>}
            </button>
          );
        })}
    </div>
  );
}

function StageDetail({
  stage,
  teamLevel,
  done,
  stars,
  unlocked,
  hard,
}: {
  stage: StageDef;
  teamLevel: number;
  done: boolean;
  stars: number;
  unlocked: boolean;
  hard: boolean;
}) {
  const navigate = useNavigate();
  const content = useContent();
  const [friend, setFriend] = useState<string | null>(null);
  const h = content.settings.hardMode;
  const bonus = hard ? h.levelBonus : 0;
  const recommended = stage.recommendedLevel + bonus;
  const tough = teamLevel < recommended;
  const showObjectives = !hard && stage.objectives.length > 0;
  const stamina = useLiveStamina();
  const cost = staminaCost(content.settings.stamina, hard);
  const canPay = stamina.current >= cost;
  // Sweeping needs every star (normal) or a clear (hard).
  const mastered = hard ? done : done && stars >= Math.max(1, stage.objectives.length);
  const enemyChip = (e: { id: string }, key: string) => {
    const def = content.enemiesById[e.id];
    if (!def) return null;
    return (
      <span key={key} className={`enemy-chip ${def.boss ? 'boss' : ''}`} title={def.name}>
        {!unlocked ? (
          '❔'
        ) : def.sprite ? (
          <UnitArt sprite={def.sprite} emoji={def.emoji} height={def.boss ? '44px' : '34px'} flip />
        ) : (
          <PixelEmoji emoji={def.emoji} />
        )}
        <small>{unlocked ? def.name : '???'}</small>
      </span>
    );
  };
  return (
    <div className="stage-detail panel">
      <div>
        <h3>
          {stage.id} · {stage.name} {hard && <span className="tag hard-tag">Hard</span>} {done && <span className="tag ok">Cleared</span>}
          {done && showObjectives && <Stars value={stars} max={stage.objectives.length} />}
        </h3>
        <div className="stage-enemies">
          {stage.enemies.map((e, i) => enemyChip(e, String(i)))}
          {stage.waves.map((w, wi) => (
            <span key={wi} className="wave-group">
              <small className="wave-label">Wave {wi + 2}</small>
              {w.map((e, i) => enemyChip(e, `${wi}-${i}`))}
            </span>
          ))}
        </div>
        {showObjectives && (
          <div className="stage-objectives">
            <ObjectiveList objectives={stage.objectives} />
          </div>
        )}
      </div>
      <div className="stage-side">
        <div className="small muted">
          Enemy Lv {stage.enemies[0]!.level + bonus} · <span className={tough && unlocked ? 'warn' : ''}>Recommended Lv {recommended}</span>
        </div>
        {tough && unlocked && !done && (
          <div className={`underlevel ${recommended - teamLevel >= 5 ? 'severe' : ''}`}>
            <span>
              {recommended - teamLevel >= 5 ? '⚠ Very tough: ' : '⚠ '}your team averages Lv {teamLevel}, {recommended - teamLevel} below the recommended level.
            </span>
            <Link to="/roster" className="btn small">
              Level up
            </Link>
          </div>
        )}
        {unlocked && <TeamSwitcher />}
        <div className="stage-rewards">
          {!done && <span className="pill">💎 {hard ? h.firstClearGems : stage.firstClearGems}</span>}
          <span className="pill">🪙 {Math.round(stage.gold * (hard ? h.rewardMult : 1))}</span>
          {hard && <span className="pill">×{h.rewardMult} materials</span>}
        </div>
        <button
          className={`btn ${done ? '' : 'primary glow'} big`}
          disabled={!unlocked || !canPay}
          onClick={() => {
            sfx.click();
            const q = new URLSearchParams({ ...(hard ? { hard: '1' } : {}), ...(friend ? { friend } : {}) }).toString();
            navigate(`/battle/${stage.id}${q ? `?${q}` : ''}`);
          }}
        >
          {unlocked ? (done ? '↻ Replay' : '⚔️ Battle') : '🔒 Locked'}
          {unlocked && cost > 0 && <small className="cost-tag">⚡{cost}</small>}
        </button>
        {unlocked && !canPay && <StaminaShort need={cost} />}
        {unlocked && <FriendPicker value={friend} onChange={setFriend} />}
        {mastered && unlocked && (
          <SweepButtons
            target={{ kind: 'stage', stageId: stage.id, hard }}
            maxRuns={cost > 0 ? Math.floor(stamina.current / cost) : 99}
            costLabel={`⚡${cost}`}
          />
        )}
        {!mastered && done && !hard && <small className="muted">Earn all stars to unlock ⏩ Sweep</small>}
      </div>
    </div>
  );
}
