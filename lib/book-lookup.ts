import type { BookLookupResult } from './types';

interface OpenLibraryDoc {
  isbn?: string[];
  publisher?: string[];
  first_publish_year?: number;
  publish_year?: number[];
  lcc?: string[];
  lc_classifications?: string[];
  subject?: string[];
}

function pickIsbn(arr?: string[]): string {
  if (!arr || arr.length === 0) return '';
  // Prefer ISBN-13 (length 13)
  const thirteen = arr.find((i) => i.replace(/[^\d]/g, '').length === 13);
  if (thirteen) return thirteen.replace(/[^\d]/g, '');
  return arr[0].replace(/[^\dxX]/g, '');
}

export async function lookupBook(
  title: string,
  author: string
): Promise<BookLookupResult> {
  if (!title) {
    return { isbn: '', publisher: '', publicationYear: 0, lcc: '', source: 'none' };
  }

  // 1) Open Library
  try {
    const params = new URLSearchParams();
    params.set('title', title);
    if (author) params.set('author', author);
    params.set('limit', '3');
    const url = `https://openlibrary.org/search.json?${params.toString()}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = (await res.json()) as { docs?: OpenLibraryDoc[] };
      const doc = data.docs?.[0];
      if (doc) {
        const isbn = pickIsbn(doc.isbn);
        const publisher = doc.publisher?.[0] ?? '';
        const publicationYear =
          doc.first_publish_year ??
          (doc.publish_year && doc.publish_year[0]) ??
          0;
        const lcc =
          (doc.lcc && doc.lcc[0]) ??
          (doc.lc_classifications && doc.lc_classifications[0]) ??
          '';
        if (isbn || publisher || lcc) {
          return {
            isbn,
            publisher,
            publicationYear,
            lcc,
            subjects: doc.subject?.slice(0, 10),
            source: 'openlibrary',
          };
        }
      }
    }
  } catch {
    // fall through to Google Books
  }

  // 2) Google Books fallback
  try {
    const q = `intitle:${encodeURIComponent(title)}${
      author ? `+inauthor:${encodeURIComponent(author)}` : ''
    }`;
    const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
    const keyParam = apiKey ? `&key=${apiKey}` : '';
    const url = `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=3${keyParam}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = (await res.json()) as {
        items?: Array<{
          volumeInfo: {
            industryIdentifiers?: { type: string; identifier: string }[];
            publisher?: string;
            publishedDate?: string;
            categories?: string[];
          };
        }>;
      };
      const vi = data.items?.[0]?.volumeInfo;
      if (vi) {
        const ids = vi.industryIdentifiers ?? [];
        const isbn13 = ids.find((i) => i.type === 'ISBN_13')?.identifier ?? '';
        const isbn10 = ids.find((i) => i.type === 'ISBN_10')?.identifier ?? '';
        const isbn = isbn13 || isbn10;
        const publisher = vi.publisher ?? '';
        const year = vi.publishedDate ? parseInt(vi.publishedDate.slice(0, 4), 10) : 0;
        return {
          isbn,
          publisher,
          publicationYear: Number.isFinite(year) ? year : 0,
          lcc: '',
          subjects: vi.categories ?? [],
          source: 'googlebooks',
        };
      }
    }
  } catch {
    // ignore
  }

  return { isbn: '', publisher: '', publicationYear: 0, lcc: '', source: 'none' };
}
