import { UI_ICONS } from '@gacha/shared';
import { useState } from 'react';
import { api } from '../../api';
import { sfx } from '../../audio/sfx';
import { Icon, IconOr } from '../../components/Art';
import { useContent } from '../../state/content';
import { useProfile } from '../../state/profile';

/** The materials tab: what you hold, and the shop. */
export function MaterialsTab() {
  const { profile, mutate } = useProfile();
  const content = useContent();
  const [qty, setQty] = useState<Record<string, number>>({});
  const shop = content.settings.progression.shop;
  return (
    <div className="materials-tab">
      <section className="panel">
        <h3>Materials</h3>
        <div className="mat-grid">
          {content.bundle.materials.map((m) => (
            <div key={m.id} className={`mat-card r${m.rarity}`}>
              <IconOr icon={m.icon} emoji={m.emoji} size={48} />
              <div>
                <b>{m.name}</b> <span className="mat-count">×{profile.materials[m.id] ?? 0}</span>
                <p className="small muted">{m.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <h3>Shop</h3>
        <div className="shop">
          {shop.map((e) => {
            const m = content.materialsById[e.material];
            if (!m) return null;
            const n = qty[e.material] ?? 1;
            const gold = e.gold * n;
            const stardust = e.stardust * n;
            const ok = profile.wallet.gold >= gold && profile.wallet.stardust >= stardust;
            return (
              <div key={e.material} className="shop-row">
                <IconOr icon={m.icon} emoji={m.emoji} size={32} />
                <span className="shop-name">
                  {m.name} <small className="muted">(own {profile.materials[m.id] ?? 0})</small>
                </span>
                <span className="filters shop-qty">
                  {[1, 5, 10].map((q) => (
                    <button key={q} className={`chip ${n === q ? 'active' : ''}`} onClick={() => setQty({ ...qty, [e.material]: q })}>
                      ×{q}
                    </button>
                  ))}
                </span>
                <span className="shop-price">
                  {gold > 0 && (
                    <span>
                      <Icon id={UI_ICONS.gold} size={16} /> {gold.toLocaleString()}
                    </span>
                  )}
                  {stardust > 0 && (
                    <span>
                      <Icon id={UI_ICONS.stardust} size={16} /> {stardust.toLocaleString()}
                    </span>
                  )}
                </span>
                <button
                  className="btn small primary"
                  disabled={!ok}
                  onClick={async () => {
                    if (await mutate(() => api.buy(e.material, n), `Bought ${n}× ${m.name}`)) sfx.coins();
                  }}
                >
                  Buy
                </button>
              </div>
            );
          })}
          {!shop.length && <p className="muted">The shop is empty.</p>}
        </div>
      </section>
    </div>
  );
}
