'use client';

import { useEffect, useRef, useState } from 'react';

export interface ManualBookEntrySubmit {
  isbn: string;
  title: string;
  author: string;
}

interface ManualBookEntryModalProps {
  /** Optional pre-fill — used by the Review-screen "Add missing book"
   *  refactor when it has a partial spine read or a prior canvas attempt. */
  initial?: Partial<ManualBookEntrySubmit>;
  /** Submit handler. The modal only collects values + closes itself —
   *  the parent owns the pipeline call (addManualBook) and post-submit
   *  navigation. The user can fire-and-forget so the modal closes
   *  before the lookup resolves. */
  onSubmit: (values: ManualBookEntrySubmit) => void;
  /** Close without submitting. Cancel button + ESC + backdrop click. */
  onClose: () => void;
}

const ISBN_PATTERN = /^[\dxX]{10}([\dxX]{3})?$/;

/**
 * Shared modal for manual book entry. Used in two places:
 *   - Upload page "Manual entry" button (per-session entry of any book)
 *   - Review-screen "Add missing book" Path B (filling in a missed spine)
 *
 * Mobile: slides up from the bottom (matches Carnegie's other mobile
 * modal patterns). Desktop: centered overlay. The modal does NOT know
 * which surface invoked it — that's the parent's job. Same for batch
 * context: the parent reads it from the surrounding page state.
 *
 * Validation is deliberately permissive: at least ONE of {isbn, title,
 * author} must be filled. ISBN format check (10 or 13 digits, X
 * tolerated) only runs when the field has content. If ISBN is malformed
 * we surface an inline error and disable submit; everything else is
 * passes.
 */
export function ManualBookEntryModal({
  initial,
  onSubmit,
  onClose,
}: ManualBookEntryModalProps) {
  const [isbn, setIsbn] = useState(initial?.isbn ?? '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [author, setAuthor] = useState(initial?.author ?? '');
  const isbnInputRef = useRef<HTMLInputElement>(null);

  // Autofocus ISBN field on open — it's the strongest single signal,
  // so we lead with it.
  useEffect(() => {
    isbnInputRef.current?.focus();
  }, []);

  // ESC closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const cleanIsbn = isbn.replace(/[^\dxX]/g, '');
  const isbnFilled = cleanIsbn.length > 0;
  const isbnValid = !isbnFilled || ISBN_PATTERN.test(cleanIsbn);
  const titleFilled = title.trim().length > 0;
  const authorFilled = author.trim().length > 0;

  const allEmpty = !isbnFilled && !titleFilled && !authorFilled;
  const canSubmit = !allEmpty && isbnValid;

  const guidance = (() => {
    if (allEmpty) return 'Fill in at least one field.';
    if (!isbnValid) return null; // error message takes the slot
    if (isbnFilled && titleFilled) return 'Strong match expected.';
    if (isbnFilled) return 'Strong match expected.';
    if (titleFilled && authorFilled) return 'Good match expected.';
    if (titleFilled) {
      return 'Match may be approximate — you can refine on the Review screen.';
    }
    if (authorFilled) {
      return 'Author alone is rarely enough — add a title or ISBN if you can.';
    }
    return null;
  })();

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit({
      isbn: cleanIsbn,
      title: title.trim(),
      author: author.trim(),
    });
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end md:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Add a book manually"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm animate-backdrop-in" />

      <div
        className={
          'relative w-full md:w-[480px] max-w-full ' +
          'bg-surface-card rounded-t-2xl md:rounded-2xl shadow-2xl ' +
          'animate-modal-in p-5 md:p-6 max-h-[92vh] overflow-y-auto'
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-1">
          <h2 className="typo-page-title text-[24px] md:text-[28px]">Add a book manually</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-text-tertiary hover:text-ink dark:hover:text-cream-50 text-2xl px-2 -mt-1 -mr-2"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <p className="text-[13px] text-text-secondary leading-relaxed mb-5">
          Fill in what you can. ISBN gives the cleanest match. Title and author work too. You can add more details later and re-run the lookup from the Review screen.
        </p>

        {/* ISBN — primary slot */}
        <label className="block">
          <span className="block typo-label mb-1">ISBN</span>
          <input
            ref={isbnInputRef}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={isbn}
            onChange={(e) => setIsbn(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canSubmit) handleSubmit();
            }}
            placeholder="9780006486527"
            className={
              'w-full px-3 py-2.5 text-[14px] font-mono bg-surface-page rounded-md border focus:outline-none focus:ring-1 transition ' +
              (isbnValid
                ? 'border-line focus:border-navy focus:ring-navy'
                : 'border-mahogany focus:border-mahogany focus:ring-mahogany')
            }
          />
          {!isbnValid && (
            <span className="block text-[12px] text-mahogany mt-1">
              ISBN must be 10 or 13 digits.
            </span>
          )}
        </label>

        {/* Title */}
        <label className="block mt-3">
          <span className="block typo-label mb-1">Title</span>
          <input
            type="text"
            autoComplete="off"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canSubmit) handleSubmit();
            }}
            placeholder="The Moral Landscape"
            className="w-full px-3 py-2.5 text-[14px] bg-surface-page rounded-md border border-line focus:outline-none focus:border-navy focus:ring-1 focus:ring-navy transition"
          />
        </label>

        {/* Author */}
        <label className="block mt-3">
          <span className="block typo-label mb-1">Author</span>
          <input
            type="text"
            autoComplete="off"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canSubmit) handleSubmit();
            }}
            placeholder="Sam Harris"
            className="w-full px-3 py-2.5 text-[14px] bg-surface-page rounded-md border border-line focus:outline-none focus:border-navy focus:ring-1 focus:ring-navy transition"
          />
        </label>

        {guidance && (
          <p className="text-[12px] text-text-tertiary mt-3 leading-snug">
            {guidance}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-[14px] rounded-md border border-line text-text-secondary hover:bg-surface-page transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-4 py-2 text-[14px] rounded-md bg-navy text-white font-semibold hover:bg-navy-deep disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Add book
          </button>
        </div>
      </div>
    </div>
  );
}
