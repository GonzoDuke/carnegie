'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface PhotoUploaderProps {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

export function PhotoUploader({ onFiles, disabled }: PhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isDragging, setDragging] = useState(false);

  // In-app camera state. We stream the rear camera into a fullscreen <video>
  // and grab frames on shutter press. This avoids the OS file picker that
  // some Android browsers (notably Samsung Chrome) flash before launching
  // the camera when using <input capture="environment">.
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [shutterFlash, setShutterFlash] = useState(false);
  const captureCount = useRef(0);
  const [captureUiCount, setCaptureUiCount] = useState(0);
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

  // Stop the active camera stream and release the hardware. Safe to call
  // multiple times; tracks that are already stopped are no-ops.
  const stopStream = useCallback(() => {
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCapture = useCallback(async () => {
    if (disabled) return;
    captureCount.current = 0;
    setCaptureUiCount(0);
    setCameraError(null);
    setIsCameraOpen(true);
    setShowLandscapeToast(true);
    window.setTimeout(() => setShowLandscapeToast(false), 2000);

    try {
      // Prefer the rear camera. Some devices ignore facingMode unless we ask
      // for an ideal resolution alongside it, hence the width/height hints.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        // Some browsers need an explicit play() after srcObject assignment.
        await v.play().catch(() => {});
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.name === 'NotAllowedError'
            ? 'Camera permission denied. Enable it in your browser settings to take photos.'
            : err.name === 'NotFoundError'
            ? 'No camera was found on this device.'
            : err.message
          : 'Could not access the camera.';
      setCameraError(msg);
    }
  }, [disabled]);

  const stopCapture = useCallback(() => {
    stopStream();
    setIsCameraOpen(false);
    setCameraError(null);
  }, [stopStream]);

  // Grab the current video frame into a JPEG File. We use the native video
  // dimensions so the capture matches the sensor resolution rather than the
  // CSS-scaled element size.
  const takePhoto = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.videoWidth || !v.videoHeight) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);

    setShutterFlash(true);
    window.setTimeout(() => setShutterFlash(false), 120);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        captureCount.current += 1;
        const n = captureCount.current;
        const file = new File(
          [blob],
          `shelf-capture-${String(n).padStart(3, '0')}.jpg`,
          { type: 'image/jpeg', lastModified: Date.now() }
        );
        onFiles([file]);
        setCaptureUiCount(n);
      },
      'image/jpeg',
      0.92
    );
  }, [onFiles]);

  // Release the camera if the component unmounts or the page is hidden
  // (tab switch, screen lock). Without this the indicator light can stay on.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && isCameraOpen) {
        stopCapture();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stopStream();
    };
  }, [isCameraOpen, stopCapture, stopStream]);

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

      {showLandscapeToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-lg bg-ink dark:bg-cream-50 text-cream-50 dark:text-ink shadow-xl text-sm font-medium animate-toast pointer-events-none">
          Hold your tablet in landscape for best results
        </div>
      )}

      {/* Fullscreen in-app camera. The live <video> fills the viewport and the
          shutter / done controls float over it. We never hand off to the OS
          camera app, so no file picker can flash up first on Samsung Chrome. */}
      {isCameraOpen && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <video
            ref={videoRef}
            playsInline
            autoPlay
            muted
            className="absolute inset-0 w-full h-full object-contain bg-black"
          />

          {shutterFlash && (
            <div className="absolute inset-0 bg-white/80 pointer-events-none" />
          )}

          {cameraError && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="max-w-md text-center bg-ink/90 text-cream-50 rounded-lg p-6 shadow-2xl">
                <p className="text-sm mb-4">{cameraError}</p>
                <button
                  type="button"
                  onClick={stopCapture}
                  className="px-4 py-2 rounded-md bg-brass text-accent-deep hover:bg-brass-deep hover:text-limestone font-medium text-sm transition"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {/* Top bar: counter + close */}
          <div className="absolute top-0 inset-x-0 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/70 to-transparent">
            <span className="text-sm text-white font-medium">
              {captureUiCount === 0
                ? 'Aim at a shelf'
                : `${captureUiCount} photo${captureUiCount === 1 ? '' : 's'} taken`}
            </span>
            <button
              type="button"
              onClick={stopCapture}
              className="px-4 py-2 rounded-md bg-brass text-accent-deep hover:bg-brass-deep hover:text-limestone font-medium text-sm transition"
            >
              Done
            </button>
          </div>

          {/* Bottom bar: shutter button */}
          {!cameraError && (
            <div className="absolute bottom-0 inset-x-0 flex items-center justify-center pb-8 pt-12 bg-gradient-to-t from-black/70 to-transparent">
              <button
                type="button"
                onClick={takePhoto}
                aria-label="Take photo"
                className="w-20 h-20 rounded-full bg-white border-4 border-white/40 shadow-2xl active:scale-95 transition-transform flex items-center justify-center"
              >
                <span className="w-16 h-16 rounded-full bg-white border-2 border-black/20" />
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
