import type { ContentKind } from '@gacha/shared';
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { api, ApiError, errorMessage } from '../api';
import { useContentState } from '../state/content';
import { useToast } from '../state/toast';

export interface FormProps<T> {
  value: T;
  onChange: (value: T) => void;
  /** True until the document has been saved once (ids are editable only then). */
  isNew: boolean;
}

interface Props<T extends { id: string | number }> {
  kind: ContentKind;
  title: string;
  singular: string;
  items: T[];
  label: (item: T) => ReactNode;
  search: (item: T) => string;
  blank: () => T;
  Form: ComponentType<FormProps<T>>;
  /** Extra panel under the form for saved documents (e.g. the stage simulator). */
  extra?: ComponentType<{ value: T }>;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Generic list + form editor for one kind of content. Drafts are local until
 * saved; the server validates the whole bundle and returns problems, which are
 * shown above the form.
 */
export function EntityEditor<T extends { id: string | number; name?: string }>(props: Props<T>) {
  const { kind, title, singular, items, label, search, blank, Form, extra: Extra } = props;
  const { setBundle } = useContentState();
  const toast = useToast();
  const [selectedId, setSelectedId] = useState<string | number | null>(items[0]?.id ?? null);
  const [isNew, setIsNew] = useState(false);
  const [draft, setDraft] = useState<T | null>(items[0] ? structuredClone(items[0]) : null);
  const [errors, setErrors] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const original = useMemo(() => items.find((i) => i.id === selectedId) ?? null, [items, selectedId]);

  // Re-sync the draft when switching documents or when the saved copy changes.
  useEffect(() => {
    if (!isNew) setDraft(original ? structuredClone(original) : null);
  }, [original, isNew]);

  const dirty = isNew || (draft !== null && original !== null && !same(draft, original));
  const filtered = items.filter((i) => search(i).toLowerCase().includes(query.trim().toLowerCase()));

  const confirmDiscard = () => !dirty || confirm('Discard unsaved changes?');

  function select(id: string | number) {
    if (id === selectedId && !isNew) return;
    if (!confirmDiscard()) return;
    setErrors([]);
    setIsNew(false);
    setSelectedId(id);
  }

  function startNew(doc: T) {
    if (!confirmDiscard()) return;
    setErrors([]);
    setIsNew(true);
    setSelectedId(null);
    setDraft(doc);
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const bundle = await api.admin.save(kind, draft as never);
      setErrors([]);
      setIsNew(false);
      setSelectedId(draft.id);
      setBundle(bundle);
      toast(`Saved ${singular} "${draft.name ?? draft.id}"`);
    } catch (err) {
      setErrors(err instanceof ApiError ? err.message.split(/\n|; /) : [errorMessage(err)]);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!original || !confirm(`Delete ${singular} "${original.name ?? original.id}"? This can't be undone.`)) return;
    try {
      const bundle = await api.admin.remove(kind, original.id);
      setErrors([]);
      setSelectedId(items.find((i) => i.id !== original.id)?.id ?? null);
      setBundle(bundle);
      toast(`Deleted ${singular}`);
    } catch (err) {
      setErrors(err instanceof ApiError ? err.message.split(/\n|; /) : [errorMessage(err)]);
    }
  }

  function duplicate() {
    if (!draft) return;
    const copy = structuredClone(draft) as T & { name?: string };
    if (typeof copy.id === 'number') (copy as { id: number }).id = Math.max(0, ...items.map((i) => Number(i.id))) + 1;
    else (copy as { id: string }).id = `${copy.id}-copy`;
    if (copy.name) copy.name = `${copy.name} (copy)`;
    startNew(copy);
  }

  return (
    <div className="ed">
      <aside className="ed-list">
        <div className="ed-list-head">
          <h2>{title}</h2>
          <button className="btn small primary" onClick={() => startNew(blank())}>
            + New
          </button>
        </div>
        <input className="ed-search" placeholder={`Search ${title.toLowerCase()}…`} value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="ed-items">
          {isNew && <div className="ed-item active new">✳️ New {singular}</div>}
          {filtered.map((item) => (
            <button
              key={item.id}
              className={`ed-item ${item.id === selectedId && !isNew ? 'active' : ''}`}
              onClick={() => select(item.id)}
            >
              {label(item)}
            </button>
          ))}
          {!filtered.length && <p className="muted small">Nothing matches.</p>}
        </div>
        <small className="muted">{items.length} total</small>
      </aside>

      <section className="ed-form">
        {draft ? (
          <>
            <div className="ed-toolbar">
              <h2>
                {isNew ? `New ${singular}` : (draft.name ?? String(draft.id))}
                {dirty && <span className="ed-dirty">● unsaved</span>}
              </h2>
              <div className="ed-actions">
                {!isNew && (
                  <button className="btn small" onClick={duplicate}>
                    Duplicate
                  </button>
                )}
                {!isNew && (
                  <button className="btn small danger" onClick={remove}>
                    Delete
                  </button>
                )}
                {dirty && (
                  <button
                    className="btn small"
                    onClick={() => {
                      setErrors([]);
                      if (isNew) {
                        setIsNew(false);
                        setSelectedId(items[0]?.id ?? null);
                      } else setDraft(structuredClone(original!));
                    }}
                  >
                    {isNew ? 'Cancel' : 'Revert'}
                  </button>
                )}
                <button className="btn small primary" disabled={!dirty || saving} onClick={save}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
            {errors.length > 0 && (
              <div className="ed-errors" role="alert">
                <b>Can't save:</b>
                <ul>
                  {errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
            <Form value={draft} onChange={setDraft} isNew={isNew} />
            {Extra && !isNew && original && <Extra value={original} />}
          </>
        ) : (
          <p className="muted center">Nothing here yet. Press “+ New” to create the first {singular}.</p>
        )}
      </section>
    </div>
  );
}
