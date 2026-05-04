'use client';

import { useEffect, useRef, useState } from 'react';
import type { BookRecord, PhotoBatch, SpineBbox } from '@/lib/types';
import {
  addManualBook,
  buildBookFromCrop,
  cropSpine,
  loadImage,
  type LoadedImage,
} from '@/lib/pipeline';
import {
  ManualBookEntryModal,
  type ManualBookEntrySubmit,
} from './ManualBookEntryModal';

interface SpineSelectorProps {
  batch: PhotoBatch;
  /** Source File for the photo. Null when the user hard-reloaded — Path A unavailable. */
  sourceFile: File | null;
  onAdd: (book: BookRecord) => void;
  onClose: () => void;
}

interface CanvasBox {
  x: number; // canvas coords
  y: number;
  width: number;
  height: number;
}

const MAX_CANVAS_W = 900;
const MAX_CANVAS_H = 600;

export function SpineSelector({ batch, sourceFile, onAdd, onClose }: SpineSelectorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState<LoadedImage | null>(null);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number } | null>(null);
  const [drag, setDrag] = useState<{ start: { x: number; y: number }; current: { x: number; y: number } } | null>(null);
  const [box, setBox] = useState<CanvasBox | null>(null);
  const [busy, setBusy] = useState<'pathA' | 'pathB' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Path B opens the shared ManualBookEntryModal — no inline state
  // needed. The submit handler is async-fire-and-forget like the
  // upload-page flow; we close both the inner modal AND the
  // SpineSelector after kickoff.
  const [manualOpen, setManualOpen] = useState(false);

  // Load the source image once.
  useEffect(() => {
    if (!sourceFile) return;
    let cancelled = false;
    loadImage(sourceFile).then((res) => {
      if (cancelled) return;
      const ratio = Math.min(MAX_CANVAS_W / res.width, MAX_CANVAS_H / res.height, 1);
      const w = Math.round(res.width * ratio);
      const h = Math.round(res.height * ratio);
      setLoaded(res);
      setCanvasSize({ w, h });
    });
    return () => {
      cancelled = true;
    };
  }, [sourceFile]);

  // Draw the image + the current selection rectangle.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !loaded || !canvasSize) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = canvasSize.w;
    canvas.height = canvasSize.h;
    ctx.drawImage(loaded.img, 0, 0, canvasSize.w, canvasSize.h);

    const live = drag
      ? rectFromDrag(drag.start, drag.current)
      : box;
    if (live) {
      // Dim everything outside the selection.
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, canvasSize.w, canvasSize.h);
      ctx.clearRect(live.x, live.y, live.width, live.height);
      ctx.drawImage(
        loaded.img,
        (live.x / canvasSize.w) * loaded.width,
        (live.y / canvasSize.h) * loaded.height,
        (live.width / canvasSize.w) * loaded.width,
        (live.height / canvasSize.h) * loaded.height,
        live.x,
        live.y,
        live.width,
        live.height
      );
      ctx.strokeStyle = '#1B3A5C';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(live.x + 1, live.y + 1, live.width - 2, live.height - 2);
      ctx.setLineDash([]);
    }
  }, [loaded, canvasSize, drag, box]);

  // ESC to close.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function getCanvasCoords(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const p = getCanvasCoords(e);
    setDrag({ start: p, current: p });
    setBox(null);
  }
  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!drag) return;
    setDrag({ ...drag, current: getCanvasCoords(e) });
  }
  function onMouseUp() {
    if (!drag) return;
    const r = rectFromDrag(drag.start, drag.current);
    setDrag(null);
    if (r.width >= 8 && r.height >= 8) setBox(r);
  }

  async function submitPathA() {
    if (!loaded || !canvasSize || !box) return;
    setError(null);
    setBusy('pathA');
    try {
      // Convert canvas-coords box to image-percentage bbox.
      const bbox: SpineBbox = {
        x: (box.x / canvasSize.w) * 100,
        y: (box.y / canvasSize.h) * 100,
        width: (box.width / canvasSize.w) * 100,
        height: (box.height / canvasSize.h) * 100,
      };
      const ocrCrop = cropSpine(loaded, bbox, { paddingPct: 5, maxLongEdge: 1200 });
      const spineThumbnail = cropSpine(loaded, bbox, { paddingPct: 3, maxLongEdge: 220, quality: 0.8 });
      const { book, kept } = await buildBookFromCrop({
        position: 9999,
        bbox,
        spineThumbnail,
        ocrCrop,
        sourcePhoto: batch.filename,
        batchLabel: batch.batchLabel,
        batchNotes: batch.batchNotes,
        manuallyAdded: true,
      });
      if (!kept) {
        setError('The crop did not produce a usable read. Try a tighter selection or use manual entry below.');
        setBusy(null);
        return;
      }
      onAdd(book);
      setBusy(null);
      onClose();
    } catch (err: any) {
      setError(err?.message ?? 'Read failed.');
      setBusy(null);
    }
  }

  function submitPathB(values: ManualBookEntrySubmit) {
    // Async fire-and-forget: close both modals immediately and dispatch
    // the resulting BookRecord onto Review when the lookup resolves.
    // Mirrors the upload-page handler so the user is never blocked
    // waiting on the metadata round-trip.
    setManualOpen(false);
    onClose();
    addManualBook({
      title: values.title,
      author: values.author,
      isbn: values.isbn || undefined,
      sourcePhoto: batch.filename,
      batchLabel: batch.batchLabel,
      batchNotes: batch.batchNotes,
    })
      .then((book) => onAdd(book))
      .catch(() => {
        // Lookup failed entirely — surface a minimal stub so the user
        // sees their entry on Review and can recover by hand.
        const stub: BookRecord = {
          id: crypto.randomUUID(),
          spineRead: {
            position: 9999,
            rawText: `${values.title}${values.author ? ' — ' + values.author : ''}`,
            title: values.title,
            author: values.author,
            confidence: 'LOW',
          },
          title: values.title,
          author: values.author,
          authorLF: '',
          isbn: values.isbn,
          publisher: '',
          publicationYear: 0,
          lcc: '',
          genreTags: [],
          formTags: [],
          confidence: 'LOW',
          reasoning: '',
          status: 'pending',
          warnings: ['Basic details added. Edit fields and tap Reread for richer metadata.'],
          sourcePhoto: batch.filename,
          batchLabel: batch.batchLabel,
          batchNotes: batch.batchNotes,
          lookupSource: 'none',
          lccSource: 'none',
          manuallyAdded: true,
          original: {
            title: values.title,
            author: values.author,
            isbn: values.isbn,
            publisher: '',
            publicationYear: 0,
            lcc: '',
          },
        };
        onAdd(stub);
      });
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/70 backdrop-blur flex items-center justify-center p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={wrapperRef}
        className="bg-cream-50 dark:bg-ink-soft rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-cream-300 dark:border-ink-soft sticky top-0 bg-cream-50 dark:bg-ink-soft z-10">
          <div>
            <h2 className="font-serif text-2xl">Add a missing book</h2>
            <div className="text-xs text-ink/50 dark:text-cream-300/50 mt-0.5">
              Batch: <span className="font-mono">{batch.batchLabel ?? 'Uncategorized'}</span> ·{' '}
              <span className="font-mono">{batch.filename}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-ink/50 dark:text-cream-300/50 hover:text-accent transition text-xl px-2"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Path A — only when source File is in memory */}
          {sourceFile ? (
            <section>
              <h3 className="text-xs uppercase tracking-wider font-semibold text-ink/60 dark:text-cream-300/60 mb-2">
                Path A · Draw on the photo
              </h3>
              <p className="text-sm text-ink/65 dark:text-cream-300/65 mb-3 leading-relaxed">
                Click and drag a box around the missed spine. The app will read it
                with the OCR model and run the same lookup chain it uses for
                auto-detected books.
              </p>
              {canvasSize ? (
                <div className="inline-block border border-cream-300 dark:border-ink-soft rounded-lg overflow-hidden shadow-sm">
                  <canvas
                    ref={canvasRef}
                    width={canvasSize.w}
                    height={canvasSize.h}
                    onMouseDown={onMouseDown}
                    onMouseMove={onMouseMove}
                    onMouseUp={onMouseUp}
                    onMouseLeave={onMouseUp}
                    style={{ cursor: 'crosshair', display: 'block' }}
                  />
                </div>
              ) : (
                <div className="text-sm text-ink/50 dark:text-cream-300/50 italic">
                  Loading photo…
                </div>
              )}
              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={submitPathA}
                  disabled={!box || busy !== null}
                  className="px-4 py-2 text-sm rounded-md bg-accent text-cream-50 hover:bg-accent-deep disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  {busy === 'pathA' ? 'Reading spine…' : 'Read this spine'}
                </button>
                {box && (
                  <button
                    onClick={() => setBox(null)}
                    disabled={busy !== null}
                    className="px-3 py-2 text-xs rounded-md border border-cream-300 dark:border-ink-soft hover:border-accent hover:text-accent disabled:opacity-40 transition"
                  >
                    Clear selection
                  </button>
                )}
              </div>
            </section>
          ) : (
            <section className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 rounded-lg p-4 text-sm text-amber-900 dark:text-amber-200">
              The high-resolution photo is no longer in memory (probably due to a
              page reload), so &ldquo;draw on photo&rdquo; isn&apos;t available
              for this batch. Use manual entry below, or re-upload the photo to
              start fresh.
            </section>
          )}

          <div className="text-[11px] text-center text-ink/40 dark:text-cream-300/40 uppercase tracking-wider">
            or
          </div>

          {/* Path B — opens the shared ManualBookEntryModal. The
              modal handles ISBN/title/author capture, validation,
              guidance copy, and submission. Same component the upload
              page uses for "Manual entry". */}
          <section>
            <h3 className="text-xs uppercase tracking-wider font-semibold text-ink/60 dark:text-cream-300/60 mb-2">
              Path B · Enter manually
            </h3>
            <p className="text-sm text-ink/65 dark:text-cream-300/65 mb-3 leading-relaxed">
              Type the ISBN, title, or author. ISBN gives the cleanest match.
              Lookup + tag inference run as normal — only Pass B (the OCR
              step) is skipped.
            </p>
            <button
              onClick={() => setManualOpen(true)}
              disabled={busy !== null}
              className="px-4 py-2 text-sm rounded-md bg-accent text-cream-50 hover:bg-accent-deep disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Open manual entry…
            </button>
          </section>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 rounded-lg px-4 py-3 text-sm text-red-800 dark:text-red-200">
              {error}
            </div>
          )}
        </div>
      </div>

      {manualOpen && (
        <ManualBookEntryModal
          onSubmit={submitPathB}
          onClose={() => setManualOpen(false)}
        />
      )}
    </div>
  );
}

function rectFromDrag(start: { x: number; y: number }, current: { x: number; y: number }): CanvasBox {
  return {
    x: Math.min(start.x, current.x),
    y: Math.min(start.y, current.y),
    width: Math.abs(current.x - start.x),
    height: Math.abs(current.y - start.y),
  };
}
