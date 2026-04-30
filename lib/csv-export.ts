import type { BookRecord } from './types';

function escape(field: string): string {
  const needsQuoting = /[",\n\r]/.test(field);
  const escaped = field.replace(/"/g, '""');
  return needsQuoting ? `"${escaped}"` : `"${escaped}"`;
}

export function toAuthorLastFirst(author: string): string {
  if (!author) return '';
  if (author.includes(',')) return author;
  const parts = author.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  const first = parts.slice(0, -1).join(' ');
  return `${last}, ${first}`;
}

export const CSV_HEADERS = [
  'TITLE',
  'AUTHOR (last, first)',
  'ISBN',
  'PUBLICATION',
  'DATE',
  'TAGS',
  'COPIES',
];

export function bookToCsvRow(b: BookRecord): string[] {
  const tags = [...b.genreTags, ...b.formTags].join(', ');
  return [
    b.title,
    b.authorLF || toAuthorLastFirst(b.author),
    b.isbn,
    b.publisher,
    b.publicationYear ? String(b.publicationYear) : '',
    tags,
    '1',
  ];
}

export function generateCsv(books: BookRecord[]): string {
  const lines: string[] = [];
  lines.push(CSV_HEADERS.map(escape).join(','));
  for (const book of books) {
    lines.push(bookToCsvRow(book).map(escape).join(','));
  }
  return lines.join('\n');
}

export function exportFilename(count: number, date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `skinsbury-lt-import-${yyyy}-${mm}-${dd}-${count}books.csv`;
}
