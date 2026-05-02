'use client';

import { useState, useEffect } from 'react';

interface CoverProps {
  /** Open Library / Google Books / ISBNdb-sourced cover URL. */
  coverUrl?: string;
  /** Cropped spine image used as the first fallback. */
  spineThumbnail?: string;
  /** Alt text — usually the book title. */
  alt: string;
  /** Tailwind className applied to the outer wrapper. */
  className?: string;
  /** Optional class for the inner img/placeholder so callers can size them. */
  imgClassName?: string;
}

/**
 * Three-state cover renderer:
 *   1. coverUrl that loads      → renders the cover image
 *   2. cover URL 404s OR is missing AND a spine thumbnail exists → spine
 *   3. neither works            → neutral placeholder with a book glyph
 *
 * Both <img> tags carry an `onError` handler that escalates the fallback
 * chain instead of leaving a broken-image icon visible. If the cover URL
 * itself changes (e.g., after a Reread), the error state resets so we
 * give the new URL a fair chance to load.
 */
export function Cover({
  coverUrl,
  spineThumbnail,
  alt,
  className = '',
  imgClassName = 'w-full h-full object-cover',
}: CoverProps) {
  // Track which source has failed in this mount. Reset whenever the
  // input URLs change so a Reread that swaps cover/thumbnail starts
  // fresh instead of inheriting a stale `failed` flag.
  const [coverFailed, setCoverFailed] = useState(false);
  const [spineFailed, setSpineFailed] = useState(false);
  useEffect(() => {
    setCoverFailed(false);
  }, [coverUrl]);
  useEffect(() => {
    setSpineFailed(false);
  }, [spineThumbnail]);

  const showCover = !!coverUrl && !coverFailed;
  const showSpine = !showCover && !!spineThumbnail && !spineFailed;

  if (showCover) {
    return (
      <div className={className}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={coverUrl}
          alt={`Cover of ${alt}`}
          loading="lazy"
          onError={() => setCoverFailed(true)}
          className={imgClassName}
        />
      </div>
    );
  }
  if (showSpine) {
    return (
      <div className={className}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={spineThumbnail}
          alt={`Spine read for ${alt}`}
          loading="lazy"
          onError={() => setSpineFailed(true)}
          className={imgClassName}
        />
      </div>
    );
  }
  return (
    <div
      className={`${className} flex items-center justify-center text-text-quaternary`}
      aria-label={`No cover available for ${alt}`}
    >
      <BookIcon />
    </div>
  );
}

function BookIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      width="40%"
      height="40%"
      aria-hidden
    >
      <path d="M4 4h12a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3V4z" />
      <path d="M19 17H7a3 3 0 0 0-3 3" />
      <path d="M8 7h7" />
    </svg>
  );
}
