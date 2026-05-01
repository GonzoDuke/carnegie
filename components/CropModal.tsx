'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface CropModalProps {
  file: File;
  /** 1-based position of this file in the queue, for the title bar copy. */
  queueIndex: number;
  queueTotal: number;
  /** User confirmed a crop; emits a brand-new File scoped to the rectangle. */
  onConfirm: (cropped: File) => void;
  /** User chose "Use full image" — pass the original file through unchanged. */
  onSkip: (original: File) => void;
  /** User dismissed the modal — drop the file from the queue entirely. */
  onCancel: () => void;
}

type Handle =
  | 'move'
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MIN_CROP_PX = 80; // image-coordinate floor — keep tiny crops sane

export function CropModal({
  file,
  queueIndex,
  queueTotal,
  onConfirm,
  onSkip,
  onCancel,
}: CropModalProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);
  const [stageRect, setStageRect] = useState<{ w: number; h: number } | null>(null);

  // Crop rectangle in IMAGE coordinates (not display). Initialized to the
  // entire image once we know its natural size — the user nudges in.
  const [crop, setCrop] = useState<Rect | null>(null);

  // Pointer-drag bookkeeping kept in a ref so it survives renders without
  // triggering them. We capture the crop snapshot at drag start and apply
  // deltas against it, which keeps tracking smooth even if React re-renders.
  const dragRef = useRef<{
    handle: Handle;
    startMouse: { x: number; y: number };
    startCrop: Rect;
  } | null>(null);

  const [isExiting, setIsExiting] = useState(false);

  // Decode the file once. URL is revoked when the component unmounts so
  // we don't leak object URLs for big shelf photos.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    return () => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
    };
  }, [file]);

  // After the <img> resolves, capture natural dims and seed the crop to a
  // ~90% inset. Starting fully-bounded would feel like nothing happened
  // when the modal opens; the inset signals "drag me" without forcing the
  // user to manually shrink first.
  const onImgLoad = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    setImgDims({ w, h });
    const insetX = Math.round(w * 0.05);
    const insetY = Math.round(h * 0.05);
    setCrop({ x: insetX, y: insetY, w: w - insetX * 2, h: h - insetY * 2 });
  }, []);

  // Watch the stage size so handles stay aligned even on viewport resize
  // (e.g. user rotates a tablet mid-crop).
  useEffect(() => {
    if (!stageRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setStageRect({ w: r.width, h: r.height });
    });
    ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, []);

  // Display ↔ image scale. The image is letterboxed inside the stage with
  // object-contain, so we need the same fit math to know where the visible
  // image actually sits.
  const fit = imgDims && stageRect
    ? (() => {
        const r = Math.min(stageRect.w / imgDims.w, stageRect.h / imgDims.h);
        const dispW = imgDims.w * r;
        const dispH = imgDims.h * r;
        const offsetX = (stageRect.w - dispW) / 2;
        const offsetY = (stageRect.h - dispH) / 2;
        return { scale: r, dispW, dispH, offsetX, offsetY };
      })()
    : null;

  // ---- Pointer handlers ----------------------------------------------------

  const onPointerDown = useCallback(
    (handle: Handle) => (e: React.PointerEvent<HTMLDivElement>) => {
      if (!crop) return;
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      dragRef.current = {
        handle,
        startMouse: { x: e.clientX, y: e.clientY },
        startCrop: { ...crop },
      };
    },
    [crop]
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || !fit || !imgDims) return;
      const dxDisp = e.clientX - drag.startMouse.x;
      const dyDisp = e.clientY - drag.startMouse.y;
      // Mouse moves in display pixels; convert to image pixels.
      const dx = dxDisp / fit.scale;
      const dy = dyDisp / fit.scale;
      const start = drag.startCrop;
      let nx = start.x;
      let ny = start.y;
      let nw = start.w;
      let nh = start.h;

      switch (drag.handle) {
        case 'move':
          nx = start.x + dx;
          ny = start.y + dy;
          break;
        case 'nw':
          nx = start.x + dx;
          ny = start.y + dy;
          nw = start.w - dx;
          nh = start.h - dy;
          break;
        case 'n':
          ny = start.y + dy;
          nh = start.h - dy;
          break;
        case 'ne':
          ny = start.y + dy;
          nw = start.w + dx;
          nh = start.h - dy;
          break;
        case 'e':
          nw = start.w + dx;
          break;
        case 'se':
          nw = start.w + dx;
          nh = start.h + dy;
          break;
        case 's':
          nh = start.h + dy;
          break;
        case 'sw':
          nx = start.x + dx;
          nw = start.w - dx;
          nh = start.h + dy;
          break;
        case 'w':
          nx = start.x + dx;
          nw = start.w - dx;
          break;
      }

      // Enforce min size by clamping the side that would shrink past the floor.
      if (nw < MIN_CROP_PX) {
        if (drag.handle === 'nw' || drag.handle === 'w' || drag.handle === 'sw') {
          nx = start.x + start.w - MIN_CROP_PX;
        }
        nw = MIN_CROP_PX;
      }
      if (nh < MIN_CROP_PX) {
        if (drag.handle === 'nw' || drag.handle === 'n' || drag.handle === 'ne') {
          ny = start.y + start.h - MIN_CROP_PX;
        }
        nh = MIN_CROP_PX;
      }

      // Keep within image bounds.
      if (nx < 0) {
        if (drag.handle === 'move') {
          nx = 0;
        } else {
          nw += nx;
          nx = 0;
        }
      }
      if (ny < 0) {
        if (drag.handle === 'move') {
          ny = 0;
        } else {
          nh += ny;
          ny = 0;
        }
      }
      if (nx + nw > imgDims.w) {
        if (drag.handle === 'move') {
          nx = imgDims.w - nw;
        } else {
          nw = imgDims.w - nx;
        }
      }
      if (ny + nh > imgDims.h) {
        if (drag.handle === 'move') {
          ny = imgDims.h - nh;
        } else {
          nh = imgDims.h - ny;
        }
      }

      setCrop({ x: Math.round(nx), y: Math.round(ny), w: Math.round(nw), h: Math.round(nh) });
    },
    [fit, imgDims]
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [onPointerMove, onPointerUp]);

  // Escape closes; Enter confirms the current crop. Standard modal contract.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeWithCancel();
      if (e.key === 'Enter' && crop && imgDims) confirmCrop();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crop, imgDims]);

  // ---- Confirm / skip / cancel --------------------------------------------

  const animateOutThen = useCallback((after: () => void) => {
    setIsExiting(true);
    window.setTimeout(after, 180);
  }, []);

  function closeWithCancel() {
    animateOutThen(onCancel);
  }

  function skipCrop() {
    animateOutThen(() => onSkip(file));
  }

  function confirmCrop() {
    if (!crop || !imgDims) return;
    const img = imgRef.current;
    if (!img) return;
    // If the crop is essentially the whole image, fall through to skip so we
    // don't waste a re-encode on a no-op.
    const isWhole =
      crop.x <= 1 && crop.y <= 1 && crop.w >= imgDims.w - 2 && crop.h >= imgDims.h - 2;
    if (isWhole) {
      skipCrop();
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = crop.w;
    canvas.height = crop.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      skipCrop();
      return;
    }
    ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          skipCrop();
          return;
        }
        // Preserve the original filename root with a suffix so the user can
        // tell at-a-glance which queue entry came from a crop.
        const dot = file.name.lastIndexOf('.');
        const root = dot > 0 ? file.name.slice(0, dot) : file.name;
        const cropped = new File([blob], `${root}.cropped.jpg`, {
          type: 'image/jpeg',
          lastModified: Date.now(),
        });
        animateOutThen(() => onConfirm(cropped));
      },
      'image/jpeg',
      0.92
    );
  }

  // ---- Render --------------------------------------------------------------

  // Crop rectangle in DISPLAY coordinates (relative to the stage).
  const cropDisp =
    crop && fit
      ? {
          left: fit.offsetX + crop.x * fit.scale,
          top: fit.offsetY + crop.y * fit.scale,
          width: crop.w * fit.scale,
          height: crop.h * fit.scale,
        }
      : null;

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Crop the photo before adding to the queue"
    >
      <div
        className={`absolute inset-0 bg-black/55 backdrop-blur-sm ${
          isExiting ? 'animate-backdrop-out' : 'animate-backdrop-in'
        }`}
      />
      <div
        className={`relative w-[min(94vw,1100px)] h-[min(78vh,820px)] rounded-2xl overflow-hidden shadow-2xl bg-cream-50 dark:bg-[#2E2924] border border-cream-300 dark:border-[#4A4540] flex flex-col ${
          isExiting ? 'animate-modal-out' : 'animate-modal-in'
        }`}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-cream-300 dark:border-[#3E3A35]">
          <div className="flex items-baseline gap-3">
            <span className="typo-label">Crop photo</span>
            {queueTotal > 1 && (
              <span className="text-xs text-ink/55 dark:text-cream-300/55 font-mono">
                {queueIndex} of {queueTotal}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={closeWithCancel}
            className="text-sm text-brass hover:text-brass-deep underline-offset-4 hover:underline transition"
          >
            Cancel
          </button>
        </div>

        {/* Stage — image with crop overlay. Pointer-events on the crop
            rectangle and handles only; the image itself is decoration. */}
        <div
          ref={stageRef}
          className="relative flex-1 min-h-0 bg-black/85 select-none touch-none"
        >
          {imgUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={imgRef}
              src={imgUrl}
              alt={file.name}
              onLoad={onImgLoad}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              draggable={false}
            />
          )}

          {cropDisp && fit && (
            <>
              {/* Four dim panels around the crop frame so the cropped area
                  pops while everything else recedes. Cheaper than a single
                  clip-path-driven backdrop and works on every browser. */}
              <div
                className="absolute bg-black/55 pointer-events-none"
                style={{ left: 0, top: 0, right: 0, height: cropDisp.top }}
              />
              <div
                className="absolute bg-black/55 pointer-events-none"
                style={{ left: 0, top: cropDisp.top + cropDisp.height, right: 0, bottom: 0 }}
              />
              <div
                className="absolute bg-black/55 pointer-events-none"
                style={{
                  left: 0,
                  top: cropDisp.top,
                  width: cropDisp.left,
                  height: cropDisp.height,
                }}
              />
              <div
                className="absolute bg-black/55 pointer-events-none"
                style={{
                  left: cropDisp.left + cropDisp.width,
                  top: cropDisp.top,
                  right: 0,
                  height: cropDisp.height,
                }}
              />

              {/* Crop frame + drag-to-move surface */}
              <div
                onPointerDown={onPointerDown('move')}
                className="absolute border-2 border-brass shadow-[0_0_0_1px_rgba(0,0,0,0.4)] cursor-move"
                style={{
                  left: cropDisp.left,
                  top: cropDisp.top,
                  width: cropDisp.width,
                  height: cropDisp.height,
                }}
              >
                {/* Rule-of-thirds guides — subtle, dashed, just enough to
                    help framing without competing with the image. */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    backgroundImage:
                      'linear-gradient(to right, rgba(255,255,255,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.18) 1px, transparent 1px)',
                    backgroundSize: '33.333% 33.333%',
                  }}
                />
              </div>

              {/* Edge + corner handles. Each is a small brass square. Edge
                  handles are wide on their long axis to give a comfortable
                  hit area without flooding the frame with brass. */}
              {(
                [
                  { h: 'nw', l: cropDisp.left, t: cropDisp.top, w: 14, ht: 14, cur: 'nwse-resize' },
                  { h: 'ne', l: cropDisp.left + cropDisp.width, t: cropDisp.top, w: 14, ht: 14, cur: 'nesw-resize' },
                  { h: 'sw', l: cropDisp.left, t: cropDisp.top + cropDisp.height, w: 14, ht: 14, cur: 'nesw-resize' },
                  { h: 'se', l: cropDisp.left + cropDisp.width, t: cropDisp.top + cropDisp.height, w: 14, ht: 14, cur: 'nwse-resize' },
                  { h: 'n', l: cropDisp.left + cropDisp.width / 2, t: cropDisp.top, w: 28, ht: 10, cur: 'ns-resize' },
                  { h: 's', l: cropDisp.left + cropDisp.width / 2, t: cropDisp.top + cropDisp.height, w: 28, ht: 10, cur: 'ns-resize' },
                  { h: 'w', l: cropDisp.left, t: cropDisp.top + cropDisp.height / 2, w: 10, ht: 28, cur: 'ew-resize' },
                  { h: 'e', l: cropDisp.left + cropDisp.width, t: cropDisp.top + cropDisp.height / 2, w: 10, ht: 28, cur: 'ew-resize' },
                ] as const
              ).map((g) => (
                <div
                  key={g.h}
                  onPointerDown={onPointerDown(g.h as Handle)}
                  className="absolute bg-brass border border-accent-deep dark:border-[#1A1A18] rounded-sm shadow"
                  style={{
                    left: g.l - g.w / 2,
                    top: g.t - g.ht / 2,
                    width: g.w,
                    height: g.ht,
                    cursor: g.cur,
                  }}
                />
              ))}
            </>
          )}
        </div>

        {/* Bottom action row */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-cream-300 dark:border-[#3E3A35]">
          <div className="text-xs text-ink/50 dark:text-cream-300/50 leading-snug">
            {crop && imgDims ? (
              <>
                Crop:{' '}
                <span className="font-mono">
                  {crop.w}×{crop.h}
                </span>{' '}
                from <span className="font-mono">{imgDims.w}×{imgDims.h}</span>
              </>
            ) : (
              <>Loading photo…</>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={skipCrop}
              className="text-sm px-4 py-2 rounded-md border border-brass/60 text-brass-deep dark:text-brass hover:bg-brass/10 transition"
            >
              Use full image
            </button>
            <button
              type="button"
              onClick={confirmCrop}
              disabled={!crop || !imgDims}
              className="text-sm px-4 py-2 rounded-md bg-brass text-accent-deep hover:bg-brass-deep hover:text-limestone font-medium transition disabled:opacity-50"
            >
              Use crop
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
