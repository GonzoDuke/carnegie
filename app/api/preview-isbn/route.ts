import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 10;

/**
 * Fast ISBN preview for the barcode scanner's confirm-frame UI.
 *
 * Tries ISBNdb's /book/{isbn} direct endpoint first (the API key
 * lives only on the server, so the client can't hit it directly),
 * falls back to Open Library's /isbn/{isbn}.json on miss. Returns a
 * minimal { title, author, coverUrl, source } shape — no LCC, no
 * subjects, no synopsis, no enrichment fan-out. The full
 * /api/lookup-book pipeline still runs at the moment the user
 * commits the ISBN; this route exists purely to render a "is this
 * the right book?" confirmation card while the camera is paused.
 *
 * The CLIENT enforces the user-facing 3-second timeout via
 * AbortSignal; this route's own timeouts (per-fetch) are slightly
 * higher so a tiny tail of cases still resolve before the client
 * gives up.
 */

interface PreviewResponse {
  title: string;
  author: string;
  coverUrl: string;
  source: 'isbndb' | 'openlibrary' | 'none';
}

const EMPTY: PreviewResponse = { title: '', author: '', coverUrl: '', source: 'none' };

async function tryIsbndb(isbn: string, signal: AbortSignal): Promise<PreviewResponse | null> {
  const apiKey = process.env.ISBNDB_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(`https://api2.isbndb.com/book/${encodeURIComponent(isbn)}`, {
      signal,
      cache: 'no-store',
      headers: {
        Authorization: apiKey,
        Accept: 'application/json',
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      book?: {
        title?: string;
        title_long?: string;
        authors?: string[];
        image?: string;
      };
    };
    const b = data.book;
    if (!b || !(b.title || b.title_long)) return null;
    return {
      title: (b.title_long || b.title || '').trim(),
      author: (b.authors && b.authors[0] ? String(b.authors[0]) : '').trim(),
      coverUrl: (b.image ?? '').trim(),
      source: 'isbndb',
    };
  } catch {
    return null;
  }
}

async function tryOpenLibrary(isbn: string, signal: AbortSignal): Promise<PreviewResponse | null> {
  try {
    const res = await fetch(`https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`, {
      signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      title?: string;
      authors?: { key: string }[];
    };
    if (!data.title) return null;
    // OL's /isbn/{}.json returns authors as { key: '/authors/OL...A' } refs;
    // resolve the first to a name so the preview card has more than
    // just a title. Bounded by the parent signal so the whole call
    // stays under the client's 3s budget.
    let author = '';
    if (data.authors && data.authors.length > 0 && data.authors[0]?.key) {
      try {
        const aRes = await fetch(`https://openlibrary.org${data.authors[0].key}.json`, {
          signal,
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        if (aRes.ok) {
          const aData = (await aRes.json()) as { name?: string };
          author = (aData.name ?? '').trim();
        }
      } catch {
        // title-only preview is fine — author empty.
      }
    }
    return {
      title: data.title,
      author,
      // OL Covers API by ISBN with default=false so a missing cover
      // 404s instead of returning a grey placeholder; the <img>
      // onError in the BarcodeScanner falls through cleanly.
      coverUrl: `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`,
      source: 'openlibrary',
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('isbn') ?? '';
  const isbn = raw.replace(/[^\dxX]/g, '').toUpperCase();
  if (!isbn || (isbn.length !== 10 && isbn.length !== 13)) {
    return NextResponse.json({ ...EMPTY, error: 'Invalid ISBN' }, { status: 400 });
  }

  // Defense-in-depth timeout. The client hard-caps at 3000ms with its
  // own AbortController; we bound the server side at 4500ms so a
  // hung upstream can't leak into a Vercel function's full
  // maxDuration.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const isbndb = await tryIsbndb(isbn, controller.signal);
    if (isbndb && isbndb.title) return NextResponse.json(isbndb);
    const ol = await tryOpenLibrary(isbn, controller.signal);
    if (ol && ol.title) return NextResponse.json(ol);
    return NextResponse.json(EMPTY);
  } catch {
    return NextResponse.json(EMPTY);
  } finally {
    clearTimeout(timer);
  }
}
