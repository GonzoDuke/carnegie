'use client';

/**
 * Stub for the Vocabulary screen. The real two-column layout (domain rail
 * + tag table + changelog) lands in step 7 of the redesign. The route
 * exists now so the new sidebar's Library section doesn't 404.
 */
export default function VocabularyPage() {
  return (
    <div className="space-y-4">
      <h1 className="typo-page-title">Vocabulary</h1>
      <p className="typo-page-desc max-w-2xl">
        Manage the controlled tag vocabulary — add tags, retire unused ones,
        review the changelog. Coming in step 7 of the redesign.
      </p>
    </div>
  );
}
