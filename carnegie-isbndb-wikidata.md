# Carnegie — add ISBNdb and Wikidata to lookup chain

## Summary

Add two new lookup tiers to close remaining metadata gaps. ISBNdb is a paid service with 110M+ titles — the broadest single book database available. Wikidata is free with strong LCC coverage from structured community data. Both integrate into the existing cascade in `lib/book-lookup.ts`.

## Updated lookup chain order

```
1. Open Library (free, no key)        → ISBN, publisher, year, LCC, subjects
2. LoC SRU (free, no key)             → authoritative LCC, canonical author names
3. ISBNdb (paid, key required)  [NEW] → ISBN, publisher, year, DDC, subjects, pages
4. Google Books (free, optional key)  → ISBN, publisher, year, categories
5. Wikidata (free, no key)      [NEW] → LCC, DDC, ISBN, author identifiers
6. OCLC Classify (free, no key)       → LCC, DDC only
```

ISBNdb sits at tier 3 — after the two best free sources but before Google Books. It has broader coverage than Google Books and more reliable metadata, so it should be tried first.

Wikidata sits at tier 5 — specifically as an LCC gap-filler before OCLC Classify. Wikidata often has LCC when library catalogs don't, because it aggregates from multiple national libraries worldwide.

## Environment variable

```
ISBNDB_API_KEY=your-key-here
```

If `ISBNDB_API_KEY` is not set, skip tier 3 silently. Log a one-time console warning: "ISBNDB_API_KEY not set — tier 3 (ISBNdb) disabled."

Wikidata requires no key.

---

## Tier 3: ISBNdb

### API details

- **Base URL:** `https://api2.isbndb.com`
- **Auth:** API key in the `Authorization` header (not query param)
- **Headers for every request:**
  ```
  Authorization: YOUR_REST_KEY
  Content-Type: application/json
  ```

### Endpoints to use

**Search by title + author:**
```
GET https://api2.isbndb.com/books/{query}
```
Where `{query}` is a URL-encoded search string like `cultish amanda montell`.

Response includes an array of `books`, each with:
- `isbn13`, `isbn`
- `title`, `title_long`
- `authors` (array of strings)
- `publisher`
- `date_published`
- `pages`
- `binding`
- `synopsis`
- `subjects` (array of strings, when available)
- `dewey_decimal` (when available)
- `language`
- `image` (cover URL)

**Direct ISBN lookup (when we already have an ISBN from a previous tier):**
```
GET https://api2.isbndb.com/book/{isbn13}
```
Returns a single `book` object with the same fields. Use this to enrich an existing record that has ISBN but is missing other fields.

### Integration logic

In `lookupBook()`, after the LoC SRU tier:

1. Check if we still need data. Fire ISBNdb if ANY of the following are still missing:
   - ISBN
   - Publisher
   - Publication year
   - Author (or author is malformed/incomplete)

2. If we have an ISBN from a previous tier, use the direct `/book/{isbn13}` endpoint — it's more precise than search.

3. If we don't have an ISBN, search by `{title} {author_last_name}`. Take the first result where the title is a close match (normalized Levenshtein > 70%).

4. From the ISBNdb result, fill in any fields that are still empty:
   - `isbn` → use `isbn13` preferentially, fall back to `isbn`
   - `publisher` → only if still empty
   - `publicationYear` → parse from `date_published` (format varies: "2021", "2021-03", "March 2021", etc.)
   - `author` → only if still empty or malformed. ISBNdb's `authors` array is usually clean.
   - `ddc` → from `dewey_decimal` if present
   - `subjects` → append to existing subjects, deduplicate

5. Do NOT overwrite fields that already have values from higher-priority tiers. ISBNdb fills gaps, it doesn't replace.

6. Set `tier: 'isbndb'` on any fields that came from this source.

### Rate limiting

ISBNdb basic plan allows 1 request per second. Add a 1-second delay between consecutive ISBNdb calls. Use a simple queue or `await sleep(1000)` between calls in the pipeline loop.

### Error handling

- 404: book not in database. Skip, continue to next tier.
- 429: rate limited. Wait 2 seconds, retry once. If still 429, skip.
- 401/403: bad or expired key. Log error clearly: "ISBNDB_API_KEY is invalid or subscription has expired."

### BookCard badge

