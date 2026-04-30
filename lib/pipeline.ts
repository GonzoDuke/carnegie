import type { BookRecord, InferTagsResult, BookLookupResult, SpineRead } from './types';
import { toAuthorLastFirst } from './csv-export';

export function makeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function processPhoto(file: File): Promise<SpineRead[]> {
  const fd = new FormData();
  fd.append('image', file);
  const res = await fetch('/api/process-photo', { method: 'POST', body: fd });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `process-photo failed (${res.status})`);
  }
  const data = (await res.json()) as { spines: SpineRead[] };
  return data.spines ?? [];
}

export async function lookupBookClient(
  title: string,
  author: string
): Promise<BookLookupResult> {
  const res = await fetch('/api/lookup-book', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, author }),
  });
  if (!res.ok) {
    return { isbn: '', publisher: '', publicationYear: 0, lcc: '', source: 'none' };
  }
  return (await res.json()) as BookLookupResult;
}

export async function inferTagsClient(args: {
  title: string;
  author: string;
  isbn?: string;
  publisher?: string;
  publicationYear?: number;
  lcc?: string;
  subjectHeadings?: string[];
}): Promise<InferTagsResult> {
  const res = await fetch('/api/infer-tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    return { genreTags: [], formTags: [], confidence: 'LOW', reasoning: '' };
  }
  return (await res.json()) as InferTagsResult;
}

export interface PipelineResult {
  book: BookRecord;
}

export async function buildBookFromSpine(
  spine: SpineRead,
  sourcePhoto: string
): Promise<BookRecord> {
  const warnings: string[] = [];

  const title = spine.title ?? '';
  const author = spine.author ?? '';

  let lookup: BookLookupResult = {
    isbn: '',
    publisher: spine.publisher ?? '',
    publicationYear: 0,
    lcc: '',
    source: 'none',
  };

  if (title) {
    try {
      const r = await lookupBookClient(title, author);
      lookup = {
        ...r,
        publisher: r.publisher || spine.publisher || '',
      };
    } catch {
      warnings.push('Lookup service unavailable.');
    }
  } else {
    warnings.push('Spine unreadable in photo — title not detected.');
  }

  if (lookup.source === 'none' && title) {
    warnings.push('No metadata match in Open Library or Google Books — book info may be incomplete.');
  }
  if (!lookup.isbn && lookup.source !== 'none') {
    warnings.push('No ISBN found — metadata may be incomplete.');
  }
  if (!lookup.lcc) {
    warnings.push('LCC code missing — tags inferred from title and author only.');
  }

  let tags: InferTagsResult = {
    genreTags: [],
    formTags: [],
    confidence: 'LOW',
    reasoning: '',
  };

  if (title) {
    try {
      tags = await inferTagsClient({
        title,
        author,
        isbn: lookup.isbn,
        publisher: lookup.publisher,
        publicationYear: lookup.publicationYear,
        lcc: lookup.lcc,
        subjectHeadings: lookup.subjects,
      });
    } catch {
      warnings.push('Tag inference failed.');
    }
  }

  // Combined confidence: lowest of spine confidence and tag confidence
  const order = { LOW: 0, MEDIUM: 1, HIGH: 2 } as const;
  const combinedConfidence =
    order[spine.confidence] <= order[tags.confidence] ? spine.confidence : tags.confidence;

  return {
    id: makeId(),
    spineRead: spine,
    title,
    author,
    authorLF: toAuthorLastFirst(author),
    isbn: lookup.isbn,
    publisher: lookup.publisher,
    publicationYear: lookup.publicationYear,
    lcc: lookup.lcc,
    genreTags: tags.genreTags,
    formTags: tags.formTags,
    confidence: combinedConfidence,
    reasoning: tags.reasoning,
    status: 'pending',
    warnings,
    sourcePhoto,
  };
}

export function createThumbnail(file: File, maxSize = 160): Promise<string> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      try {
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      } catch {
        resolve('');
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve('');
    };
    img.src = url;
  });
}
