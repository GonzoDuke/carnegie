'use client';

/**
 * Per-book full-page editor. Reachable from each Review-table row's
 * pencil button. Two-column layout per spec:
 *
 *   left  (40%)  — large book cover, spine crop below, source meta
 *                  (spine #, source photo, lookup source, confidence),
 *                  Reread button.
 *   right (60%)  — labeled form for every editable field.
 *
 * Form state lives locally in this component so unsaved edits don't
 * propagate to the rest of the app until the user hits Save / Save &
 * Approve. Per-field "modified" detection lights up a navy left
 * border on dirty inputs. Beforeunload + Back / Cancel intercept
 * dirty state and show a discard-confirmation.
 *
 * Reread is preserved-edits aware: after the AI returns, fields the
 * user hasn't modified soak up the new values, dirty fields stay put.
 */

import { useRouter } from 'next/navigation';
import { use, useEffect, useMemo, useState } from 'react';
import { TagChip } from '@/components/TagChip';
import { TagPicker } from '@/components/TagPicker';
import { useStore } from '@/lib/store';
import { toAuthorLastFirst, toTitleCase } from '@/lib/csv-export';
import type { BookRecord, Confidence } from '@/lib/types';

interface PageProps {
  params: Promise<{ bookId: string }>;
}

interface FormState {
  title: string;
  author: string;
  publicationYear: string; // string for input control; parsed on save
  isbn: string;
  publisher: string;
  lcc: string;
  genreTags: string[];
  formTags: string[];
  batchLabel: string;
  notes: string;
}

function bookToForm(b: BookRecord): FormState {
  return {
    title: b.title ?? '',
    author: b.author ?? '',
    publicationYear: b.publicationYear ? String(b.publicationYear) : '',
    isbn: b.isbn ?? '',
    publisher: b.publisher ?? '',
    lcc: b.lcc ?? '',
    genreTags: [...b.genreTags],
    formTags: [...b.formTags],
    batchLabel: b.batchLabel ?? '',
    notes: b.notes ?? '',
  };
}

