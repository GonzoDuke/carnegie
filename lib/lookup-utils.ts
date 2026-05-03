/**
 * Env-free lookup helpers shared between the server lookup cascade
 * (lib/book-lookup.ts) and the client-bundled barcode-scan flow
 * (lib/scan-pipeline.ts). Anything that touches `process.env` for an
 * API key MUST stay out of this module — keeping that boundary clean
 * is what guarantees server-only secret names never leak into the
 * client bundle through transitive imports.
 *
 * The LoC SRU endpoint is fully public (no key, no auth) so this is
 * safe to call from the browser.
 */

const UA = 'Carnegie/1.0 (personal cataloging tool)';

const LOC_HEADERS: Record<string, string> = {
  'User-Agent': UA,
  Accept: 'application/xml',
};

/**
 * Strip characters that mangle external API queries — wildcards (*),
 * mentions (@), hashes (#), shell-y money signs ($), exclamation
 * marks (!) — and collapse runs of whitespace. Used by lookupBook
 * to clean spine-read titles like "Holy Sh*t" before they hit OL,
 * Google Books, ISBNdb, or Wikidata, where a literal `*` becomes a
 * wildcard or breaks the SPARQL CONTAINS filter.
 */
export function sanitizeForSearch(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\*@#\$!]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Open Library returns LCC in a padded internal form like
 *   "BL-0053.00000000.J36 2012"
 *   "Q--0335.00000000.M6 2024"
 *   "E--0169.12000000.K556 2022"
 * Convert to canonical Library of Congress format:
 *   "BL53 .J36 2012", "Q335 .M6 2024", "E169.12 .K556 2022".
 *
 * Inputs already in canonical or unparseable form pass through trimmed.
 */
export function normalizeLcc(s: string | undefined | null): string {
  if (!s) return '';
  const m = s.match(/^([A-Z]{1,3})[-\s]+(\d+)\.(\d+)\.(.+)$/);
  if (!m) return s.trim();
  const klass = m[1];
  const intPart = String(parseInt(m[2], 10));
  const decPart = m[3].replace(/0+$/, '');
  const num = decPart ? `${intPart}.${decPart}` : intPart;
  const cutter = m[4].trim();
  return `${klass}${num} .${cutter}`;
}

/**
 * Library of Congress SRU lookup by ISBN. Returns canonical-format LCC
 * or empty string. Free, no API key, ~0.5–2s typical.
 *
 * Example response (excerpted):
 *   <datafield tag="050" ind1="0" ind2="0">
 *     <subfield code="a">CT275.H62575</subfield>
 *     <subfield code="b">A3 2010</subfield>
 *   </datafield>
 */
async function loFetch050(url: string, timeoutMs: number): Promise<string> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
      headers: LOC_HEADERS,
    });
    if (!res.ok) return '';
    const xml = await res.text();
    const fieldMatch = xml.match(
      /<datafield[^>]*tag="050"[^>]*>([\s\S]*?)<\/datafield>/
    );
    if (!fieldMatch) return '';
    const block = fieldMatch[1];
    const a = block.match(/<subfield[^>]*code="a"[^>]*>([^<]+)<\/subfield>/)?.[1]?.trim() ?? '';
    const b = block.match(/<subfield[^>]*code="b"[^>]*>([^<]+)<\/subfield>/)?.[1]?.trim() ?? '';
    return [a, b].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  } catch {
    return '';
  }
}

export async function lookupLccByIsbn(isbn: string): Promise<string> {
  if (!isbn) return '';
  const cleaned = isbn.replace(/[^\dxX]/g, '');
  if (!cleaned) return '';
  const url =
    `https://lx2.loc.gov/sru/voyager?version=1.1&operation=searchRetrieve` +
    `&query=bath.isbn=${cleaned}&maximumRecords=1&recordSchema=marcxml`;
  return loFetch050(url, 8000);
}

/**
 * Tier 5: LoC SRU by title + author. Best-effort — the LoC endpoint is
 * occasionally slow/flaky on text queries; tight timeout, fall through
 * silently on miss or timeout.
 */
export async function lookupLccByTitleAuthor(title: string, author: string): Promise<string> {
  const t = (title ?? '').trim();
  const a = (author ?? '').trim();
  if (!t || !a) return '';
  const cql = `bath.title=${JSON.stringify(t)} AND bath.author=${JSON.stringify(a)}`;
  const url =
    `https://lx2.loc.gov/sru/voyager?version=1.1&operation=searchRetrieve` +
    `&query=${encodeURIComponent(cql)}&maximumRecords=1&recordSchema=marcxml`;
  return loFetch050(url, 7000);
}
