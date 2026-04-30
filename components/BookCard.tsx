'use client';

import { useState } from 'react';
import type { BookRecord } from '@/lib/types';
import { useStore } from '@/lib/store';
import { TagChip } from './TagChip';
import { TagPicker } from './TagPicker';
import { ConfidenceBadge } from './ConfidenceBadge';
import { toAuthorLastFirst } from '@/lib/csv-export';

interface BookCardProps {
  book: BookRecord;
}

export function BookCard({ book }: BookCardProps) {
  const { updateBook } = useStore();
  const [showReasoning, setShowReasoning] = useState(false);
  const [picker, setPicker] = useState<'genre' | 'form' | null>(null);
  const [editing, setEditing] = useState<null | 'title' | 'author' | 'isbn' | 'publisher' | 'year' | 'lcc'>(null);

  const borderClass =
    book.status === 'approved'
      ? 'border-green-400 dark:border-green-600 ring-1 ring-green-300/50'
      : book.status === 'rejected'
      ? 'border-red-300 dark:border-red-800 opacity-60'
      : 'border-cream-300 dark:border-ink-soft';

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

  const hasWarnings = book.warnings.length > 0;
  const lowConfidence = book.confidence === 'LOW';

  return (
    <article
      className={`relative bg-cream-50 dark:bg-ink-soft/60 border ${borderClass} rounded-lg p-5 shadow-sm transition-all duration-200 ease-gentle`}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {editing === 'title' ? (
            <input
              autoFocus
              defaultValue={book.title}
              onBlur={(e) => {
                updateBook(book.id, { title: e.target.value });
                setEditing(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setEditing(null);
              }}
              className="font-serif text-xl font-medium w-full bg-transparent border-b border-accent focus:outline-none"
            />
          ) : (
            <h2
              className="font-serif text-xl font-medium leading-tight cursor-text"
              onClick={() => setEditing('title')}
              title="Click to edit title"
            >
              {book.title || <span className="italic opacity-60">Untitled spine</span>}
            </h2>
          )}
          <div className="text-xs text-ink/60 dark:text-cream-300/60 mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
            <EditableField
              value={book.author}
              onSave={(v) =>
                updateBook(book.id, {
                  author: v,
                  authorLF: toAuthorLastFirst(v),
                })
              }
              placeholder="Unknown author"
              fontFamily="sans"
            />
            {book.isbn && (
              <>
                <span>·</span>
                <EditableField
                  value={book.isbn}
                  onSave={(v) => updateBook(book.id, { isbn: v })}
                  placeholder="No ISBN"
                  fontFamily="mono"
                />
              </>
            )}
            {!book.isbn && (
              <>
                <span>·</span>
                <EditableField
                  value=""
                  onSave={(v) => updateBook(book.id, { isbn: v })}
                  placeholder="No ISBN"
                  fontFamily="mono"
                />
              </>
            )}
            <span>·</span>
            <EditableField
              value={book.publisher}
              onSave={(v) => updateBook(book.id, { publisher: v })}
              placeholder="No publisher"
              fontFamily="sans"
            />
            <span>·</span>
            <EditableField
              value={book.publicationYear ? String(book.publicationYear) : ''}
              onSave={(v) =>
                updateBook(book.id, { publicationYear: parseInt(v, 10) || 0 })
              }
              placeholder="No year"
              fontFamily="mono"
            />
            <span>·</span>
            <EditableField
              value={book.lcc}
              onSave={(v) => updateBook(book.id, { lcc: v })}
              placeholder="No LCC"
              fontFamily="mono"
            />
          </div>
        </div>
        <ConfidenceBadge level={book.confidence} />
      </div>

      {/* Warning banner */}
      {(lowConfidence || hasWarnings) && (
        <div
          className={`mt-3 px-3 py-2 rounded text-xs ${
            lowConfidence
              ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-900/40'
              : 'bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-900/40'
          }`}
        >
          {book.warnings.length > 0 ? (
            <ul className="list-disc list-inside space-y-0.5">
              {book.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          ) : (
            <span>Low confidence — please verify spine read and metadata before approving.</span>
          )}
        </div>
      )}

      {/* Tags */}
      <div className="mt-4 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5 relative">
          {book.genreTags.map((t) => (
            <TagChip
              key={`g-${t}`}
              tag={t}
              variant="genre"
              onRemove={() => removeTag('genre', t)}
            />
          ))}
          <button
            onClick={() => setPicker(picker === 'genre' ? null : 'genre')}
            className="text-[11px] px-2 py-1 rounded-full border border-dashed border-ink/30 dark:border-cream-300/30 text-ink/60 dark:text-cream-300/60 hover:border-accent hover:text-accent transition"
          >
            + add genre
          </button>
          {picker === 'genre' && (
            <TagPicker
              variant="genre"
              existing={[...book.genreTags, ...book.formTags]}
              onAdd={(t) => addTag('genre', t)}
              onClose={() => setPicker(null)}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 relative">
          {book.formTags.map((t) => (
            <TagChip
              key={`f-${t}`}
              tag={t}
              variant="form"
              onRemove={() => removeTag('form', t)}
            />
          ))}
          <button
            onClick={() => setPicker(picker === 'form' ? null : 'form')}
            className="text-[11px] px-2 py-1 rounded-full border border-dashed border-ink/30 dark:border-cream-300/30 text-ink/60 dark:text-cream-300/60 hover:border-accent hover:text-accent transition"
          >
            + add form
          </button>
          {picker === 'form' && (
            <TagPicker
              variant="form"
              existing={[...book.genreTags, ...book.formTags]}
              onAdd={(t) => addTag('form', t)}
              onClose={() => setPicker(null)}
            />
          )}
        </div>
      </div>

      {/* Reasoning */}
      {book.reasoning && (
        <div className="mt-3">
          <button
            onClick={() => setShowReasoning((s) => !s)}
            className="text-[11px] text-ink/50 dark:text-cream-300/50 hover:text-accent transition"
          >
            {showReasoning ? '▾' : '▸'} Reasoning
          </button>
          {showReasoning && (
            <p className="mt-1 text-xs text-ink/70 dark:text-cream-300/70 italic leading-relaxed">
              {book.reasoning}
            </p>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-4 flex justify-between items-center">
        <div className="text-[10px] text-ink/40 dark:text-cream-300/40">
          From <span className="font-mono">{book.sourcePhoto}</span> · spine #{book.spineRead.position}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setStatus('rejected')}
            className={`text-xs px-3 py-1.5 rounded-md border transition ${
              book.status === 'rejected'
                ? 'bg-red-100 dark:bg-red-900/40 border-red-300 dark:border-red-800 text-red-800 dark:text-red-200'
                : 'border-cream-300 dark:border-ink-soft hover:border-red-400 hover:text-red-700 dark:hover:text-red-400'
            }`}
          >
            {book.status === 'rejected' ? '✓ Rejected' : 'Reject'}
          </button>
          <button
            onClick={() => setStatus('approved')}
            className={`text-xs px-3 py-1.5 rounded-md border transition ${
              book.status === 'approved'
                ? 'bg-green-100 dark:bg-green-900/40 border-green-400 dark:border-green-700 text-green-800 dark:text-green-200'
                : 'border-cream-300 dark:border-ink-soft hover:border-green-500 hover:text-green-700 dark:hover:text-green-400'
            }`}
          >
            {book.status === 'approved' ? '✓ Approved' : 'Approve'}
          </button>
        </div>
      </div>
    </article>
  );
}

function EditableField({
  value,
  onSave,
  placeholder,
  fontFamily,
}: {
  value: string;
  onSave: (v: string) => void;
  placeholder: string;
  fontFamily: 'sans' | 'mono';
}) {
  const [editing, setEditing] = useState(false);
  const fontClass = fontFamily === 'mono' ? 'font-mono' : 'font-sans';
  if (editing) {
    return (
      <input
        autoFocus
        defaultValue={value}
        onBlur={(e) => {
          onSave(e.target.value);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setEditing(false);
        }}
        className={`${fontClass} bg-transparent border-b border-accent focus:outline-none px-0.5 min-w-0`}
        size={Math.max(value.length, placeholder.length, 6)}
      />
    );
  }
  return (
    <span
      className={`${fontClass} cursor-text hover:text-accent transition ${
        !value ? 'italic opacity-60' : ''
      }`}
      onClick={() => setEditing(true)}
      title="Click to edit"
    >
      {value || placeholder}
    </span>
  );
}
