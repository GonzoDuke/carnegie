'use client';

import { useState } from 'react';
import type { BookRecord, Confidence } from '@/lib/types';
import { useStore } from '@/lib/store';
import { TagChip } from './TagChip';
import { TagPicker } from './TagPicker';

/**
 * One row in the compact Review table — collapsed: cover, title + meta line,
 * confidence badge, tag pills (truncated), ✓ / ✕ buttons. Click anywhere on
 * the row to toggle the detail panel below it (publisher, LCC + provenance
 * badge, source / spine number, batch label, full tag list with add/remove,
 * Reread button).
 *
 * Per the v3 redesign §4: warnings collapse to a single inline amber dot
 * before the title; the full-width warning banners that lived on the card
 * version are gone.
 */
export function BookTableRow({ book }: { book: BookRecord }) {
  const { updateBook, rereadBook } = useStore();
  const [open, setOpen] = useState(false);
  const [picker, setPicker] = useState<'genre' | 'form' | null>(null);
  const [coverFailed, setCoverFailed] = useState(false);
  const [rereading, setRereading] = useState(false);
  const [rereadErr, setRereadErr] = useState<string | null>(null);

  const showCover = !!book.coverUrl && !coverFailed;
  const hasWarning =
    (book.warnings && book.warnings.length > 0) ||
    !!book.previouslyExported ||
    !!(book.duplicateGroup && !book.duplicateResolved) ||
    book.confidence === 'LOW';

  const isApproved = book.status === 'approved';
  const isRejected = book.status === 'rejected';

  const tagsCondensed = book.genreTags.slice(0, 2);
  const tagsExtra = book.genreTags.length + book.formTags.length - tagsCondensed.length;

  function setStatus(next: 'approved' | 'rejected') {
    updateBook(book.id, { status: book.status === next ? 'pending' : next });
  }

  function addTag(variant: 'genre' | 'form', tag: string) {
    if (variant === 'genre') {
      updateBook(book.id, { genreTags: [...book.genreTags, tag] });
    } else {
      updateBook(book.id, { formTags: [...book.formTags, tag] });
    }
  }
  function removeTag(variant: 'genre' | 'form', tag: string) {
    if (variant === 'genre') {
      updateBook(book.id, { genreTags: book.genreTags.filter((t) => t !== tag) });
    } else {
      updateBook(book.id, { formTags: book.formTags.filter((t) => t !== tag) });
    }
  }

  async function onReread() {
    if (rereading) return;
    setRereading(true);
    setRereadErr(null);
    const r = await rereadBook(book.id, {});
    setRereading(false);
    if (!r.ok) setRereadErr(r.error ?? 'Reread failed.');
  }

  // Provenance label for the LCC line in the detail panel.
  const lccProvenance =
    book.lccSource === 'spine'
      ? 'from spine'
      : book.lccSource === 'loc'
        ? 'from LoC'
        : book.lccSource === 'wikidata'
          ? 'from Wikidata'
          : book.lccSource === 'inferred'
            ? 'AI-inferred'
            : null;

  // Single-color row tint by status. Approved rows get a faint gold wash;
  // rejected rows dim. Hover only fires on pending rows so the status
  // signal isn't muddied by a hover state.
  const rowTint = isApproved
    ? 'bg-[#FAF4E5] dark:bg-[#3A2F1B]/60'
    : isRejected
      ? 'opacity-30'
      : 'hover:bg-[#FBFBFA] dark:hover:bg-[#2E2C29]';

  return (
    <>
      <div
        onClick={() => setOpen((v) => !v)}
        className={`grid grid-cols-[52px_1fr_80px_200px_100px] items-center gap-3 px-[14px] py-[10px] border-b border-line-light dark:border-[#2E2C29] cursor-pointer transition-colors ${rowTint}`}
        role="button"
        aria-expanded={open}
      >
        {/* Cover */}
        <div className="w-9 h-[52px] rounded bg-surface-page dark:bg-ink/40 border border-line-light dark:border-[#2E2C29] overflow-hidden flex items-center justify-center text-[7px] text-text-quaternary">
          {showCover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={book.coverUrl}
              alt={`Cover of ${book.title || 'unknown book'}`}
              loading="lazy"
              onError={() => setCoverFailed(true)}
              className="w-full h-full object-cover"
            />
          ) : book.spineThumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={book.spineThumbnail}
              alt={`Spine read for ${book.title || 'unknown book'}`}
              loading="lazy"
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="opacity-60">no img</span>
          )}
        </div>

        {/* Title + metadata */}
        <div className="min-w-0 pr-2">
          <div className="typo-card-title truncate">
            {hasWarning && (
              <span
                aria-hidden
                title="This book needs attention — open to review."
                className="inline-block w-[5px] h-[5px] rounded-full bg-carnegie-amber mr-1.5 align-middle"
              />
            )}
            {book.title || <span className="italic opacity-60">Untitled spine</span>}
          </div>
          <div className="text-[11px] text-text-tertiary mt-0.5 truncate">
            {book.author || 'Unknown author'}
            {book.isbn && (
              <>
                <span className="mx-1.5 text-text-quaternary">·</span>
                <span className="font-mono text-[10px]">{book.isbn}</span>
              </>
            )}
            {book.publicationYear ? (
              <>
                <span className="mx-1.5 text-text-quaternary">·</span>
                {book.publicationYear}
              </>
            ) : null}
          </div>
        </div>

        {/* Confidence */}
        <div>
          <ConfChip level={book.confidence} />
        </div>

        {/* Tags (compact) */}
        <div className="flex items-center gap-1 overflow-hidden">
          {tagsCondensed.map((t) => (
            <TagChip key={t} tag={t} variant="genre" size="sm" />
          ))}
          {tagsExtra > 0 && (
            <span className="text-[10px] text-text-quaternary">+{tagsExtra}</span>
          )}
        </div>

        {/* Actions — small ✓ ✕ */}
        <div className="flex items-center gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => setStatus('approved')}
            disabled={rereading}
            aria-label="Approve"
            className={`w-7 h-7 rounded text-xs font-semibold border transition ${
              isApproved
                ? 'bg-carnegie-gold border-carnegie-gold text-text-primary'
                : 'border-line text-text-tertiary hover:border-navy hover:text-navy hover:bg-navy-soft'
            }`}
          >
            ✓
          </button>
          <button
            type="button"
            onClick={() => setStatus('rejected')}
            disabled={rereading}
            aria-label="Reject"
            className={`w-7 h-7 rounded text-xs font-semibold border transition ${
              isRejected
                ? 'bg-carnegie-red-soft border-carnegie-red text-carnegie-red'
                : 'border-line text-text-tertiary hover:border-carnegie-red hover:text-carnegie-red hover:bg-carnegie-red-soft'
            }`}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Detail panel */}
      {open && (
        <div className="bg-surface-page dark:bg-ink/40 px-[66px] py-[14px] border-b border-line dark:border-[#2E2C29]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 mb-3">
            <DetailField label="Publisher" value={book.publisher || '—'} />
            <DetailField
              label="LCC"
              value={book.lcc || '—'}
              mono
              suffix={lccProvenance}
            />
            <DetailField
              label="Source"
              value={
                book.manuallyAdded
                  ? 'Manually added'
                  : `${
                      book.lookupSource === 'openlibrary'
                        ? 'Open Library'
                        : book.lookupSource === 'googlebooks'
                          ? 'Google Books'
                          : book.lookupSource === 'isbndb'
                            ? 'ISBNdb'
                            : 'No match'
                    } · spine #${book.spineRead.position}`
              }
            />
            <DetailField label="Batch" value={book.batchLabel || 'Unlabeled'} />
          </div>

          {/* Inline warnings, if any */}
          {book.warnings && book.warnings.length > 0 && (
            <ul className="text-[11px] text-carnegie-amber mb-3 space-y-0.5 list-disc list-inside">
              {book.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}

          {/* Tags — full list with add/remove */}
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            {book.genreTags.map((t) => (
              <TagChip
                key={`g-${t}`}
                tag={t}
                variant="genre"
                onRemove={() => removeTag('genre', t)}
              />
            ))}
            {book.formTags.map((t) => (
              <TagChip
                key={`f-${t}`}
                tag={t}
                variant="form"
                onRemove={() => removeTag('form', t)}
              />
            ))}
            <button
              type="button"
              onClick={() => setPicker(picker === 'genre' ? null : 'genre')}
              className="text-[10px] px-2 py-0.5 rounded border border-dashed border-line text-text-quaternary hover:border-navy hover:text-navy transition"
            >
              + add genre
            </button>
            <button
              type="button"
              onClick={() => setPicker(picker === 'form' ? null : 'form')}
              className="text-[10px] px-2 py-0.5 rounded border border-dashed border-line text-text-quaternary hover:border-navy hover:text-navy transition"
            >
              + add form
            </button>
            {picker && (
              <div className="relative w-full">
                <TagPicker
                  variant={picker}
                  existing={[...book.genreTags, ...book.formTags]}
                  onAdd={(t) => addTag(picker, t)}
                  onClose={() => setPicker(null)}
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onReread}
              disabled={rereading || !book.ocrImage}
              title={
                book.ocrImage
                  ? 'Re-run the AI on the same crop'
                  : 'Reread unavailable — high-res crop wasn\'t preserved'
              }
              className="text-xs px-3 py-1.5 rounded border border-line text-text-secondary hover:border-navy hover:text-navy hover:bg-navy-soft transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {rereading ? '⟳ Rereading…' : '↻ Reread'}
            </button>
            {rereadErr && (
              <span className="text-[11px] text-carnegie-red">{rereadErr}</span>
            )}
          </div>
        </div>
      )}
    </>
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

function DetailField({
  label,
  value,
  mono,
  suffix,
}: {
  label: string;
  value: string;
  mono?: boolean;
  suffix?: string | null;
}) {
  return (
    <div className="flex items-baseline gap-2 min-w-0">
      <span className="typo-label flex-shrink-0">{label}</span>
      <span
        className={`text-[12px] text-text-primary dark:text-text-primary truncate ${
          mono ? 'font-mono text-[11px]' : ''
        }`}
      >
        {value}
      </span>
      {suffix && (
        <span className="text-[9px] uppercase tracking-wider text-text-tertiary">
          {suffix}
        </span>
      )}
    </div>
  );
}
