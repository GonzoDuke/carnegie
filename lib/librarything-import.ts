/**
 * LibraryThing catalog import — parse a user's exported catalog and
 * convert it to LedgerEntry rows that drop into the same export
 * ledger Carnegie writes to. Existing dedup (by ISBN, falling back
 * to normalized title+author) means re-imports are idempotent and
 * an imported book will flag as a duplicate if scanned/photographed
 * later.
 *
 * Accepts the three formats LibraryThing's export.php emits:
 *   - JSON   (array of book objects)
 *   - CSV    (RFC 4180-style quoted fields)
 *   - TSV    (tab-delimited; same field set as CSV)
 *
 * The schemas overlap heavily; this module exposes a single
 * `LtRecord` shape and three parsers that hydrate it.
 */

import {
  bookToLedgerEntry,
  normalizeAuthor,
  normalizeIsbn,
  normalizeTitle,
  type LedgerEntry,
} from './export-ledger';
import { toAuthorLastFirst } from './csv-export';

export const LT_BATCH_LABEL = 'LibraryThing Import';

export interface LtRecord {
  title: string;
  author: string;
  isbn: string;
  publisher: string;
  publicationYear: number;
  tags: string[];
  comments: string;
}

// Parsed row counts for the preview panel.
export interface ImportPreview {
  total: number;
  /** Already in the ledger (matched by ISBN or title+author). */
  existing: number;
  /** Have neither ISBN nor (title+author) — dropped. */
  unrecoverable: number;
  /** Will actually be added. */
  toAdd: number;
  newEntries: LedgerEntry[];
}

// ---------------------------------------------------------------------------
// JSON parser
// ---------------------------------------------------------------------------

/**
 * LT's JSON export is either an array of book objects or an object
 * keyed by `books_id`. Tolerate both shapes — older exports use the
 * keyed-object form. Field names varied across years; we read every
 * known synonym.
 */
export function parseJson(text: string): LtRecord[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return [];
  }
  // Normalize to an array.
  let arr: unknown[] = [];
  if (Array.isArray(raw)) {
    arr = raw;
  } else if (raw && typeof raw === 'object') {
    arr = Object.values(raw as Record<string, unknown>);
  }
  return arr
    .map((row) => (row && typeof row === 'object' ? rowToRecord(row as Record<string, unknown>) : null))
    .filter((r): r is LtRecord => r !== null);
}

function rowToRecord(row: Record<string, unknown>): LtRecord | null {
  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      const v = row[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
      if (typeof v === 'number') return String(v);
    }
    return '';
  };
  const title = pick('title', 'Title', 'TITLE');
  const author = pick(
    'primaryauthor',
    'author',
    'Author',
    'AUTHOR',
    'authorlf',
    'authorLF'
  );
  const isbnRaw = pick(
    'originalisbn',
    'ORIGINALISBN',
    'isbn',
    'ISBN',
    'isbn_13',
    'ean'
  );
  const publisher = pick('publication', 'publisher', 'Publisher');
  const dateField = pick('date', 'Date', 'publication date', 'originalpublicationdate');
  const publicationYear = parseYear(dateField) || parseYear(publisher) || 0;
  const tags = parseTags(row.tags ?? row.Tags ?? row.TAGS);
  const comments = pick('comments', 'Comments', 'COMMENTS', 'review', 'Review');

  if (!title && !isbnRaw) return null;
  return {
    title,
    author: stripAuthorLF(author),
    isbn: normalizeIsbn(isbnRaw),
    publisher: stripPublisherDate(publisher),
    publicationYear,
    tags,
    comments,
  };
}

function parseYear(s: string): number {
  if (!s) return 0;
  const m = s.match(/\b(1[5-9]\d{2}|20\d{2}|21\d{2})\b/);
  return m ? parseInt(m[1], 10) : 0;
}

function parseTags(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) {
    return v.map((t) => (typeof t === 'string' ? t.trim() : '')).filter(Boolean);
  }
  if (typeof v === 'string') {
    // LT's CSV emits comma-separated tags inside a quoted string. JSON
    // sometimes flattens to the same form. Split on either comma or
    // semicolon, trim, dedupe.
    const seen = new Set<string>();
    const out: string[] = [];
    for (const part of v.split(/[,;]/)) {
      const t = part.trim();
      if (t && !seen.has(t.toLowerCase())) {
        seen.add(t.toLowerCase());
        out.push(t);
      }
    }
    return out;
  }
  return [];
}

/**
 * LT sometimes stores author as "Last, First" already. The export
 * ledger keeps both forms (`author` is "First Last", `authorLF` is
 * "Last, First"), so we normalize the input back to "First Last".
 */
function stripAuthorLF(a: string): string {
  if (!a) return '';
  const m = a.match(/^([^,]+),\s*(.+)$/);
  if (!m) return a;
  return `${m[2].trim()} ${m[1].trim()}`;
}

/**
 * LT's `publication` field is often "Publisher (Year)" or
 * "Publisher · Year". Drop the year suffix and any common separator
 * trailing junk so the publisher field reads cleanly.
 */
function stripPublisherDate(p: string): string {
  if (!p) return '';
  return p
    .replace(/\s*\(\d{4}\)\s*$/, '')
    .replace(/\s*[·,]\s*\d{4}\s*$/, '')
    .trim();
}

