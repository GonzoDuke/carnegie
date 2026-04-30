'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { PhotoUploader } from '@/components/PhotoUploader';
import { ProcessingQueue } from '@/components/ProcessingQueue';
import { BatchProgress } from '@/components/BatchProgress';
import { useStore } from '@/lib/store';
import type { PhotoBatch } from '@/lib/types';
import {
  buildBookFromSpine,
  createThumbnail,
  makeId,
  processPhoto,
} from '@/lib/pipeline';

export default function UploadPage() {
  const router = useRouter();
  const { state, addBatch, updateBatch, removeBatch, addBook } = useStore();
  const [pendingFiles, setPendingFiles] = useState<Map<string, File>>(new Map());
  const [isProcessing, setProcessing] = useState(false);
  const [progressStep, setProgressStep] = useState<{
    photoDone: number;
    photoTotal: number;
    bookDone: number;
    bookTotal: number;
    currentLabel: string;
  } | null>(null);

  const queuedBatches = useMemo(
    () => state.batches.filter((b) => b.status === 'queued'),
    [state.batches]
  );

  async function handleFiles(files: File[]) {
    for (const file of files) {
      const id = makeId();
      const thumbnail = await createThumbnail(file);
      const batch: PhotoBatch = {
        id,
        filename: file.name,
        fileSize: file.size,
        thumbnail,
        status: 'queued',
        spinesDetected: 0,
        booksIdentified: 0,
        books: [],
      };
      addBatch(batch);
      setPendingFiles((prev) => {
        const next = new Map(prev);
        next.set(id, file);
        return next;
      });
    }
  }

  async function processAll() {
    if (queuedBatches.length === 0 || isProcessing) return;
    setProcessing(true);
    const total = queuedBatches.length;
    let photoDone = 0;
    let aggregateBookTotal = 0;
    let aggregateBookDone = 0;
    setProgressStep({
      photoDone: 0,
      photoTotal: total,
      bookDone: 0,
      bookTotal: 0,
      currentLabel: 'Starting…',
    });

    for (const batch of queuedBatches) {
      const file = pendingFiles.get(batch.id);
      if (!file) {
        updateBatch(batch.id, { status: 'error', error: 'File not in memory' });
        photoDone += 1;
        continue;
      }

      updateBatch(batch.id, { status: 'processing' });
      setProgressStep({
        photoDone,
        photoTotal: total,
        bookDone: aggregateBookDone,
        bookTotal: aggregateBookTotal,
        currentLabel: `Reading spines from ${batch.filename}…`,
      });

      try {
        const spines = await processPhoto(file);
        updateBatch(batch.id, { spinesDetected: spines.length });
        aggregateBookTotal += spines.length;
        setProgressStep({
          photoDone,
          photoTotal: total,
          bookDone: aggregateBookDone,
          bookTotal: aggregateBookTotal,
          currentLabel: `Looking up ${spines.length} books from ${batch.filename}…`,
        });

        for (const spine of spines) {
          const book = await buildBookFromSpine(spine, batch.filename);
          addBook(batch.id, book);
          aggregateBookDone += 1;
          setProgressStep({
            photoDone,
            photoTotal: total,
            bookDone: aggregateBookDone,
            bookTotal: aggregateBookTotal,
            currentLabel: book.title
              ? `Identified: ${book.title}`
              : `Spine #${spine.position} — unreadable`,
          });
        }

        updateBatch(batch.id, { status: 'done' });
      } catch (err: any) {
        updateBatch(batch.id, {
          status: 'error',
          error: err?.message ?? 'Unknown error',
        });
      }
      photoDone += 1;
    }

    setPendingFiles(new Map());
    setProcessing(false);
    setProgressStep(null);
    router.push('/review');
  }

  function handleRemove(id: string) {
    removeBatch(id);
    setPendingFiles((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }

  const canProcess = queuedBatches.length > 0 && !isProcessing;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl mb-2">Upload bookshelf photos</h1>
        <p className="text-sm text-ink/60 dark:text-cream-300/60 max-w-2xl">
          Drop one or more photos of a bookshelf. We&apos;ll read each spine, look up its
          metadata, infer tags, and let you review every result before any export.
          Nothing leaves your machine for LibraryThing without your explicit approval.
        </p>
      </div>

      <PhotoUploader onFiles={handleFiles} disabled={isProcessing} />

      <ProcessingQueue batches={state.batches} onRemove={handleRemove} />

      {progressStep && (
        <div className="space-y-3">
          <BatchProgress
            total={progressStep.photoTotal}
            done={progressStep.photoDone}
            label="Photos processed"
          />
          {progressStep.bookTotal > 0 && (
            <BatchProgress
              total={progressStep.bookTotal}
              done={progressStep.bookDone}
              label="Books identified"
            />
          )}
          <div className="text-xs text-ink/60 dark:text-cream-300/60 italic">
            {progressStep.currentLabel}
          </div>
        </div>
      )}

      <div className="flex justify-between items-center pt-4 border-t border-cream-300 dark:border-ink-soft">
        <div className="text-xs text-ink/50 dark:text-cream-300/50">
          {state.batches.length} photo{state.batches.length !== 1 ? 's' : ''} ·{' '}
          {state.allBooks.length} book{state.allBooks.length !== 1 ? 's' : ''} identified
        </div>
        <button
          onClick={processAll}
          disabled={!canProcess}
          className="px-5 py-2.5 rounded-md bg-accent text-cream-50 hover:bg-accent-deep disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm"
        >
          {isProcessing
            ? 'Processing…'
            : queuedBatches.length === 0
            ? 'Process all'
            : `Process all (${queuedBatches.length})`}
        </button>
      </div>
    </div>
  );
}
