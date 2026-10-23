import { UI_ICONS, type SweepResponse } from '@gacha/shared';
import { useState } from 'react';
import { api, errorMessage } from '../api';
import { sfx } from '../audio/sfx';
import { useContent } from '../state/content';
import { useProfile } from '../state/profile';
import { useToast } from '../state/toast';
import { Icon } from './Art';
import { GearChip } from './Gear';
import { MaterialChip } from './Materials';

/** What to sweep, without the run count. */
export type SweepTarget = { kind: 'stage'; stageId: string; hard?: boolean } | { kind: 'dungeon'; dungeonId: string; tier: number };

/**
 * Sweep buttons for one target: ×1 and ×max. `maxRuns` is what the player can
 * afford right now (stamina or runs left); the server caps it again.
 */
export function SweepButtons({ target, maxRuns, costLabel }: { target: SweepTarget; maxRuns: number; costLabel: string }) {
  const { setProfile } = useProfile();
  const toast = useToast();
  const limit = useContent().settings.maxSweep;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SweepResponse | null>(null);
  const most = Math.max(0, Math.min(limit, maxRuns));

  async function sweep(count: number) {
    setBusy(true);
    try {
      const res = await api.sweep({ ...target, count });
      setProfile(res.profile);
      setResult(res);
      sfx.coins();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="sweep-buttons" title={`Instantly re-clear for the same loot. Each run costs ${costLabel}.`}>
        <button className="btn small sweep" disabled={busy || most < 1} onClick={() => sweep(1)}>
          ⏩ Sweep
        </button>
        {most > 1 && (
          <button className="btn small sweep" disabled={busy} onClick={() => sweep(most)}>
            ×{most}
          </button>
        )}
      </div>
      {result && <SweepResultModal result={result} onClose={() => setResult(null)} />}
    </>
  );
}

function SweepResultModal({ result, onClose }: { result: SweepResponse; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal sweep-result" onClick={(e) => e.stopPropagation()}>
        <div className="result-icon">⏩</div>
        <h2>Swept ×{result.runs}</h2>
        <div className="reward-row">
          <span className="reward">
            <Icon id={UI_ICONS.gold} size={32} />+{result.rewards.gold.toLocaleString()}
          </span>
        </div>
        {result.materials.length > 0 && (
          <div className="drop-row">
            {result.materials.map((m) => (
              <MaterialChip key={m.id} id={m.id} count={m.count} size={24} />
            ))}
          </div>
        )}
        {result.drops.length > 0 && (
          <div className="drops">
            <small className="muted">Loot</small>
            <div className="drop-row">
              {result.drops.map((g) => (
                <GearChip key={g.id} item={g} />
              ))}
            </div>
          </div>
        )}
        {result.salvaged.count > 0 && (
          <p className="small muted">
            ♻️ Auto-salvaged {result.salvaged.count} item{result.salvaged.count === 1 ? '' : 's'} for 🪙 {result.salvaged.gold.toLocaleString()}
            {result.salvaged.stones > 0 && ` and 🔨 ${result.salvaged.stones}`}
          </p>
        )}
        {result.inventoryFull && <p className="warn-text small">Your gear bag is full, so some loot was lost.</p>}
        <div className="modal-actions">
          <button className="btn primary" onClick={onClose}>
            Nice!
          </button>
        </div>
      </div>
    </div>
  );
}