// ---------------------------------------------------------------------------
// CSV / TSV parser
// ---------------------------------------------------------------------------

/**
 * Hand-rolled RFC 4180-style parser. Streams character-by-character
 * so a multi-megabyte LT export doesn't blow the regex stack. Handles
 * quoted fields, embedded delimiters, and embedded quotes (escaped as
 * "" per the spec).
 */
export function parseDelimited(text: string, delimiter: ',' | '\t'): LtRecord[] {
  if (!text) return [];
  const rows = parseDelimitedRows(text, delimiter);
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  const records: LtRecord[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    if (cells.length === 1 && cells[0] === '') continue; // skip blank lines
    const obj: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = cells[j] ?? '';
    }
    const rec = rowToRecord(obj);
    if (rec) records.push(rec);
  }
  return records;
}

function parseDelimitedRows(text: string, delim: ',' | '\t'): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuote = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuote = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuote = true;
      i += 1;
      continue;
    }
    if (ch === delim) {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\r') {
      // Treat \r, \r\n, \n all as row terminators.
      i += 1;
      if (text[i] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  // Final row (no trailing newline).
  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

export function detectFormat(filename: string, text: string): 'json' | 'csv' | 'tsv' | 'unknown' {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.tsv') || lower.endsWith('.tab')) return 'tsv';
  // Sniff: leading whitespace stripped, then check first char.
  const head = text.trimStart();
  if (head.startsWith('{') || head.startsWith('[')) return 'json';
  // Tab present in the first line → TSV; else CSV by default.
  const firstNewline = text.indexOf('\n');
  const firstLine = firstNewline >= 0 ? text.slice(0, firstNewline) : text;
  if (firstLine.includes('\t')) return 'tsv';
  return 'csv';
}

export function parseFile(filename: string, text: string): LtRecord[] {
  const fmt = detectFormat(filename, text);
  switch (fmt) {
    case 'json':
      return parseJson(text);
    case 'csv':
      return parseDelimited(text, ',');
    case 'tsv':
      return parseDelimited(text, '\t');
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// LedgerEntry conversion
// ---------------------------------------------------------------------------

/**
 * Convert parsed LtRecords to LedgerEntry rows. Drops entries with
 * neither ISBN nor (title+author) — they can't dedupe so they'd just
 * pollute the ledger. All entries get the import-date `date` and the
 * shared `LT_BATCH_LABEL` so they appear as a single batch on History.
 */
export function toLedgerEntries(
  records: LtRecord[],
  importDate: Date = new Date()
): LedgerEntry[] {
  const dateStr = importDate.toISOString().slice(0, 10);
  const out: LedgerEntry[] = [];
  for (const r of records) {
    const isbn = normalizeIsbn(r.isbn);
    const titleNorm = normalizeTitle(r.title);
    const authorNorm = normalizeAuthor(r.author);
    if (!isbn && !titleNorm) continue;
    const authorLF = r.author ? toAuthorLastFirst(r.author) : '';
    const entry: LedgerEntry = {
      isbn,
      titleNorm,
      authorNorm,
      date: dateStr,
      batchLabel: LT_BATCH_LABEL,
      tags: r.tags.length > 0 ? r.tags : undefined,
      title: r.title || undefined,
      author: r.author || undefined,
      authorLF: authorLF || undefined,
      publisher: r.publisher || undefined,
      publicationYear: r.publicationYear || undefined,
      batchNotes: r.comments || undefined,
    };
    out.push(entry);
  }
  return out;
}

/**
 * Compute a preview against the current local ledger cache so the
 * UI can show "X new, Y duplicate" before the user commits. The
 * server-side merge in /api/ledger is canonical (mergeLedgerAdditions
 * runs there too against the latest remote state); this is just a
 * hint so the user knows roughly what's about to happen.
 */
export function buildPreview(
  records: LtRecord[],
  existingLedger: LedgerEntry[],
  importDate: Date = new Date()
): ImportPreview {
  const newEntries = toLedgerEntries(records, importDate);
  const total = records.length;
  const unrecoverable = total - newEntries.length;

  // Same dedup semantics as entriesMatch in lib/export-ledger.ts.
  const byIsbn = new Map<string, true>();
  const byTitleAuthor = new Map<string, true>();
  for (const e of existingLedger) {
    if (e.isbn) byIsbn.set(e.isbn, true);
    if (e.titleNorm) byTitleAuthor.set(`${e.titleNorm}\0${e.authorNorm}`, true);
  }
  let existing = 0;
  const truelyNew: LedgerEntry[] = [];
  for (const e of newEntries) {
    const dupByIsbn = e.isbn && byIsbn.has(e.isbn);
    const dupByTitle =
      !e.isbn && e.titleNorm && byTitleAuthor.has(`${e.titleNorm}\0${e.authorNorm}`);
    if (dupByIsbn || dupByTitle) {
      existing += 1;
    } else {
      truelyNew.push(e);
    }
  }
  return {
    total,
    existing,
    unrecoverable,
    toAdd: truelyNew.length,
    newEntries: truelyNew,
  };
}

// Exported for tests + external callers.
export { bookToLedgerEntry };
