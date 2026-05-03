'use client';

import { useState, useEffect } from 'react';

interface CoverProps {
  /** Open Library / Google Books / ISBNdb-sourced cover URL. */
  coverUrl?: string;
  /**
   * Optional ordered list of cover-art URLs the cascade collected
   * (OL by ISBN → GB thumb → ISBNdb image, deduped). When present,
   * an <img> onError advances to the next entry instead of dropping
   * straight to the spine fallback. Old records without this field
   * keep the existing single-URL behavior.
   */
  coverUrlFallbacks?: string[];
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
  coverUrlFallbacks,
  spineThumbnail,
  alt,
  className = '',
  imgClassName = 'w-full h-full object-cover',
}: CoverProps) {
  // Build the candidate chain. `coverUrlFallbacks` (when present) is
  // already deduped + ordered. Splice in the legacy `coverUrl` first
  // for old records that don't carry the fallbacks array. Empty
  // strings are dropped so the chain length only counts real URLs.
  const candidates: string[] = [];
  if (coverUrl) candidates.push(coverUrl);
  if (coverUrlFallbacks) {
    for (const u of coverUrlFallbacks) {
      if (u && !candidates.includes(u)) candidates.push(u);
    }
  }

  // Index into the candidate chain. Advances on each onError until we
  // run out, at which point the spine fallback kicks in.
  const [coverIdx, setCoverIdx] = useState(0);
  const [spineFailed, setSpineFailed] = useState(false);
  useEffect(() => {
    setCoverIdx(0);
  }, [coverUrl, coverUrlFallbacks?.join('|')]);
  useEffect(() => {
    setSpineFailed(false);
  }, [spineThumbnail]);

  const activeCover = coverIdx < candidates.length ? candidates[coverIdx] : '';
  const showCover = !!activeCover;
  const showSpine = !showCover && !!spineThumbnail && !spineFailed;

  if (showCover) {
    return (
      <div className={className}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={activeCover}
          alt={`Cover of ${alt}`}
          loading="lazy"
          onError={() => setCoverIdx((i) => i + 1)}
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
