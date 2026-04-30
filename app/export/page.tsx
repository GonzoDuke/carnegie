'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useStore } from '@/lib/store';
import { ExportPreview } from '@/components/ExportPreview';
import { exportFilename, generateCsv } from '@/lib/csv-export';

export default function ExportPage() {
  const { state } = useStore();

  const approved = useMemo(
    () => state.allBooks.filter((b) => b.status === 'approved'),
    [state.allBooks]
  );
  const pending = state.allBooks.filter((b) => b.status === 'pending').length;
  const rejected = state.allBooks.filter((b) => b.status === 'rejected').length;

  function downloadCsv() {
    if (approved.length === 0) return;
    const csv = generateCsv(approved);
    // Add UTF-8 BOM so LT correctly interprets accented characters
    const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFilename(approved.length);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (state.allBooks.length === 0) {
    return (
      <div className="text-center py-16">
        <h1 className="font-serif text-3xl mb-3">Nothing to export yet</h1>
        <p className="text-sm text-ink/60 dark:text-cream-300/60 mb-6">
          Upload photos and review books before exporting.
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-5xl mb-3 tracking-tight">Export to LibraryThing</h1>
        <p className="text-base text-ink/70 dark:text-cream-300/70 max-w-3xl leading-relaxed">
          Download a LibraryThing-compatible CSV. Only{' '}
          <span className="font-semibold">approved</span> books will be included.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-cream-50 dark:bg-ink-soft/60 border border-green-300 dark:border-green-800 rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-wider text-ink/50 dark:text-cream-300/50 mb-1">
            Approved · will export
          </div>
          <div className="text-3xl font-serif text-green-700 dark:text-green-400">
            {approved.length}
          </div>
        </div>
        <div className="bg-cream-50 dark:bg-ink-soft/60 border border-cream-300 dark:border-ink-soft rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-wider text-ink/50 dark:text-cream-300/50 mb-1">
            Pending · excluded
          </div>
          <div className="text-3xl font-serif text-amber-700 dark:text-amber-400">{pending}</div>
        </div>
        <div className="bg-cream-50 dark:bg-ink-soft/60 border border-cream-300 dark:border-ink-soft rounded-lg p-4">
          <div className="text-[10px] uppercase tracking-wider text-ink/50 dark:text-cream-300/50 mb-1">
            Rejected · excluded
          </div>
          <div className="text-3xl font-serif text-red-700 dark:text-red-400">{rejected}</div>
        </div>
      </div>

      {/* Pending warning */}
      {pending > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 rounded-lg px-4 py-3 text-sm text-amber-900 dark:text-amber-200 flex items-start gap-2">
          <span>⚠</span>
          <span>
            <strong>{pending}</strong> book{pending !== 1 ? 's' : ''} still pending review — only
            approved books will be exported.{' '}
            <Link href="/review" className="underline hover:text-amber-700">
              Go review →
            </Link>
          </span>
        </div>
      )}

      {/* CSV preview */}
      <div>
        <h2 className="text-sm uppercase tracking-wider font-semibold text-ink/50 dark:text-cream-300/50 mb-2">
          CSV preview
        </h2>
        <ExportPreview books={approved} />
      </div>

      {/* Download */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 pt-4 border-t border-cream-300 dark:border-ink-soft">
        <div className="text-xs text-ink/60 dark:text-cream-300/60 max-w-md leading-relaxed">
          To import: log into LibraryThing, go to{' '}
          <span className="font-mono">More → Import books</span>, choose{' '}
          <span className="font-mono">CSV/text file</span>, and upload the file you download here.
        </div>
        <button
          onClick={downloadCsv}
          disabled={approved.length === 0}
          className="px-5 py-2.5 rounded-md bg-accent text-cream-50 hover:bg-accent-deep disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm"
        >
          Download CSV ({approved.length})
        </button>
      </div>
    </div>
  );
}
