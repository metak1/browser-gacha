import { ELEMENTS, firstSummonFree, newBannerState, type PullHistoryEntryDTO, type SummonResultDTO } from '@gacha/shared';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { api, errorMessage } from '../api';
import { sfx } from '../audio/sfx';
import { UnitArt, PixelEmoji } from '../components/Art';
import { CharacterCard } from '../components/CharacterCard';
import { useContent } from '../state/content';
import { useProfile } from '../state/profile';
import { useToast } from '../state/toast';

export function SummonScreen() {
  const { profile, setProfile, mutate } = useProfile();
  const toast = useToast();
  const content = useContent();
  const { settings } = content;
  const banners = content.bundle.banners.filter((b) => b.active);
  const [bannerId, setBannerId] = useState(banners[0]?.id ?? '');
  const [reveal, setReveal] = useState<SummonResultDTO[] | null>(null);
  const [busy, setBusy] = useState(false);

  const banner = (content.bannersById[bannerId]?.active ? content.bannersById[bannerId] : undefined) ?? banners[0];
  if (!banner) return <p className="center muted">No banners are running right now.</p>;
  const bs = profile.banners[banner.id] ?? newBannerState();
  const f5 = banner.featured5 ? (content.charactersById[banner.featured5] ?? null) : null;
  const f4 = banner.featured4.flatMap((id) => content.charactersById[id] ?? []);
  const showcase = f5 ? [f5] : content.bundle.characters.filter((c) => c.rarity === 5 && !c.limited);
  const heroColor = f5 ? ELEMENTS[f5.element].color : '#7c8cff';
  const freeTen = firstSummonFree(content, profile.flags);

  async function summon(count: 1 | 10) {
    setBusy(true);
    try {
      const res = await api.summon(banner!.id, count);
      setProfile(res.profile);
      setReveal(res.results);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="summon">
      <div className="banner-picker">
        {banners.map((b) => (
          <button key={b.id} className={`banner-tab ${b.id === banner.id ? 'active' : ''}`} onClick={() => setBannerId(b.id)}>
            {(b.featured5 && content.charactersById[b.featured5]?.emoji) || '🌠'} {b.name}
          </button>
        ))}
      </div>

      <div className="banner-hero" style={{ '--el': heroColor } as CSSProperties}>
        <div className="banner-text">
          <div className="banner-tag">{banner.limited ? 'Limited Event' : 'Permanent'}</div>
          <h2>{banner.name}</h2>
          <p>{banner.description}</p>
          {f5 && (
            <p className="rateup">
              Rate-up ★5{' '}
              <b className="r5-text">
                {f5.emoji} {f5.name}
              </b>
            </p>
          )}
          {f4.length > 0 && (
            <p className="rateup">
              Rate-up ★4 <b className="r4-text">{f4.map((c) => `${c.emoji} ${c.name}`).join(' · ')}</b>
            </p>
          )}
        </div>
        <div className={`banner-art ${showcase.length > 1 ? 'many' : ''}`}>
          {showcase.map((c) => (
            <span key={c.id} className={`hero-emoji ${c.sprite ? 'art' : ''}`}>
              {c.sprite ? <UnitArt sprite={c.sprite} emoji={c.emoji} height={showcase.length > 1 ? '64px' : '150px'} /> : <PixelEmoji emoji={c.emoji} />}
            </span>
          ))}
        </div>
      </div>

      <div className="panel pity">
        <div className="pity-row">
          <span>
            ★5 pity <b>{bs.pity5}</b> / {settings.gacha.hardPity5}
          </span>
          <span>
            ★4 pity <b>{bs.pity4}</b> / {settings.gacha.hardPity4}
          </span>
          {banner.featured5 && (
            <span className={bs.guaranteed5 ? 'guaranteed' : 'muted'}>{bs.guaranteed5 ? 'Next ★5 is guaranteed rate-up' : '50/50 active'}</span>
          )}
        </div>
        <div className="pity-bar">
          <div style={{ width: `${(bs.pity5 / settings.gacha.hardPity5) * 100}%` }} />
        </div>
      </div>

      <div className="summon-buttons">
        {([1, 10] as const).map((n) => {
          const free = n === 10 && freeTen;
          return (
            <button
              key={n}
              className={`btn primary big ${free ? 'free-pull' : ''}`}
              disabled={busy || (!free && profile.wallet.gems < settings.pullCost * n)}
              onClick={() => summon(n)}
            >
              Summon ×{n} <small>{free ? 'Free first summon' : `💎 ${(settings.pullCost * n).toLocaleString()}`}</small>
              {free && <span className="free-ribbon">FREE{settings.firstSummon.guarantee5 ? ' · ★5' : ''}</span>}
            </button>
          );
        })}
      </div>

      <details className="panel rates">
        <summary>Rates &amp; details</summary>
        <ul>
          <li>
            <b className="r5-text">★5</b> base rate {(settings.gacha.base5 * 100).toFixed(1)}%, rising sharply from pull {settings.gacha.softPity5}, guaranteed
            by pull {settings.gacha.hardPity5}.
          </li>
          <li>
            <b className="r4-text">★4</b> base rate {(settings.gacha.base4 * 100).toFixed(1)}%. At least one ★4 or higher every {settings.gacha.hardPity4}{' '}
            pulls.
          </li>
          {banner.featured5 && <li>Each ★5 has a 50% chance to be the rate-up hero. If it isn't, the next ★5 is guaranteed to be.</li>}
          <li>Pity is tracked per banner and saved on the server.</li>
          <li>Duplicates raise a hero's constellation (C1–C6, +6% stats each) and give stardust.</li>
        </ul>
      </details>

      <div className="panel exchange">
        <div>
          <h3>Stardust Exchange</h3>
          <p className="muted">Trade {settings.stardustExchangeCost} ✨ for one summon's worth of gems.</p>
        </div>
        <button
          className="btn"
          disabled={profile.wallet.stardust < settings.stardustExchangeCost}
          onClick={() => mutate(api.exchange, `+${settings.pullCost} 💎`)}
        >
          {settings.stardustExchangeCost} ✨ → {settings.pullCost} 💎
        </button>
      </div>

      <PullHistory refreshKey={profile.wallet.gems} />

      {reveal && <SummonReveal results={reveal} onClose={() => setReveal(null)} />}
    </div>
  );
}

function PullHistory({ refreshKey }: { refreshKey: number }) {
  const content = useContent();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<PullHistoryEntryDTO[] | null>(null);

  useEffect(() => {
    if (open) api.history().then(setRows, () => setRows([]));
  }, [open, refreshKey]);

  return (
    <details className="panel" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Summon history</summary>
      {!rows ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="muted">No summons yet.</p>
      ) : (
        <table className="history">
          <tbody>
            {rows.map((r, i) => {
              const c = content.charactersById[r.charId];
              return (
                <tr key={i} className={`r${r.rarity}`}>
                  <td className={`r${r.rarity}-text`}>{'★'.repeat(r.rarity)}</td>
                  <td>
                    {c?.emoji} {c?.name ?? r.charId}
                  </td>
                  <td className="muted">{content.bannersById[r.bannerId]?.name ?? r.bannerId}</td>
                  <td className="muted">{r.rarity === 5 && r.pity ? `pity ${r.pity}` : ''}</td>
                  <td className="muted">{new Date(r.createdAt).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </details>
  );
}

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function SummonReveal({ results, onClose }: { results: SummonResultDTO[]; onClose: () => void }) {
  const best = Math.max(...results.map((r) => r.rarity));
  const [phase, setPhase] = useState<'intro' | 'revealing' | 'done'>(() => (reduceMotion() ? 'done' : 'intro'));
  const [shown, setShown] = useState(() => (reduceMotion() ? results.length : 0));

  useEffect(() => {
    if (phase === 'intro') {
      const t = setTimeout(() => setPhase('revealing'), best === 5 ? 1600 : 1200);
      return () => clearTimeout(t);
    }
    if (phase === 'revealing') {
      const t = shown >= results.length ? setTimeout(() => setPhase('done'), 450) : setTimeout(() => setShown((s) => s + 1), shown === 0 ? 150 : 170);
      return () => clearTimeout(t);
    }
  }, [phase, shown, best, results.length]);

  // Sounds: a meteor whoosh for the intro, then a chime per revealed card.
  useEffect(() => {
    if (phase === 'intro') sfx.meteor();
  }, [phase]);
  const lastSounded = useRef(0);
  useEffect(() => {
    if (shown <= lastSounded.current) return;
    const revealed = results.slice(lastSounded.current, shown);
    lastSounded.current = shown;
    sfx.flip(Math.max(...revealed.map((r) => r.rarity)));
  }, [shown, results]);

  const skip = () => {
    setShown(results.length);
    setPhase('done');
  };
  const advance = () => (phase === 'done' ? onClose() : skip());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['Enter', ' ', 'Escape'].includes(e.key)) {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className={`overlay best${best} ${phase === 'intro' ? 'intro' : ''}`} onClick={phase === 'done' ? undefined : skip}>
      <div className="beam" />
      <div className={`results ${results.length === 1 ? 'single' : ''}`}>
        {results.map((r, i) => (
          <div key={i} className={`flip r${r.rarity} ${i < shown ? 'shown' : ''}`}>
            {r.rarity >= 4 && <div className="flip-rays" />}
            <div className="flip-inner">
              <div className={`flip-back r${r.rarity}`}>
                <span>✦</span>
              </div>
              <div className="flip-front">
                <CharacterCard charId={r.id} badge={r.isNew ? 'NEW' : `C${r.constellation}${r.stardust ? ` · +${r.stardust}✨` : ''}`} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="overlay-actions">
        <button
          className="btn primary"
          onClick={(e) => {
            e.stopPropagation();
            advance();
          }}
        >
          {phase === 'done' ? 'Continue' : 'Reveal all'}
        </button>
      </div>
    </div>
  );
}