When metadata comes from ISBNdb, show a small "ISBNdb" badge in the card footer, colored dark blue (#1E3A5F).

---

## Tier 5: Wikidata

### API details

- **Endpoint:** `https://www.wikidata.org/w/api.php`
- **Auth:** None. Free, no key, no rate limit concerns at this volume.
- **Query method:** Use the `wbsearchentities` action to find the book entity, then `wbgetentities` to retrieve its properties.

### Two-step query

**Step 1: Find the book entity**
```
GET https://www.wikidata.org/w/api.php?action=wbsearchentities&search={title}&language=en&type=item&format=json&limit=5
```

This returns candidate entities. Each has an `id` (like `Q234567`), `label`, and `description`.

Filter candidates: the `description` should contain words like "book", "novel", "work by", "written by", or the author's name. This filters out disambiguation pages, people, places, etc.

**Step 2: Get properties from the best match**
```
GET https://www.wikidata.org/w/api.php?action=wbgetentities&ids={entity_id}&props=claims&format=json
```

Extract these Wikidata properties:
- `P1036` → Library of Congress Classification (LCC)
- `P3106` → also LCC (alternate property)
- `P1085` → BookBrainz work ID
- `P212` → ISBN-13
- `P957` → ISBN-10
- `P50` → author (linked entity — resolve to get name)
- `P123` → publisher (linked entity)
- `P577` → publication date
- `P1104` → number of pages
- `P971` → DDC category
- `P136` → genre (linked entity)
- `P921` → main subject (linked entity)

For linked entities (author, publisher, genre, subject), the value is another Wikidata ID. To get the human-readable name, you'd need another `wbgetentities` call. For efficiency, only resolve author and publisher names if those fields are still empty from all previous tiers.

### Alternative: SPARQL query (more efficient, one call)

Instead of the two-step approach above, use the SPARQL endpoint for a single query that gets everything:

```
GET https://query.wikidata.org/sparql?format=json&query={SPARQL}
```

SPARQL query:
```sparql
SELECT ?item ?itemLabel ?isbn13 ?lcc ?ddc ?authorLabel ?publisherLabel ?pubdate WHERE {
  ?item wdt:P31 wd:Q7725634.
  ?item rdfs:label ?itemLabel. FILTER(LANG(?itemLabel) = "en").
  ?item rdfs:label ?searchLabel. FILTER(CONTAINS(LCASE(?searchLabel), "{lowercase_title}")).
  OPTIONAL { ?item wdt:P212 ?isbn13. }
  OPTIONAL { ?item wdt:P1036 ?lcc. }
  OPTIONAL { ?item wdt:P971 ?ddc. }
  OPTIONAL { ?item wdt:P50 ?author. ?author rdfs:label ?authorLabel. FILTER(LANG(?authorLabel) = "en"). }
  OPTIONAL { ?item wdt:P123 ?publisher. ?publisher rdfs:label ?publisherLabel. FILTER(LANG(?publisherLabel) = "en"). }
  OPTIONAL { ?item wdt:P577 ?pubdate. }
}
LIMIT 5
```

Replace `{lowercase_title}` with the URL-encoded lowercase book title.

The SPARQL approach is preferred — it's one HTTP call instead of three, and returns everything we need in a flat table.

### Integration logic

In `lookupBook()`, after Google Books and before OCLC Classify:

1. Only fire Wikidata if LCC is still missing. That's the primary reason this tier exists.

2. Query using the SPARQL approach with the book title.

3. From results, match against our known title + author. Pick the result where `itemLabel` best matches our title and `authorLabel` best matches our author.

4. Fill in any fields still empty:
   - `lcc` → from the `lcc` result (this is the main prize)
   - `ddc` → from the `ddc` result
   - `isbn` → only if still empty
   - `publisher` → only if still empty
   - `publicationYear` → parse from `pubdate`

5. Do NOT overwrite existing values from higher-priority tiers.

6. Set `lccSource: 'wikidata'` if LCC came from this tier.

### Error handling

- SPARQL endpoint occasionally times out on complex queries. Set a 10-second timeout. If it times out, skip and continue to OCLC Classify.
- If the query returns no results, skip silently.
- Wikidata coverage is inconsistent — many books aren't in Wikidata at all. This is expected. That's why it's tier 5, not tier 2.

### BookCard badge

When LCC comes from Wikidata, show "from Wikidata" badge next to the LCC field. Use a neutral gray — same treatment as "from OCLC".

Badge hierarchy for LCC provenance remains:
"from spine" > "from LoC" > "from Wikidata" > "from OCLC" > "from OL" (no badge)

---

## Files to change

- `lib/book-lookup.ts` — add `lookupIsbndb(title, author, isbn?)` and `lookupWikidata(title, author)` functions. Integrate both into the `lookupBook()` cascade at the specified positions.
- `lib/types.ts` — add `'isbndb'` and `'wikidata'` to the source/tier union types
- `components/BookCard.tsx` — add ISBNdb badge (dark blue) and Wikidata badge (gray) to the card footer
- `lib/pipeline.ts` — add 1-second delay between consecutive ISBNdb calls to respect rate limit

## Files NOT to change

- Pass A and Pass B (spine detection and OCR) — untouched
- Tag inference — untouched
- UI layout, brand, colors — untouched
- OCLC Classify — keep it, it's still the last-resort LCC fallback

## Test

1. Find a book that currently has no ISBN after the existing 4-tier chain. Add the ISBNdb key. Reprocess. Confirm ISBNdb fills in the ISBN. Check the "ISBNdb" badge appears.

2. Find a book that currently has no LCC after all existing tiers. Reprocess. Check if Wikidata fills it in. If yes, confirm the "from Wikidata" badge appears.

3. Process the profanity shelf photo (Cultish, F You Very Much, Holy Sh*t, etc.). These are recent, popular nonfiction titles that should all be in ISBNdb. Confirm every book gets an ISBN and publisher.

4. Remove the ISBNdb key from env. Confirm the app still works — tier 3 is skipped silently, console shows the warning, all other tiers function normally.

5. Check the dev console: confirm ISBNdb calls are spaced at least 1 second apart.

6. Confirm no existing fields are overwritten by lower-priority tiers. If Open Library already provided an ISBN, ISBNdb should not replace it.
