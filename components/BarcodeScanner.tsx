'use client';

/**
 * Barcode scanner — confirm-on-every-scan flow.
 *
 * State machine:
 *   scanning      camera live, detection loop running
 *   confirm       barcode detected; video paused, ISBN shown,
 *                 user taps "Use this ISBN" or "Rescan"
 *   dup-confirm   the ISBN the user is about to confirm is already
 *                 in the active batch; user must explicitly opt in
 *                 to "Add another copy" (default = No)
 *   between       previous scan committed; "Scan another?" Yes / Done
 *   error         camera permission denied or no detector available
 *
 * The scanner NEVER fires onScan(isbn) without an explicit user tap.
 * Cameras pick up barcodes instantly and repeatedly — auto-confirm
 * would create dozens of duplicate records on every shutter.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface BarcodeScannerProps {
  /** Fired only when the user taps "Use this ISBN" (and confirms a
   *  duplicate-in-batch warning if the ISBN is already in the batch). */
  onScan: (isbn: string) => void;
  /** Synchronous predicate: does this ISBN already exist in the active
   *  batch? Used to gate the Use-this-ISBN tap behind a duplicate
   *  confirmation step. */
  isIsbnInBatch: (isbn: string) => boolean;
  /** User tapped Done. Parent unmounts the modal. */
  onClose: () => void;
}

interface DetectorLike {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string; format: string }>>;
}

declare global {
  interface Window {
    BarcodeDetector?: {
      new (init?: { formats?: string[] }): DetectorLike;
      getSupportedFormats?: () => Promise<string[]>;
    };
  }
}

type Stage =
  | { kind: 'scanning' }
  | { kind: 'confirm'; isbn: string }
  | { kind: 'dup-confirm'; isbn: string }
  | { kind: 'between' }
  | { kind: 'error'; message: string };

