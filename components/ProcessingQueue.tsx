'use client';

import type { PhotoBatch } from '@/lib/types';

interface Props {
  batches: PhotoBatch[];
  onRemove: (id: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const STATUS_LABEL: Record<PhotoBatch['status'], string> = {
  queued: 'Queued',
  processing: 'Processing…',
  done: 'Done',
  error: 'Error',
};

const STATUS_DOT: Record<PhotoBatch['status'], string> = {
  queued: 'bg-ink/30 dark:bg-cream-300/30',
  processing: 'bg-amber-500 animate-pulse',
  done: 'bg-green-500',
  error: 'bg-red-500',
};

export function ProcessingQueue({ batches, onRemove }: Props) {
  if (batches.length === 0) return null;

  return (
    <div className="mt-8">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-ink/50 dark:text-cream-300/50 mb-3">
        Queue ({batches.length})
      </h3>
      <ul className="space-y-2">
        {batches.map((b) => (
          <li
            key={b.id}
            className="flex items-center gap-3 bg-cream-50 dark:bg-ink-soft/60 border border-cream-300 dark:border-ink-soft rounded-lg p-3 transition"
          >
            {b.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={b.thumbnail}
                alt={b.filename}
                className="w-14 h-14 object-cover rounded border border-cream-300 dark:border-ink-soft"
              />
            ) : (
              <div className="w-14 h-14 rounded border border-cream-300 dark:border-ink-soft bg-cream-200 dark:bg-ink-soft" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{b.filename}</div>
              <div className="text-xs text-ink/50 dark:text-cream-300/50 flex items-center gap-2 mt-0.5">
                <span>{formatBytes(b.fileSize)}</span>
                <span>·</span>
                <span className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[b.status]}`} />
                  {STATUS_LABEL[b.status]}
                </span>
                {b.status === 'done' && (
                  <>
                    <span>·</span>
                    <span>
                      {b.spinesDetected} spine{b.spinesDetected !== 1 ? 's' : ''} ·{' '}
                      {b.booksIdentified} identified
                    </span>
                  </>
                )}
                {b.status === 'error' && b.error && (
                  <>
                    <span>·</span>
                    <span className="text-red-500 truncate">{b.error}</span>
                  </>
                )}
              </div>
            </div>
            {(b.status === 'queued' || b.status === 'error' || b.status === 'done') && (
              <button
                onClick={() => onRemove(b.id)}
                className="text-xs text-ink/40 dark:text-cream-300/40 hover:text-red-600 transition px-2"
                aria-label="Remove"
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