export default function EditBookPage({ params }: PageProps) {
  const { bookId } = use(params);
  const router = useRouter();
  const { state, updateBook, rereadBook } = useStore();

  const book = state.allBooks.find((b) => b.id === bookId);

  // Snapshot the on-mount values so we can compare for "modified" state.
  // Refresh the snapshot when the user clicks Reread (the new server
  // values become the new baseline for non-dirty fields).
  const [snapshot, setSnapshot] = useState<FormState | null>(() =>
    book ? bookToForm(book) : null
  );
  const [form, setForm] = useState<FormState | null>(() =>
    book ? bookToForm(book) : null
  );
  const [picker, setPicker] = useState<'genre' | 'form' | null>(null);
  const [coverFailed, setCoverFailed] = useState(false);
  const [rereading, setRereading] = useState(false);
  const [rereadErr, setRereadErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // If the book wasn't in state on the first render (e.g. a cold-load
  // hit /review/<id> before the store hydrated), keep watching for it.
  useEffect(() => {
    if (form || !book) return;
    setForm(bookToForm(book));
    setSnapshot(bookToForm(book));
  }, [book, form]);

  // Per-field dirty detection — used by the visual indicator AND by the
  // beforeunload guard.
  const dirty = useMemo<Record<keyof FormState, boolean>>(() => {
    const empty: Record<keyof FormState, boolean> = {
      title: false,
      author: false,
      publicationYear: false,
      isbn: false,
      publisher: false,
      lcc: false,
      genreTags: false,
      formTags: false,
      batchLabel: false,
      notes: false,
    };
    if (!form || !snapshot) return empty;
    return {
      title: form.title !== snapshot.title,
      author: form.author !== snapshot.author,
      publicationYear: form.publicationYear !== snapshot.publicationYear,
      isbn: form.isbn !== snapshot.isbn,
      publisher: form.publisher !== snapshot.publisher,
      lcc: form.lcc !== snapshot.lcc,
      genreTags:
        form.genreTags.length !== snapshot.genreTags.length ||
        form.genreTags.some((t, i) => t !== snapshot.genreTags[i]),
      formTags:
        form.formTags.length !== snapshot.formTags.length ||
        form.formTags.some((t, i) => t !== snapshot.formTags[i]),
      batchLabel: form.batchLabel !== snapshot.batchLabel,
      notes: form.notes !== snapshot.notes,
    };
  }, [form, snapshot]);

  const anyDirty = useMemo(
    () => Object.values(dirty).some(Boolean),
    [dirty]
  );

  // Browser-level navigation guard (refresh, tab close, hardware back).
  // The router.push case is handled separately because Next App Router
  // intercepts navigation before this fires.
  useEffect(() => {
    if (!anyDirty) return;
    function onBefore(e: BeforeUnloadEvent) {
      e.preventDefault();
      // Modern browsers ignore the message but require returnValue.
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', onBefore);
    return () => window.removeEventListener('beforeunload', onBefore);
  }, [anyDirty]);

  // ------------------------- handlers ------------------------------

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function addTag(variant: 'genre' | 'form', tag: string) {
    if (!form) return;
    if (variant === 'genre') {
      if (form.genreTags.includes(tag)) return;
      setField('genreTags', [...form.genreTags, tag]);
    } else {
      if (form.formTags.includes(tag)) return;
      setField('formTags', [...form.formTags, tag]);
    }
  }
  function removeTag(variant: 'genre' | 'form', tag: string) {
    if (!form) return;
    if (variant === 'genre') {
      setField(
        'genreTags',
        form.genreTags.filter((t) => t !== tag)
      );
    } else {
      setField(
        'formTags',
        form.formTags.filter((t) => t !== tag)
      );
    }
  }

  function buildPatch(extra: Partial<BookRecord> = {}): Partial<BookRecord> {
    if (!form) return extra;
    const patch: Partial<BookRecord> = {
      ...extra,
      title: toTitleCase(form.title.trim()),
      author: form.author.trim(),
      authorLF: toAuthorLastFirst(form.author.trim()),
      isbn: form.isbn.replace(/[^\dxX]/g, ''),
      publisher: form.publisher.trim(),
      publicationYear: form.publicationYear
        ? parseInt(form.publicationYear, 10) || 0
        : 0,
      lcc: form.lcc.trim(),
      genreTags: form.genreTags,
      formTags: form.formTags,
      batchLabel: form.batchLabel.trim() || undefined,
      notes: form.notes.trim() || undefined,
    };
    return patch;
  }

  function onCancel() {
    if (anyDirty && !window.confirm('You have unsaved changes. Discard?')) return;
    router.push('/review');
  }

  function onSave(thenApprove = false) {
    if (!book || !form) return;
    setSaving(true);
    updateBook(book.id, buildPatch(thenApprove ? { status: 'approved' } : {}));
    // The store update is synchronous via reducer dispatch; the brief
    // saving flash here is purely for feedback.
    window.setTimeout(() => router.push('/review'), 60);
  }

  async function onReread() {
    if (!book || rereading) return;
    setRereading(true);
    setRereadErr(null);
    const r = await rereadBook(book.id, {});
    setRereading(false);
    if (!r.ok) {
      setRereadErr(r.error ?? 'Reread failed.');
      return;
    }
    // Pull the freshly-updated record off the store and merge into the
    // form: dirty fields keep the user's edits, clean fields adopt the
    // new server values. The snapshot moves to the new server values
    // so the dirty calculation stays correct going forward.
    const next = state.allBooks.find((b) => b.id === book.id);
    if (!next || !form) return;
    const fresh = bookToForm(next);
    setForm((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        title: dirty.title ? prev.title : fresh.title,
        author: dirty.author ? prev.author : fresh.author,
        publicationYear: dirty.publicationYear
          ? prev.publicationYear
          : fresh.publicationYear,
        isbn: dirty.isbn ? prev.isbn : fresh.isbn,
        publisher: dirty.publisher ? prev.publisher : fresh.publisher,
        lcc: dirty.lcc ? prev.lcc : fresh.lcc,
        genreTags: dirty.genreTags ? prev.genreTags : fresh.genreTags,
        formTags: dirty.formTags ? prev.formTags : fresh.formTags,
      };
    });
    setSnapshot(fresh);
  }

  // -------------------------- render -------------------------------

  if (!book || !form || !snapshot) {
    return (
      <div className="space-y-3">
        <BackLink onClick={() => router.push('/review')} />
        <h1 className="typo-page-title">Book not found</h1>
        <p className="typo-page-desc">
          That book isn&rsquo;t in the current session. It may have been removed
          or the session was cleared.
        </p>
      </div>
    );
  }

  const showCover = !!book.coverUrl && !coverFailed;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <BackLink onClick={onCancel} />
        {anyDirty && (
          <span className="text-[11px] text-carnegie-amber">Unsaved changes</span>
        )}
      </div>
      <h1 className="typo-page-title truncate" title={form.title}>
        {form.title || <span className="italic opacity-60">Untitled</span>}
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-[2fr_3fr] gap-6 items-start">
        {/* LEFT — cover + spine + source meta + reread */}
        <aside className="space-y-3">
          <div className="bg-surface-card border border-line rounded-lg overflow-hidden flex items-center justify-center aspect-[2/3] max-w-[260px]">
            {showCover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={book.coverUrl}
                alt={`Cover of ${form.title || 'book'}`}
                loading="lazy"
                onError={() => setCoverFailed(true)}
                className="w-full h-full object-cover"
              />
            ) : book.spineThumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={book.spineThumbnail}
                alt={`Spine read for ${form.title || 'book'}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-[11px] text-text-quaternary">no cover</span>
            )}
          </div>

          {book.spineThumbnail && book.coverUrl && (
            <div className="flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={book.spineThumbnail}
                alt="Spine read"
                className="w-12 h-32 object-cover rounded border border-line bg-surface-page"
              />
              <div className="text-[11px] text-text-tertiary leading-relaxed">
                Spine read — what the model saw on the shelf.
              </div>
            </div>
          )}

          <div className="bg-surface-card border border-line rounded-lg p-3 space-y-2">
            <button
              type="button"
              onClick={onReread}
              disabled={rereading || !book.ocrImage}
              title={
                book.ocrImage
                  ? 'Re-run the AI on the same crop. Your edited fields are preserved.'
                  : 'Reread unavailable — the high-res crop wasn\'t preserved.'
              }
              className="w-full text-[12px] px-3 py-1.5 rounded border border-line text-text-secondary hover:border-navy hover:text-navy hover:bg-navy-soft transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {rereading ? '⟳ Rereading…' : '↻ Reread spine'}
            </button>
            {rereadErr && (
              <div className="text-[11px] text-carnegie-red">{rereadErr}</div>
            )}
            <div className="flex flex-col gap-1.5 text-[11px] text-text-tertiary pt-1 border-t border-line-light">
              <div className="flex justify-between">
                <span className="typo-label">Spine</span>
                <span className="text-text-secondary font-mono">
                  #{book.spineRead.position}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="typo-label">Source</span>
                <span className="text-text-secondary truncate text-right">
                  {book.sourcePhoto}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="typo-label">Lookup</span>
                <span className="text-text-secondary capitalize">
                  {book.lookupSource === 'openlibrary'
                    ? 'Open Library'
                    : book.lookupSource === 'googlebooks'
                      ? 'Google Books'
                      : book.lookupSource === 'isbndb'
                        ? 'ISBNdb'
                        : 'No match'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="typo-label">Confidence</span>
                <ConfChip level={book.confidence} />
              </div>
            </div>
          </div>
        </aside>

        {/* RIGHT — form */}
        <section className="space-y-4">
          <FormField
            label="Title"
            modified={dirty.title}
            value={form.title}
            onChange={(v) => setField('title', v)}
          />
          <FormField
            label="Author"
            modified={dirty.author}
            value={form.author}
            onChange={(v) => setField('author', v)}
          />
          <div className="grid grid-cols-[120px_1fr] gap-3">
            <FormField
              label="Year"
              type="number"
              modified={dirty.publicationYear}
              value={form.publicationYear}
              onChange={(v) => setField('publicationYear', v.replace(/[^\d]/g, ''))}
            />
            <FormField
              label="ISBN"
              mono
              modified={dirty.isbn}
              value={form.isbn}
              onChange={(v) => setField('isbn', v)}
            />
          </div>
          <FormField
            label="Publisher"
            modified={dirty.publisher}
            value={form.publisher}
            onChange={(v) => setField('publisher', v)}
          />
          <FormField
            label="LCC classification"
            mono
            modified={dirty.lcc}
            value={form.lcc}
            onChange={(v) => setField('lcc', v)}
          />

          {/* Tags */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="typo-label">Genre tags</span>
              {dirty.genreTags && (
                <span className="text-[10px] text-navy">modified</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 relative">
              {form.genreTags.map((t) => (
                <TagChip
                  key={`g-${t}`}
                  tag={t}
                  variant="genre"
                  onRemove={() => removeTag('genre', t)}
                />
              ))}
              <button
                type="button"
                onClick={() => setPicker(picker === 'genre' ? null : 'genre')}
                className="text-[11px] px-2 py-0.5 rounded-full border border-dashed border-line text-text-quaternary hover:border-navy hover:text-navy transition"
              >
                + add genre
              </button>
              {picker === 'genre' && (
                <TagPicker
                  variant="genre"
                  existing={[...form.genreTags, ...form.formTags]}
                  onAdd={(t) => addTag('genre', t)}
                  onClose={() => setPicker(null)}
                />
              )}
            </div>

            <div className="flex items-center justify-between mt-2">
              <span className="typo-label">Form tags</span>
              {dirty.formTags && (
                <span className="text-[10px] text-navy">modified</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 relative">
              {form.formTags.map((t) => (
                <TagChip
                  key={`f-${t}`}
                  tag={t}
                  variant="form"
                  onRemove={() => removeTag('form', t)}
                />
              ))}
              <button
                type="button"
                onClick={() => setPicker(picker === 'form' ? null : 'form')}
                className="text-[11px] px-2 py-0.5 rounded-full border border-dashed border-line text-text-quaternary hover:border-navy hover:text-navy transition"
              >
                + add form
              </button>
              {picker === 'form' && (
                <TagPicker
                  variant="form"
                  existing={[...form.genreTags, ...form.formTags]}
                  onAdd={(t) => addTag('form', t)}
                  onClose={() => setPicker(null)}
                />
              )}
            </div>
          </div>

          <FormField
            label="Batch label"
            modified={dirty.batchLabel}
            value={form.batchLabel}
            onChange={(v) => setField('batchLabel', v)}
            placeholder='e.g. "Shelf 3", "Box 4"'
          />

          {/* Notes — textarea */}
          <div>
            <label className="typo-label block mb-1">Notes</label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setField('notes', e.target.value)}
              placeholder="Signed, dedication, condition, anything that should land in the LibraryThing COMMENTS column…"
              className={`w-full bg-surface-card rounded-md px-3 py-2 text-[13px] text-text-primary placeholder:text-text-quaternary focus:outline-none focus:border-navy transition-colors resize-y ${
                dirty.notes
                  ? 'border-l-[3px] border-l-navy border-y border-r border-line'
                  : 'border border-line'
              }`}
            />
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-line">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="text-[13px] font-medium px-4 py-1.5 rounded-md border border-line text-text-secondary hover:bg-surface-page transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSave(false)}
              disabled={saving}
              className="text-[13px] font-medium px-4 py-1.5 rounded-md bg-navy text-white hover:bg-navy-deep transition disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => onSave(true)}
              disabled={saving}
              className="text-[13px] font-medium px-4 py-1.5 rounded-md bg-carnegie-gold text-text-primary hover:bg-[#B8985A] transition disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save & Approve'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-[12px] text-text-secondary hover:text-navy transition"
    >
      <span aria-hidden>←</span>
      Back to Review
    </button>
  );
}

function FormField({
  label,
  value,
  modified,
  onChange,
  type,
  mono,
  placeholder,
}: {
  label: string;
  value: string;
  modified: boolean;
  onChange: (v: string) => void;
  type?: 'text' | 'number';
  mono?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="typo-label">{label}</label>
        {modified && (
          <span className="text-[10px] text-navy">modified</span>
        )}
      </div>
      <input
        type={type ?? 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full bg-surface-card rounded-md px-3 py-1.5 text-[13px] text-text-primary placeholder:text-text-quaternary focus:outline-none focus:border-navy transition-colors ${
          mono ? 'font-mono text-[12px]' : ''
        } ${
          modified
            ? 'border-l-[3px] border-l-navy border-y border-r border-line'
            : 'border border-line'
        }`}
      />
    </div>
  );
}

function ConfChip({ level }: { level: Confidence }) {
  const cls =
    level === 'HIGH'
      ? 'bg-carnegie-green-soft text-carnegie-green'
      : level === 'MEDIUM'
        ? 'bg-carnegie-amber-soft text-carnegie-amber'
        : 'bg-carnegie-red-soft text-carnegie-red';
  const label = level === 'HIGH' ? 'High' : level === 'MEDIUM' ? 'Med' : 'Low';
  return (
    <span
      className={`inline-block text-[9px] font-semibold uppercase tracking-[0.3px] px-1.5 py-0.5 rounded ${cls}`}
    >
      {label}
    </span>
  );
}