export function BarcodeScanner({ onScan, isIsbnInBatch, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<DetectorLike | null>(null);
  const rafRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const detectingRef = useRef(false);

  const [stage, setStage] = useState<Stage>({ kind: 'scanning' });
  const [scanCount, setScanCount] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isExiting, setIsExiting] = useState(false);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    detectingRef.current = false;
  }, []);

  const close = useCallback(() => {
    setIsExiting(true);
    window.setTimeout(() => {
      stopStream();
      onClose();
    }, 200);
  }, [onClose, stopStream]);

  // Initialize the detector. Native first; ZXing dynamic-import
  // fallback when the platform doesn't expose BarcodeDetector.
  useEffect(() => {
    let cancelled = false;
    async function setupDetector() {
      try {
        if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
          detectorRef.current = new window.BarcodeDetector!({
            formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'],
          });
          return;
        }
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatReader();
        detectorRef.current = {
          async detect(video: HTMLVideoElement) {
            try {
              const result = await reader.decodeOnceFromVideoElement(video);
              return [{ rawValue: result.getText(), format: 'ean_13' }];
            } catch {
              return [];
            }
          },
        };
      } catch {
        if (!cancelled) {
          setCameraError(
            'No barcode-detection support on this browser. Try Chrome on Android, Edge, or Safari 16+.'
          );
        }
      }
    }
    void setupDetector();
    return () => {
      cancelled = true;
    };
  }, []);

  // Open the rear camera at high resolution.
  useEffect(() => {
    let cancelled = false;
    async function openCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => {});
        }
      } catch (err: unknown) {
        const e = err as { name?: string; message?: string };
        const msg =
          e?.name === 'NotAllowedError'
            ? 'Camera permission denied. Enable it in your browser settings to scan barcodes.'
            : e?.name === 'NotFoundError'
              ? 'No camera was found on this device.'
              : e?.message ?? 'Could not access the camera.';
        if (!cancelled) setCameraError(msg);
      }
    }
    void openCamera();
    return () => {
      cancelled = true;
    };
  }, []);

  // Detection loop. Active ONLY while stage.kind === 'scanning'. The
  // moment a valid ISBN is read, we stop the loop and pause the video
  // so the user sees a frozen frame with the detected ISBN overlaid.
  useEffect(() => {
    mountedRef.current = true;
    if (stage.kind !== 'scanning') return;

    let cancelled = false;
    function tick() {
      if (cancelled || !mountedRef.current) return;
      const detector = detectorRef.current;
      const video = videoRef.current;
      if (!detector || !video || video.readyState < 2 || video.paused) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      if (detectingRef.current) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      detectingRef.current = true;
      detector
        .detect(video)
        .then((results) => {
          detectingRef.current = false;
          if (cancelled || !mountedRef.current) return;
          const isbnHit = results.find(
            (r) =>
              r.format === 'ean_13' &&
              /^(?:978|979)\d{10}$/.test(r.rawValue.replace(/[^\d]/g, ''))
          );
          if (isbnHit) {
            const isbn = isbnHit.rawValue.replace(/[^\d]/g, '');
            // Stop scanning + freeze frame.
            const v = videoRef.current;
            if (v) v.pause();
            setStage({ kind: 'confirm', isbn });
            return;
          }
          rafRef.current = requestAnimationFrame(tick);
        })
        .catch(() => {
          detectingRef.current = false;
          if (!cancelled && mountedRef.current) {
            rafRef.current = requestAnimationFrame(tick);
          }
        });
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [stage.kind]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      stopStream();
    };
  }, [stopStream]);

  // Allow Escape to close.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  // Restart the live preview after a Rescan or Yes-scan-another tap.
  function resumeScanning() {
    const v = videoRef.current;
    if (v) {
      v.play().catch(() => {});
    }
    setStage({ kind: 'scanning' });
  }

  function onUseIsbn(isbn: string) {
    if (isIsbnInBatch(isbn)) {
      setStage({ kind: 'dup-confirm', isbn });
      return;
    }
    commit(isbn);
  }

  function commit(isbn: string) {
    onScan(isbn);
    setScanCount((n) => n + 1);
    setStage({ kind: 'between' });
  }

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Scan a book barcode"
    >
      <div
        className={`absolute inset-0 bg-black/55 backdrop-blur-sm ${
          isExiting ? 'animate-backdrop-out' : 'animate-backdrop-in'
        }`}
      />

      <div
        className={`relative w-[min(94vw,900px)] h-[min(78vh,720px)] rounded-2xl overflow-hidden shadow-2xl bg-black flex flex-col ${
          isExiting ? 'animate-modal-out' : 'animate-modal-in'
        }`}
      >
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Targeting rectangle — only while actively scanning. Hidden
            once we've frozen the frame so it doesn't fight the
            confirm-overlay copy. */}
        {!cameraError && stage.kind === 'scanning' && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div
              className="relative"
              style={{ width: '70%', height: 130 }}
            >
              <div className="absolute inset-0 border-2 border-brass/80 rounded-md" />
              <div
                className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px"
                style={{ background: 'rgba(196,163,90,0.7)' }}
              />
            </div>
          </div>
        )}

        {/* Top bar: counter on the left, Done pill on the right. */}
        <div className="absolute top-0 inset-x-0 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/55 to-transparent pointer-events-none">
          <span className="text-[12px] uppercase tracking-wider text-cream-200 font-medium">
            {scanCount === 0
              ? stage.kind === 'scanning'
                ? 'Aim at the barcode'
                : 'Scan barcode'
              : `${scanCount} scanned this session`}
          </span>
        </div>
        {stage.kind !== 'confirm' && stage.kind !== 'dup-confirm' && (
          <button
            type="button"
            onClick={close}
            className="absolute top-3 right-3 z-10 px-5 py-2 rounded-full bg-white text-ink text-base font-semibold shadow-lg ring-1 ring-black/10 active:scale-95 transition"
          >
            Done
          </button>
        )}

        {/* Confirm overlay — shown when a barcode has been detected.
            Frozen camera frame underneath; centered card on top with
            the ISBN, Use this ISBN, and Rescan. */}
        {stage.kind === 'confirm' && (
          <div className="absolute inset-0 flex items-center justify-center p-6 bg-black/55">
            <div className="w-full max-w-sm bg-cream-50 dark:bg-ink text-ink dark:text-cream-50 rounded-xl p-5 shadow-2xl space-y-3">
              <div className="text-[11px] uppercase tracking-wider text-text-tertiary">
                Detected ISBN
              </div>
              <div className="text-[22px] font-mono font-semibold tracking-tight">
                {stage.isbn}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onUseIsbn(stage.isbn)}
                  className="flex-1 py-2.5 rounded-md bg-navy text-white text-[14px] font-semibold active:scale-[0.99] transition"
                >
                  Use this ISBN
                </button>
                <button
                  type="button"
                  onClick={resumeScanning}
                  className="flex-1 py-2.5 rounded-md border border-line text-text-secondary text-[14px] font-medium transition"
                >
                  Rescan
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Duplicate-in-batch confirm. Same frozen frame; different
            copy. Default action is "No, don't add" — the user has to
            explicitly opt in to a duplicate copy. */}
        {stage.kind === 'dup-confirm' && (
          <div className="absolute inset-0 flex items-center justify-center p-6 bg-black/55">
            <div className="w-full max-w-sm bg-cream-50 dark:bg-ink text-ink dark:text-cream-50 rounded-xl p-5 shadow-2xl space-y-3">
              <div className="text-[14px] font-semibold">
                ISBN already in this batch
              </div>
              <div className="text-[13px] text-text-secondary leading-relaxed">
                <span className="font-mono">{stage.isbn}</span> is already
                attached to a book you&rsquo;ve scanned in this session. Add
                another copy?
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={resumeScanning}
                  className="flex-1 py-2.5 rounded-md bg-navy text-white text-[14px] font-semibold active:scale-[0.99] transition"
                  autoFocus
                >
                  No, keep scanning
                </button>
                <button
                  type="button"
                  onClick={() => commit(stage.isbn)}
                  className="flex-1 py-2.5 rounded-md border border-line text-text-secondary text-[14px] font-medium transition"
                >
                  Yes, add copy
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Between-scans prompt — fired after a successful Use this
            ISBN. Camera stays paused; the user explicitly says Yes
            to scan another or Done to close the modal. */}
        {stage.kind === 'between' && (
          <div className="absolute inset-0 flex items-center justify-center p-6 bg-black/55">
            <div className="w-full max-w-sm bg-cream-50 dark:bg-ink text-ink dark:text-cream-50 rounded-xl p-5 shadow-2xl space-y-3">
              <div className="text-[14px] font-semibold">Scan another?</div>
              <div className="text-[13px] text-text-secondary">
                The lookup for that ISBN is running in the background. Books
                appear on the Review tab as soon as their metadata resolves.
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={resumeScanning}
                  className="flex-1 py-2.5 rounded-md bg-navy text-white text-[14px] font-semibold active:scale-[0.99] transition"
                  autoFocus
                >
                  Yes, scan another
                </button>
                <button
                  type="button"
                  onClick={close}
                  className="flex-1 py-2.5 rounded-md border border-line text-text-secondary text-[14px] font-medium transition"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {cameraError && (
          <div className="absolute inset-0 flex items-center justify-center p-6 bg-black/60">
            <div className="max-w-sm text-center bg-cream-50 dark:bg-ink text-ink dark:text-cream-50 rounded-lg p-5 shadow-xl">
              <p className="text-sm mb-4">{cameraError}</p>
              <button
                type="button"
                onClick={close}
                className="text-sm text-brass hover:underline underline-offset-4"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
