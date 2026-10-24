// Small controlled form primitives for the admin editors.
import { useEffect, useState, type ReactNode } from 'react';

export function Field({ label, hint, wide, children }: { label: string; hint?: ReactNode; wide?: boolean; children: ReactNode }) {
  return (
    <label className={`f ${wide ? 'wide' : ''}`}>
      <span className="f-label">{label}</span>
      {children}
      {hint && <small className="f-hint">{hint}</small>}
    </label>
  );
}

export function FormGrid({ children }: { children: ReactNode }) {
  return <div className="f-grid">{children}</div>;
}

export function Section({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="ed-section">
      <div className="ed-section-head">
        <h3>{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function TextInput({
  value,
  onChange,
  disabled,
  placeholder,
  multiline,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  multiline?: boolean;
}) {
  return multiline ? (
    <textarea value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder={placeholder} rows={3} />
  ) : (
    <input value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder={placeholder} />
  );
}

/** Number input that keeps the raw text while typing (so "1." or "-" don't get clobbered). */
export function NumberInput({
  value,
  onChange,
  step = 1,
  min,
  max,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      type="number"
      value={text}
      step={step}
      min={min}
      max={max}
      disabled={disabled}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== '' && Number.isFinite(n)) onChange(n);
      }}
    />
  );
}

export interface Option<T> {
  value: T;
  label: string;
}

export function Select<T extends string | number | null>({
  value,
  onChange,
  options,
  disabled,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Option<T>[];
  disabled?: boolean;
}) {
  const index = options.findIndex((o) => o.value === value);
  return (
    <select value={index} disabled={disabled} onChange={(e) => onChange(options[Number(e.target.value)]!.value)}>
      {index < 0 && <option value={-1}>— missing: {String(value)} —</option>}
      {options.map((o, i) => (
        <option key={i} value={i}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="f-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  );
}

/** Toggle chips for picking several ids. */
export function MultiPick({ values, onChange, options, max }: { values: string[]; onChange: (v: string[]) => void; options: Option<string>[]; max?: number }) {
  return (
    <div className="f-chips">
      {options.map((o) => {
        const on = values.includes(o.value);
        return (
          <button
            type="button"
            key={o.value}
            className={`chip ${on ? 'active' : ''}`}
            disabled={!on && max !== undefined && values.length >= max}
            onClick={() => onChange(on ? values.filter((v) => v !== o.value) : [...values, o.value])}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export const options = <T extends string>(values: readonly T[], label: (v: T) => string = (v) => v): Option<T>[] =>
  values.map((v) => ({ value: v, label: label(v) }));
