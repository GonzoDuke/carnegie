'use client';

/**
 * Barcode scanner modal — point the camera at a back-cover EAN-13
 * barcode, the app reads the ISBN, fires the lookup + tag-infer
 * chain in the background, and drops a BookRecord into the active
 * batch. Multi-scan loop: scan one, scan the next, tap Done when
 * you're finished.
 *
 * Detection: we feature-detect the native `BarcodeDetector` API
 * (Chromium, available on Android Chrome's PWA shell) and fall
 * back to `@zxing/browser` on Safari / Firefox. Both produce the
 * same `{rawValue, format}` shape; we filter for `ean_13` and a
 * 978/979 prefix so non-ISBN codes never reach the lookup chain.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface BarcodeScannerProps {
  /** Fired with the cleaned ISBN-13 each time a new barcode is read. */
  onScan: (isbn: string) => void;
  /** Fired when the user taps Done. The parent unmounts the modal. */
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

type Status =
  | { kind: 'idle' }
  | { kind: 'reading'; isbn: string }
  | { kind: 'matched'; title: string; author: string }
  | { kind: 'no-isbn' }
  | { kind: 'error'; message: string };

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<DetectorLike | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastReadRef = useRef<{ isbn: string; at: number } | null>(null);
  const lastNonIsbnAtRef = useRef<number>(0);
  const mountedRef = useRef(true);

  const [scanCount, setScanCount] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
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
        // Fallback: ZXing — dynamic import so non-iOS users don't pay
        // the bundle cost. The wrapper exposes a detect()-shaped API.
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
      } catch (err) {
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

  // Open the rear camera at the highest resolution the device offers
  // — barcodes need every pixel of detail.
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

  // Detection loop. Runs on rAF while the modal is mounted; reads at
  // ~30fps cap, debounces duplicate ISBN reads to once every 2s so a
  // single stable barcode in frame doesn't fire 60 times/sec.
  useEffect(() => {
    mountedRef.current = true;
    function tick() {
      if (!mountedRef.current) return;
      const detector = detectorRef.current;
      const video = videoRef.current;
      if (!detector || !video || video.readyState < 2 || video.paused) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      detector
        .detect(video)
        .then((results) => {
          if (!mountedRef.current) return;
          const isbnHit = results.find(
            (r) =>
              r.format === 'ean_13' &&
              /^(?:978|979)\d{10}$/.test(r.rawValue.replace(/[^\d]/g, ''))
          );
          if (isbnHit) {
            const isbn = isbnHit.rawValue.replace(/[^\d]/g, '');
            const now = Date.now();
            const last = lastReadRef.current;
            if (last && last.isbn === isbn && now - last.at < 2000) return;
            lastReadRef.current = { isbn, at: now };
            setScanCount((n) => n + 1);
            setStatus({ kind: 'reading', isbn });
            onScan(isbn);
            return;
          }
          // Any non-ISBN result triggers a brief "Not an ISBN" hint,
          // but only at most once every 1.5s so it doesn't strobe.
          if (results.length > 0) {
            const now = Date.now();
            if (now - lastNonIsbnAtRef.current > 1500) {
              lastNonIsbnAtRef.current = now;
              setStatus({ kind: 'no-isbn' });
              window.setTimeout(() => {
                if (mountedRef.current) {
                  setStatus((s) => (s.kind === 'no-isbn' ? { kind: 'idle' } : s));
                }
              }, 1200);
            }
          }
        })
        .catch(() => {
          // ignore single-frame errors
        });
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      mountedRef.current = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [onScan]);

  // Allow Escape to close, matching the camera modal.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  // Public API: parents can show "matched" feedback after a lookup
  // resolves. Exposed via window event so the parent doesn't need a
  // ref to this component. Fire with `window.dispatchEvent(new
  // CustomEvent('carnegie:scan-matched', { detail: { title, author } }))`.
  useEffect(() => {
    function onMatched(e: Event) {
      const ev = e as CustomEvent<{ title: string; author: string }>;
      setStatus({
        kind: 'matched',
        title: ev.detail?.title ?? '',
        author: ev.detail?.author ?? '',
      });
      window.setTimeout(() => {
        if (mountedRef.current) setStatus({ kind: 'idle' });
      }, 1800);
    }
    window.addEventListener('carnegie:scan-matched', onMatched);
    return () => window.removeEventListener('carnegie:scan-matched', onMatched);
  }, []);

  const statusText =
    status.kind === 'idle'
      ? 'Aim at the barcode'
      : status.kind === 'reading'
        ? `Found ${status.isbn} — looking up…`
        : status.kind === 'matched'
          ? status.title
            ? `✓ ${status.title}${status.author ? ` — ${status.author}` : ''}`
            : '✓ Found it'
          : status.kind === 'no-isbn'
            ? 'Not an ISBN — try again'
            : status.message;

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

        {/* Targeting rectangle. Brass border, dark mask outside it.
            Sized to a 70%-wide horizontal band — back-cover EAN-13
            barcodes are roughly that aspect on a typical book. */}
        {!cameraError && (
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

        {/* Top bar: scan count on the left, Done pill on the right. */}
        <div className="absolute top-0 inset-x-0 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/55 to-transparent pointer-events-none">
          <span className="text-[12px] uppercase tracking-wider text-cream-200 font-medium">
            {scanCount === 0
              ? 'Scan barcode'
              : `${scanCount} scanned this session`}
          </span>
        </div>
        <button
          type="button"
          onClick={close}
          className="absolute top-3 right-3 z-10 px-5 py-2 rounded-full bg-white text-ink text-base font-semibold shadow-lg ring-1 ring-black/10 active:scale-95 transition"
        >
          Done
        </button>

        {/* Status pill — bottom-center, dark glassy chip. */}
        <div className="absolute bottom-5 inset-x-0 flex justify-center px-4 pointer-events-none">
          <div
            className={`max-w-full truncate text-[13px] font-medium px-4 py-2 rounded-full backdrop-blur-md ${
              status.kind === 'matched'
                ? 'bg-emerald-700/85 text-white'
                : status.kind === 'no-isbn' || status.kind === 'error'
                  ? 'bg-mahogany/85 text-white'
                  : 'bg-black/55 text-cream-100'
            }`}
          >
            {statusText}
          </div>
        </div>

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
