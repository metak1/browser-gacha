import { ICON_COUNT, SPRITES, type SpriteClip } from '@gacha/shared';
import { useState } from 'react';
import { Icon, UnitArt } from '../components/Art';
import { Field } from './fields';

// Rough sections of the Raven Fantasy Icons sheet, for browsing.
const ICON_SECTIONS = [
  { label: 'Items & loot', from: 1, to: 592 },
  { label: 'Status & buffs', from: 593, to: 736 },
  { label: 'Spells', from: 737, to: 1104 },
  { label: 'Skill tiles', from: 1105, to: 1440 },
  { label: 'Weapons', from: 1441, to: 1808 },
  { label: 'Armor & trinkets', from: 1809, to: ICON_COUNT },
];

/** Choose an icon from the sheet (or none). */
export function IconField({ label, value, onChange, hint }: { label: string; value: number | null; onChange: (v: number | null) => void; hint?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Field label={label} hint={hint}>
      <div className="icon-field">
        <button type="button" className="icon-field-current" onClick={() => setOpen(true)} title="Choose icon">
          {value ? <Icon id={value} size={32} /> : <span className="muted small">none</span>}
        </button>
        <span className="small muted">{value ? `#${value}` : 'Uses the emoji'}</span>
        <button type="button" className="btn small" onClick={() => setOpen(true)}>
          Browse…
        </button>
        {value !== null && (
          <button type="button" className="btn small" onClick={() => onChange(null)}>
            Clear
          </button>
        )}
      </div>
      {open && (
        <IconBrowser
          value={value}
          onPick={(v) => {
            onChange(v);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </Field>
  );
}

function IconBrowser({ value, onPick, onClose }: { value: number | null; onPick: (v: number) => void; onClose: () => void }) {
  const initial = value
    ? Math.max(
        0,
        ICON_SECTIONS.findIndex((s) => value >= s.from && value <= s.to),
      )
    : 2;
  const [section, setSection] = useState(initial);
  const [jump, setJump] = useState('');
  const s = ICON_SECTIONS[section]!;
  const ids = Array.from({ length: s.to - s.from + 1 }, (_, i) => s.from + i);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal icon-browser" onClick={(e) => e.stopPropagation()}>
        <div className="icon-browser-head">
          <div className="filters">
            {ICON_SECTIONS.map((sec, i) => (
              <button key={sec.label} type="button" className={`chip ${i === section ? 'active' : ''}`} onClick={() => setSection(i)}>
                {sec.label}
              </button>
            ))}
          </div>
          <form
            className="icon-jump"
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(jump);
              if (n >= 1 && n <= ICON_COUNT) onPick(n);
            }}
          >
            <input value={jump} onChange={(e) => setJump(e.target.value)} placeholder="#" inputMode="numeric" />
            <button className="btn small">Use #</button>
          </form>
          <button type="button" className="icon-mini" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
        <div className="icon-grid">
          {ids.map((id) => (
            <button key={id} type="button" className={`icon-cell ${id === value ? 'selected' : ''}`} onClick={() => onPick(id)} title={`#${id}`}>
              <Icon id={id} size={32} />
            </button>
          ))}
        </div>
        <p className="small muted">Raven Fantasy Icons by Clockwork Raven Studios.</p>
      </div>
    </div>
  );
}

const PREVIEW_CLIPS: SpriteClip[] = ['idle', 'walk', 'attack1', 'attack2', 'attack3', 'hurt', 'death'];

/** Choose an animated sprite, with a live preview of each clip. */
export function SpriteField({ value, onChange, emoji }: { value: string | null; onChange: (v: string | null) => void; emoji: string }) {
  const [clip, setClip] = useState<SpriteClip>('idle');
  const [key, setKey] = useState(0);
  const def = value ? SPRITES[value] : undefined;
  return (
    <Field label="Animated sprite" hint="Pixel-art character used in battle and on cards. Leave empty to use the emoji." wide>
      <div className="sprite-field">
        <div className="sprite-stage">
          <UnitArt sprite={value} emoji={emoji} height="72px" clip={clip} playKey={key} />
        </div>
        <div className="sprite-controls">
          <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
            <option value="">— none (emoji) —</option>
            {Object.values(SPRITES).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            {value && !def && <option value={value}>{value} (missing — run npm run assets)</option>}
          </select>
          {def && (
            <div className="f-chips">
              {PREVIEW_CLIPS.filter((c) => def.clips[c]).map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`chip ${clip === c ? 'active' : ''}`}
                  onClick={() => {
                    setClip(c);
                    setKey((k) => k + 1);
                  }}
                >
                  {c} · {def.clips[c]}f
                </button>
              ))}
            </div>
          )}
          {def && <small className="muted">From “{def.pack}”</small>}
        </div>
      </div>
    </Field>
  );
}
