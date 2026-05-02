'use client';

/**
 * Stub for the History screen. The real layout (lifetime stats + per-batch
 * expandable table with re-download / delete actions) lands in step 8.
 * The current export ledger lives at /ledger and is still functional.
 */
import Link from 'next/link';

export default function HistoryPage() {
  return (
    <div className="space-y-4">
      <h1 className="typo-page-title">History</h1>
      <p className="typo-page-desc max-w-2xl">
        Every batch you&rsquo;ve exported, with re-download and ledger
        cleanup. Coming in step 8 of the redesign. The current export
        ledger still lives at{' '}
        <Link href="/ledger" className="underline underline-offset-2 hover:opacity-80">
          /ledger
        </Link>
        {' '}until History replaces it.
      </p>
    </div>
  );
}
