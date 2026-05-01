'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface PhotoUploaderProps {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

export function PhotoUploader({ onFiles, disabled }: PhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Separate input for the rear-camera multi-capture loop. Using a distinct
  // element keeps the gallery picker independent and lets us reset .value
  // between shots without touching the gallery input's state.
  const cameraRef = useRef<HTMLInputElement>(null);
  const [isDragging, setDragging] = useState(false);

  // Multi-capture loop state. While `isCapturing` is true, every successful
  // capture re-clicks the camera input so the user can shoot a whole shelf
  // session without bouncing back to this screen between shots. The counter
  // is a ref so its value survives the re-renders triggered by isCapturing
  // / toast state — incrementing inside the change handler and reading it
  // again in the same handler must not lose the count.
  const [isCapturing, setIsCapturing] = useState(false);
  const captureCount = useRef(0);
  const [captureUiCount, setCaptureUiCount] = useState(0); // mirror for the visible "N taken" badge
  const [showLandscapeToast, setShowLandscapeToast] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      const accepted = Array.from(files).filter((f) =>
        /^image\/(jpeg|jpg|png|heic|heif|webp)$/i.test(f.type) ||
        /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name)
      );
      if (accepted.length === 0) return;
      onFiles(accepted);
    },
    [onFiles]
  );

  // Programmatically (re-)open the camera input. We reset .value first so
  // taking the same file twice still fires onChange — without this, capturing
  // and then capturing again with no edits silently does nothing on some
  // browsers because the input value didn't change.
  const openCamera = useCallback(() => {
    const el = cameraRef.current;
    if (!el) return;
    el.value = '';
    el.click();
  }, []);

  function startCapture() {
    if (disabled) return;
    captureCount.current = 0;
    setCaptureUiCount(0);
    setIsCapturing(true);
    setShowLandscapeToast(true);
    // Auto-dismiss the landscape reminder after 2s.
    window.setTimeout(() => setShowLandscapeToast(false), 2000);
    openCamera();
  }

  function stopCapture() {
    setIsCapturing(false);
  }

  // Handle one camera capture. Auto-renames the file to a sequential
  // `shelf-capture-NNN.jpg` so it shows up as something legible in the queue
  // (the device default is usually `image.jpg` or a long timestamp). After
  // queuing, programmatically re-open the camera if we're still in the
  // multi-capture loop. A 300ms delay gives the user a beat to see the queue
  // tick up before the OS camera UI takes the screen back.
  const handleCameraChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) {
        // Cancellation path. Some browsers fire `change` with an empty list
        // when the user dismisses the camera; others fire `cancel`. We bail
        // out of the loop either way.
        if (isCapturing) setIsCapturing(false);
        return;
      }
      captureCount.current += 1;
      const n = captureCount.current;
      const renamed = new File(
        [file],
        `shelf-capture-${String(n).padStart(3, '0')}.jpg`,
        { type: file.type || 'image/jpeg', lastModified: Date.now() }
      );
      onFiles([renamed]);
      setCaptureUiCount(n);
      if (isCapturing) {
        window.setTimeout(() => openCamera(), 300);
      }
    },
    [isCapturing, onFiles, openCamera]
  );

  // Listen for the native `cancel` event on the camera input (modern browsers
  // dispatch this when the user dismisses the file/camera picker without a
  // selection). Without this, swiping away the camera UI on iOS can leave
  // `isCapturing` stuck on true and force the user to tap Done.
  useEffect(() => {
    const el = cameraRef.current;
    if (!el) return;
    const onCancel = () => setIsCapturing(false);
    el.addEventListener('cancel', onCancel);
    return () => el.removeEventListener('cancel', onCancel);
  }, []);

  return (
    <>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (disabled) return;
          handleFiles(e.dataTransfer.files);
        }}
        className={`bookshelf-bg relative rounded-2xl border-2 border-dashed transition-all duration-200 ease-gentle p-12 text-center cursor-pointer ${
          isDragging
            ? 'border-accent bg-accent-soft/60 dark:bg-accent/20 scale-[1.01]'
            : 'border-cream-300 dark:border-ink-soft hover:border-accent'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={() => !disabled && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/heic,image/heif,image/webp,.jpg,.jpeg,.png,.heic,.heif,.webp"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {/* Mobile rear-camera capture. capture="environment" opens the back
            camera directly on iOS / Android. On desktop the attribute is
            ignored and the input behaves like the regular file picker. */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleCameraChange}
        />

        <div className="mx-auto w-14 h-14 rounded-full bg-accent/10 dark:bg-accent/30 flex items-center justify-center mb-4">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-accent"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
        </div>

        <h2 className="font-serif text-xl mb-1">Drop bookshelf photos here</h2>
        <p className="text-[11px] uppercase tracking-wider text-ink/50 dark:text-cream-300/50 mb-5">
          Landscape · fill the frame · 2–3 feet away · flash off
        </p>
        <div className="inline-flex flex-wrap justify-center gap-2">
          <button
            type="button"
            className="inline-flex items-center text-sm px-5 py-2 rounded-md bg-accent text-limestone hover:bg-accent-deep transition disabled:opacity-50"
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              inputRef.current?.click();
            }}
          >
            Choose photos
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-sm px-5 py-2 rounded-md border border-accent text-accent dark:text-brass dark:border-brass hover:bg-accent hover:text-limestone dark:hover:bg-brass dark:hover:text-accent-deep transition disabled:opacity-50"
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              startCapture();
            }}
            title="Open the rear camera and capture multiple shelves in sequence"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            Take photos
          </button>
        </div>
      </div>

      {/* Landscape orientation toast — fires on every Take photos press; auto
          dismisses after 2s. Non-blocking; portrait shots still process. */}
      {showLandscapeToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-lg bg-ink dark:bg-cream-50 text-cream-50 dark:text-ink shadow-xl text-sm font-medium animate-toast pointer-events-none">
          Hold your tablet in landscape for best results
        </div>
      )}

      {/* Floating "Done" bar — visible while the multi-capture loop is active.
          Sticks to the bottom of the viewport so the user can dismiss the
          camera UI from one tap regardless of where they are on the page. */}
      {isCapturing && (
        <div className="fixed bottom-0 inset-x-0 z-50 flex items-center justify-center gap-3 px-4 py-3 bg-accent dark:bg-green-deep border-t border-brass/40 shadow-[0_-8px_24px_rgba(0,0,0,0.25)]">
          <span className="text-sm text-brass-soft font-medium">
            {captureUiCount === 0
              ? 'Capturing — open camera now'
              : `${captureUiCount} photo${captureUiCount === 1 ? '' : 's'} taken`}
          </span>
          <button
            type="button"
            onClick={stopCapture}
            className="px-4 py-2 rounded-md bg-brass text-accent-deep hover:bg-brass-deep hover:text-limestone font-medium text-sm transition"
          >
            Done taking photos
          </button>
          <button
            type="button"
            onClick={openCamera}
            className="px-3 py-2 rounded-md border border-brass/50 text-brass hover:bg-fern transition text-sm"
            title="If the camera didn't reopen automatically, tap to reopen"
          >
            Reopen camera
          </button>
        </div>
      )}
    </>
  );
}
