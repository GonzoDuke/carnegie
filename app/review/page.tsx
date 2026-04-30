'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { BookCard } from '@/components/BookCard';
import { useStore } from '@/lib/store';

type Filter = 'all' | 'pending' | 'approved' | 'rejected' | 'low';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'low', label: 'Low confidence' },
];

export default function ReviewPage() {
  const { state, updateBook } = useStore();
  const [filter, setFilter] = useState<Filter>('all');

  const counts = useMemo(() => {
    const c = { total: 0, pending: 0, approved: 0, rejected: 0, low: 0 };
    for (const b of state.allBooks) {
      c.total += 1;
      c[b.status] += 1;
      if (b.confidence === 'LOW') c.low += 1;
    }
    return c;
  }, [state.allBooks]);

  const visibleBooks = useMemo(() => {
    return state.allBooks.filter((b) => {
      if (filter === 'all') return true;
      if (filter === 'low') return b.confidence === 'LOW';
      return b.status === filter;
    });
  }, [state.allBooks, filter]);

  function approveAllHigh() {
    state.allBooks
      .filter((b) => b.confidence === 'HIGH' && b.status === 'pending')
      .forEach((b) => updateBook(b.id, { status: 'approved' }));
  }

  function approveRemaining() {
    state.allBooks
      .filter((b) => b.status === 'pending')
      .forEach((b) => updateBook(b.id, { status: 'approved' }));
  }

  if (state.allBooks.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-5xl mb-3 tracking-tight">Review &amp; approve</h1>
        <p className="text-base text-ink/70 dark:text-cream-300/70 max-w-3xl leading-relaxed">
          Verify each book&apos;s metadata and tags. Edit fields by clicking them. Only
          approved books make it into the export.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Stat label="Total" value={counts.total} />
        <Stat label="Pending" value={counts.pending} tone="amber" />
        <Stat label="Approved" value={counts.approved} tone="green" />
        <Stat label="Rejected" value={counts.rejected} tone="red" />
        <Stat label="Low confidence" value={counts.low} tone="amber" />
      </div>

      {/* Filter row + bulk actions */}
      <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-cream-300 dark:border-ink-soft">
        <div className="flex gap-1 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`text-xs px-3 py-1.5 rounded-md transition ${
                filter === f.id
                  ? 'bg-accent text-cream-50'
                  : 'bg-cream-100 dark:bg-ink-soft text-ink/70 dark:text-cream-300/70 hover:bg-accent-soft dark:hover:bg-accent/20'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button
          onClick={approveAllHigh}
          className="text-xs px-3 py-1.5 rounded-md border border-green-400/70 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 transition"
        >
          Approve all HIGH confidence
        </button>
      </div>

      {/* Book list */}
      <div className="space-y-3">
        {visibleBooks.length === 0 ? (
          <div className="text-sm text-ink/50 dark:text-cream-300/50 italic p-8 text-center border border-dashed border-cream-300 dark:border-ink-soft rounded-lg">
            No books in this filter.
          </div>
        ) : (
          visibleBooks.map((book) => <BookCard key={book.id} book={book} />)
        )}
      </div>

      {/* Bottom bulk action + nav */}
      {counts.pending > 0 && (
        <div className="sticky bottom-4 flex justify-center">
          <button
            onClick={approveRemaining}
            className="text-sm px-5 py-2.5 rounded-full bg-accent text-cream-50 shadow-md hover:bg-accent-deep transition"
          >
            Approve remaining ({counts.pending})
          </button>
        </div>
      )}

      <div className="flex justify-end pt-4 border-t border-cream-300 dark:border-ink-soft">
        <Link
          href="/export"
          className="text-sm px-5 py-2.5 rounded-md bg-accent text-cream-50 hover:bg-accent-deep transition shadow-sm"
        >
          Continue to export →
        </Link>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'amber' | 'green' | 'red';
}) {
  const toneClass =
    tone === 'amber'
      ? 'text-amber-700 dark:text-amber-400'
      : tone === 'green'
      ? 'text-green-700 dark:text-green-400'
      : tone === 'red'
      ? 'text-red-700 dark:text-red-400'
      : 'text-ink dark:text-cream-100';
  return (
    <div className="bg-cream-50 dark:bg-ink-soft/60 border border-cream-300 dark:border-ink-soft rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider text-ink/50 dark:text-cream-300/50 mb-1">
        {label}
      </div>
      <div className={`text-2xl font-serif ${toneClass}`}>{value}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16">
      <h1 className="font-serif text-3xl mb-3">Nothing to review yet</h1>
      <p className="text-sm text-ink/60 dark:text-cream-300/60 mb-6">
        Upload some shelf photos first.
      </p>
      <Link
        href="/"
        className="inline-block px-5 py-2.5 rounded-md bg-accent text-cream-50 hover:bg-accent-deep transition"
      >
        Go to upload
      </Link>
    </div>
  );
}
