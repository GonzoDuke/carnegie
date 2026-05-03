# Carnegie — data-extraction audit

**Date:** 2026-05-03
**Scope:** Every meaningful field returned by every lookup tier vs. what Carnegie's code actually consumes today.
**Method:** Read against the working tree at v4.0 (`main` post-merge of `next-16-upgrade`). Code references inline.

This audit is the gate on the five-strategy enhancement plan in [`lcc-and-tag-strategies.md`](../lcc-and-tag-strategies.md). The Phase-5 enrichment series in 2026-05-03 was supposed to close the "70% of API data thrown away" gap; this verifies whether it did, and surfaces every field still being silently dropped.

## Legend

- **Carnegie destination** — the field on `BookLookupResult` (`lib/types.ts:23–62`) or `BookRecord` (`lib/types.ts:64–171`) that the value lands in. `(dropped)` means the code reads the JSON but never assigns the field anywhere. `(not requested)` means the field exists in the API surface area but Carnegie's `fields=` parameter or response handler never asks for it / doesn't shape-check it.
- **Used by tag prompt** — whether the value reaches `/api/infer-tags` (`app/api/infer-tags/route.ts:131–148`). The prompt accepts `title, author, isbn, publisher, publicationYear, lcc, subjectHeadings, existingGenreTags, ddc, lcshSubjects, synopsis, corrections`. Anything not in that list is `no` even if it's persisted on the BookRecord.

---

## 1. Open Library `/search.json` (Phase-1 candidate discovery)

- **Implementation:** `fetchOpenLibraryCandidates` (`lib/book-lookup.ts:1260–1289`) and `tryOpenLibrary` (`lib/book-lookup.ts:677–762`). Used during the main `lookupBook` flow and `lookupSpecificEdition` (year-scoped variant).
- **Fields requested:** `OL_FIELDS = "key,title,subtitle,author_name,isbn,publisher,first_publish_year,publish_year,publish_date,lcc,lc_classifications,subject,number_of_pages_median"` (`lib/book-lookup.ts:668–669`).

| Field | Type | Carnegie destination | Used by tag prompt? |
|---|---|---|---|
| `key` | string (`/works/OL…W`) | Used internally to fetch work record (`fetchWorkRecord`) — not persisted | no |
| `title` | string | `result.canonicalTitle` (`book-lookup.ts:1491`); also Levenshtein-compared in `pipeline.ts` for the shorter-title rule | yes (final BookRecord title flows to `body.title`) |
| `subtitle` | string | `result.subtitle` (`book-lookup.ts:1492`) | no — surfaced in Review only |
| `author_name` | string[] | `result.canonicalAuthor` (first), `result.allAuthors` (full list) | partial — `body.author` gets the chosen one; siblings dropped from prompt |
| `isbn` | string[] | `result.isbn` via `pickIsbn` (KDP-aware preference) | yes |
| `publisher` | string[] | `result.publisher` (first only) | yes |
| `first_publish_year` | number | `result.publicationYear` | yes |
| `publish_year` | number[] | Used as fallback for `publicationYear` | yes (via `publicationYear`) |
| `publish_date` | string[] | Parsed via `parsePublishDateYear` for year fallback | indirect |
| `lcc` | string[] | `result.lcc` (first only, via `normalizeLcc`) | yes |
| `lc_classifications` | string[] | Same — fallback path for `result.lcc` | yes |
| `subject` | string[] | `result.subjects.slice(0, 10)` | yes (via `subjectHeadings`) |
| `number_of_pages_median` | number | `result.pageCount` | no — Review UI only |
| `edition_count` | number | **(not requested)** | n/a |
| `cover_i` | number | **(not requested)** — Carnegie uses the `/b/isbn/{isbn}-M.jpg` deterministic URL instead | n/a |
| `cover_edition_key` | string | **(not requested)** | n/a |
| `language` | string[] (e.g., `eng`) | **(not requested)** | n/a — but `BookRecord.language` exists |
| `ia` (Internet Archive id) | string[] | **(not requested)** | n/a |
| `ebook_access` | string | **(not requested)** | n/a |
| `has_fulltext` | boolean | **(not requested)** | n/a |
| `ratings_average` / `ratings_count` | number | **(not requested)** | n/a |
| `oclc` | string[] | **(not requested)** — OCLC numbers would feed an LT cross-reference if added | n/a |
| `lccn` | string[] | **(not requested)** — could feed direct LoC LCCN lookups | n/a |
| `id_goodreads` / `id_amazon` / `id_librarything` | string[] | **(not requested)** — `id_librarything` is exactly what step 4's LT tier wants for fallback | n/a |
| `time` (year ranges of publish dates) | number[] | **(not requested)** | n/a |

**Notable drops:** `id_librarything` and `id_amazon`/`id_goodreads` are present in OL search responses for many books and would let later enrichment skip needing a fresh ISBN lookup — relevant to step 4. `language` is requested neither here nor on the candidate query but is mapped on `BookRecord`. `cover_i` is the one identifier missing from the cover-fallback chain (`book-lookup.ts:1788–1806`); the chain currently uses ISBN-keyed URL only, which fails when no ISBN was ever filled.

---

## 2. Open Library `/works/{key}.json` (work-record fallback)

- **Implementation:** `fetchWork` / `fetchWorkRecord` (`lib/book-lookup.ts:333–360`). Called from `tryOpenLibrary` (work-level fallback for LCC + synopsis) and from `enrichFromIsbn` (work-level fallback when search-level LCC empty). Always called when the OL candidate has a `key` — the `if (!lcc || true)` guard at `book-lookup.ts:722` means the fetch fires unconditionally.

| Field | Type | Carnegie destination | Used by tag prompt? |
|---|---|---|---|
| `lcc` | string[] | `result.lcc` (LCC fallback only) | yes |
| `lc_classifications` | string[] | Same — fallback for `result.lcc` | yes |
| `subjects` | string[] | **(dropped — read in `OpenLibraryWork` but never assigned anywhere)** | no |
| `description` | string \| `{value: string}` | `result.synopsis` | yes (when present) |
| `first_publish_date` | string | **(not used)** — `OpenLibraryWorkFull` shape declares it but no code reads it | n/a |
| `subject_places` | string[] | **(not requested)** | n/a |
| `subject_people` | string[] | **(not requested)** | n/a |
| `subject_times` | string[] | **(not requested)** — eras/centuries; tag-relevant for history | n/a |
| `excerpts` | array of `{excerpt, comment}` | **(not requested)** | n/a |
| `links` | array of `{title, url}` | **(not requested)** | n/a |
| `covers` | number[] | **(not requested)** | n/a |
| `latest_revision` / `revision` / `created` / `last_modified` | metadata | **(not requested)** | n/a |

**Notable drops:** Work-level `subjects` is fetched and typed but never written to `result.subjects` — the search-level subjects are the only OL subject signal making it to the tag prompt. `subject_places`, `subject_people`, `subject_times` are present on many work records and would feed history/biography tagging; not requested.

---

## 3. Open Library `/isbn/{isbn}.json` (edition by ISBN)

- **Implementation:** Used **only** by `app/api/preview-isbn/route.ts:67–112` for the barcode-scanner confirm-card preview. The main lookup chain does **not** hit this endpoint — it uses `/search.json?isbn=` via `enrichFromIsbn` (`book-lookup.ts:431–475`) instead.
- **Fields read by preview:** `title`, `authors[].key` (resolves first author via a second `/authors/{key}.json` call), constructs cover URL deterministically.

| Field | Type | Carnegie destination | Used by tag prompt? |
|---|---|---|---|
| `title` | string | Returned as `preview.title` to the BarcodeScanner; threaded into the BookRecord via the recently-shipped `previewResult` seed (commit `667fc68`) | indirect — same path as any title |
| `authors` | `[{key: "/authors/OL…A"}]` | First author resolved to a name; passed back as `preview.author` | indirect |
| `subjects` | string[] | **(not read by preview)** — same fields available via `/search.json?isbn=` which `enrichFromIsbn` calls | n/a |
| `subject_places` / `subject_people` / `subject_times` | string[] | **(not read)** | n/a |
| `publishers` | string[] | **(not read by preview)** | n/a |
| `publish_date` | string | **(not read by preview)** | n/a |
| `number_of_pages` | number | **(not read by preview)** | n/a |
| `physical_format` | string (e.g., `Paperback`) | **(not read)** | n/a |
| `physical_dimensions` / `weight` | string | **(not read)** | n/a |
| `isbn_10` / `isbn_13` | string[] | **(not read)** | n/a |
| `lccn` | string[] | **(not read)** | n/a |
| `oclc_numbers` | string[] | **(not read)** | n/a |
| `dewey_decimal_class` | string[] | **(not read)** — could be a DDC fallback on top of ISBNdb | n/a |
| `lc_classifications` | string[] | **(not read)** — could be an LCC fallback | n/a |
| `series` | string[] | **(not read)** | n/a |
| `contributions` | string[] | **(not read)** — translators / editors | n/a |
| `works` | `[{key: "/works/…"}]` | **(not read)** | n/a |
| `covers` | number[] | **(not read)** | n/a |

**Notable drops:** This endpoint is the single richest OL response for a known ISBN — it returns LCC, DDC, LCSH-style subjects, and full publisher/edition detail. Currently used only as a lightweight "title + author + cover" fetch for the barcode preview card. The main pipeline's `enrichFromIsbn` uses the search-level surface instead, which is leaner. `enrichFromIsbn` could be replaced or supplemented by `/isbn/{isbn}.json` to recover edition-level LCC/DDC/series/lccn that `/search.json?isbn=` doesn't reliably surface.

---

## 4. ISBNdb `/book/{isbn}` (direct) and `/books/{q}` (search)

- **Implementation:** `lookupIsbndb` (`lib/book-lookup.ts:894–986`), `isbndbBookToHit` (`857–882`), `isbndbToCandidate` (`1231–1249`). Direct path via `/book/{isbn}` is used in `lookupSpecificEdition` and as a Phase-1 candidate when an ISBN exists; search path via `/books/{q}` is the Phase-1 candidate-discovery query when no ISBN is known yet.

| Field | Type | Carnegie destination | Used by tag prompt? |
|---|---|---|---|
| `isbn` | string (ISBN-10) | `result.isbn` (preferring isbn13) | yes |
| `isbn13` | string | `result.isbn` (preferred over `isbn`) | yes |
| `title` | string | `result.canonicalTitle` (or `IsbndbHit.title`) | indirect |
| `title_long` | string (subtitle-included) | Preferred over `title` for canonical | indirect |
| `authors` | string[] | `result.canonicalAuthor` (first), `result.allAuthors` (full) | partial — only first reaches `body.author` |
| `publisher` | string | `result.publisher` | yes |
| `date_published` | string (e.g., `"2012-09-18"` or `"2012"`) | `result.publicationYear` (parsed via `parseIsbndbYear`) | yes |
| `pages` | number | `result.pageCount` | no — Review UI only |
| `binding` | string (e.g., `"Paperback"`) | `result.binding` | no — Review UI only |
| `subjects` | string[] | `result.subjects.slice(0, 10)` | yes (via `subjectHeadings`) |
| `dewey_decimal` | string \| string[] | `result.ddc` | yes |
| `language` | string | `result.language` | no — Review UI only |
| `image` | string (cover URL) | `result.coverUrlFallbacks` | no — UI |
| `edition` | string (e.g., `"1st"`, `"Reprint"`) | `result.edition` | no — Review UI only, **not in tag prompt** |
| `synopsis` | string | `result.synopsis` | yes (first 300 chars) |
| `dimensions` | string | **(not requested in `IsbndbBook` interface; ignored)** | n/a |
| `dimensions_structured` | object | **(not requested)** | n/a |
| `weight` | string | **(not requested)** | n/a |
| `msrp` | number | **(not requested)** | n/a |
| `excerpt` | string | **(not requested)** | n/a |
| `related.type` | string (e.g., `"Box Set"`) | **(not requested)** | n/a |
| `other_isbns` | string[] | **(not requested)** — would feed cross-edition cover fallback | n/a |
| `reviews` | string[] | **(not requested)** | n/a |

**Notable drops:** `edition` IS being captured into `BookRecord.edition` but is NOT passed to the tag-inference prompt — the Phase-5 enrichment series surfaces it in the UI but the prompt-side delivery never landed. Same shape for `binding`, `language`, `pageCount`. `other_isbns` would let the cover chain try sibling editions when the primary cover 404s; not requested.

ISBNdb v2's API also returns `excerpt` for many trade books. Not currently requested, would be a valid `synopsis` fallback when ISBNdb's `synopsis` is empty.

---

## 5. Library of Congress SRU MARC by ISBN

- **Implementation:** `lookupFullMarcByIsbn` (`lib/lookup-utils.ts:209–305`). Phase-2 ISBN-direct enrichment.
- **MARC fields parsed:** 050 (LCC), 082 (DDC), 100 (main author), 245 (title statement), 250 (edition), 260/264 (publisher), 300 (physical desc → page count), 600/610/611/630/650/651 (LCSH subject headings), 700/710 (added entries / co-authors).

| MARC field | Subfields read | Type | Carnegie destination | Used by tag prompt? |
|---|---|---|---|---|
| 010 (LCCN) | — | (not parsed) | (dropped) — would be the canonical LoC identifier | no |
| 020 (ISBN) | — | (not parsed; we already have ISBN) | n/a | n/a |
| 050 (LCC) | $a + $b | string (canonical) | `result.lcc` (highest priority gap-fill) | yes |
| 082 (DDC) | $a only | string | `result.ddc` | yes |
| 100 (main personal author) | $a only | string | `result.canonicalAuthor` | partial — flows into `body.author` |
| 110 (corporate author) | — | (not parsed) | (dropped) | no |
| 240 (uniform title) | — | (not parsed) | (dropped) — disambiguates translations / abridgments | no |
| 245 (title) | $a + $b | string | `result.canonicalTitle` | indirect (via final `body.title`) |
| 250 (edition statement) | $a only | string | `result.edition` | no — Review UI only |
| 260/264 (publisher) | $b only | string | `result.publisher` | yes |
| 300 (physical description) | $a (regex `/(\d{2,4})\s*p\.?/`) | number | `result.pageCount` | no |
| 490/830 (series statements) | — | (not parsed) | (dropped) — `BookRecord.series` could be filled here | no |
| 500 (general note) | — | (not parsed) | (dropped) | no |
| 504 (bibliography note) | — | (not parsed) | (dropped) — useful "scholarly text" signal | no |
| 505 (contents note / table of contents) | — | (not parsed) | (dropped) — anthology contents, multi-volume parts | no |
| 520 (summary / abstract) | — | (not parsed) | (dropped) — would be a third synopsis source | no |
| 600/610/611/630/650/651 (LCSH subjects) | all subfields, joined with " — " | string[] | `result.lcshSubjects.slice(0, 25)` | yes |
| 655 (genre / form term) | — | (not parsed) | (dropped) — explicit form vocabulary (e.g., `"Detective and mystery fiction"`, `"Festschriften"`) | no |
| 700/710 (added entries / co-authors) | $a only | string[] | `result.allAuthors` (merged with main) | partial (first only) |
| 730 (uniform title added entry) | — | (not parsed) | (dropped) | no |
| 856 (electronic location URL) | — | (not parsed) | (dropped) | no |

**Notable drops:** **MARC 655 (genre/form term)** is the most valuable missing extraction — it's an explicit cataloger-applied genre tag (e.g., `"Science fiction"`, `"Bildungsromans"`, `"Festschriften"`, `"Cookbooks"`) and goes directly to the tag-inference quality lift the project keeps trying to hit. **MARC 520 (summary)** is a third synopsis source that's often present when ISBNdb's and OL's are empty. **MARC 504/505** would help anthology/scholarly tagging. **MARC 010 (LCCN)** would let later enrichment query LoC by LCCN instead of ISBN (more authoritative).

The page-count regex `(\d{2,4})\s*p\.?/` only matches values like `"384 p."` — misses `"vii, 384 pages"` (no `.`) on some records.

---

## 6. LoC SRU title+author search

- **Implementation:** `lookupLccByTitleAuthor` (`lib/lookup-utils.ts:312–321`) → `loFetch050` (`115–135`).
- **Crucial limitation:** This function returns ONLY MARC field 050 (LCC). It does NOT call `lookupFullMarcByIsbn`, so all of MARC's other fields (LCSH subjects, DDC, edition, page count, co-authors, summary) are ignored on the title+author path.

| Returned data | Type | Carnegie destination | Used by tag prompt? |
|---|---|---|---|
| MARC 050 ($a + $b) | string (canonical LCC) | `result.lcc` (last-resort fallback) | yes |
| **All other MARC fields** | — | **(dropped — not even fetched at the parser level)** | no |

**Notable drop:** When LoC has a record for a book with no ISBN match (rare but it happens — historical books, photocopy editions), Carnegie pulls just the LCC and throws away LCSH, DDC, page count, and 50+ other MARC fields. Calling `lookupFullMarcByIsbn`-style parsing on the title+author response would be a one-line refactor and recover everything.

---

## 7. Google Books `/volumes` search (title+author)

- **Implementation:** Inline `gb-fallback` block at `lib/book-lookup.ts:1641–1746`. Fires only when Phase-1 produced no winner.
- **Query:** `q=intitle:{title}+inauthor:{author}&maxResults=3`. Uses keyed endpoint when `GOOGLE_BOOKS_API_KEY` is present, retries unauth on 4xx/5xx.

| `volumeInfo` field | Type | Carnegie destination | Used by tag prompt? |
|---|---|---|---|
| `title` | string | `result.canonicalTitle` | indirect |
| `subtitle` | string | **(not requested in shape; dropped)** | no |
| `authors` | string[] | `result.canonicalAuthor` (first), `result.allAuthors` (full) | partial |
| `publisher` | string | `result.publisher` | yes |
| `publishedDate` | string (`"YYYY"` or `"YYYY-MM-DD"`) | `result.publicationYear` (4-digit slice) | yes |
| `industryIdentifiers` | `[{type, identifier}]` | `result.isbn` (prefers ISBN-13 non-979-8) | yes |
| `categories` | string[] | `result.subjects` (sets entire array, replacing any prior) | yes |
| `imageLinks.thumbnail` | string | `gbCoverUrl` → `result.coverUrlFallbacks` | no |
| `imageLinks.smallThumbnail` | string | Fallback for `gbCoverUrl` | no |
| `description` | string | **(not in shape; dropped)** — would be a third synopsis source | no |
| `pageCount` | number | **(not in shape; dropped)** — `BookRecord.pageCount` exists | no |
| `printType` (`BOOK`/`MAGAZINE`) | string | **(not in shape; dropped)** | no |
| `language` | string (`en`, `fr`) | **(not in shape; dropped)** | no |
| `mainCategory` | string | **(not in shape; dropped)** — top-level BISAC-ish category | no |
| `previewLink` / `infoLink` / `canonicalVolumeLink` | string | **(not requested)** | n/a |
| `averageRating` / `ratingsCount` | number | **(not requested)** | n/a |
| `maturityRating` | string | **(not requested)** | n/a |
| `dimensions` | object | **(not requested)** | n/a |

**Notable drops:** `description` (synopsis), `pageCount`, `language`, `subtitle`, `mainCategory` are all in the response and would map to existing `BookRecord` fields. The `gb-fallback` block is the only place GB title-search runs and it never asks the response for these — they're simply not in the inline TypeScript interface.

---

## 8. Google Books `/volumes` by ISBN (Phase-2 enrichment)

- **Implementation:** `gbEnrichByIsbn` (`lib/book-lookup.ts:375–419`). Fires in parallel with MARC + Wikidata + OL during Phase 2.

| `volumeInfo` field | Type | Carnegie destination | Used by tag prompt? |
|---|---|---|---|
| `publisher` | string | `result.publisher` (gap-fill) | yes |
| `publishedDate` | string | `result.publicationYear` | yes |
| `categories` | string[] | Merged into `result.subjects` (deduped, capped 15) | yes |
| `imageLinks.thumbnail` / `smallThumbnail` | string | `gbCoverUrl` → `result.coverUrlFallbacks` | no |
| `title` | string | **(not in shape; dropped)** | n/a (already have title) |
| `subtitle` | string | **(not in shape; dropped)** | no |
| `authors` | string[] | **(not in shape; dropped)** — could backfill `allAuthors` | no |
| `description` | string | **(not in shape; dropped)** | no |
| `pageCount` | number | **(not in shape; dropped)** — easy `pageCount` fallback when MARC misses | no |
| `mainCategory` | string | **(not in shape; dropped)** | no |
| `language` | string | **(not in shape; dropped)** | no |
| `industryIdentifiers` | array | **(not in shape; dropped)** — could find `isbn10`/`isbn13` siblings | n/a |

**Notable drops:** Same general pattern as tier 7 but the by-ISBN response is more complete on average, so the drop hurts more. `description` (synopsis), `pageCount`, `subtitle` are immediate gap-fills for the most-asked-after BookRecord fields.

---

## 9. Wikidata SPARQL by ISBN (Phase-2)

- **Implementation:** `lookupWikidataByIsbn` (`lib/book-lookup.ts:1147–1217`). SPARQL query at `1157–1170`. Direct match via P212 (ISBN-13).
- **Properties requested:** P212, P1036, P971, P50, P123, P577, P136, P921, P1104, P179.

| Wikidata property / variable | Type | Carnegie destination | Used by tag prompt? |
|---|---|---|---|
| `?isbn13` (P212) | string | `hit.isbn` (already known; sanity-check) | n/a |
| `?lcc` (P1036) | string | `result.lcc` (gap-fill) | yes |
| `?ddc` (P971) | string | `result.ddc` (gap-fill) | yes |
| `?authorLabel` (P50 → label) | string | **(not used)** — `WikidataHit.authorLabel` parsed but never assigned downstream | no |
| `?publisherLabel` (P123 → label) | string | `result.publisher` (gap-fill) | yes |
| `?pubdate` (P577) | string (`"YYYY-MM-DD"`) | `result.publicationYear` (year slice, gap-fill) | yes |
| `?genreLabel` (P136 → label) | string | Pushed into `result.subjects` array | yes (via `subjectHeadings`) |
| `?subjectLabel` (P921 → label) | string | Pushed into `result.subjects` array | yes |
| `?pages` (P1104) | number | `result.pageCount` (gap-fill) | no — UI only |
| `?seriesLabel` (P179 → label) | string | `result.series` (gap-fill) | no — UI only |
| P98 (editor) | string | **(not requested)** | n/a |
| P655 (translator) | string | **(not requested)** | n/a |
| P407 (language of work) | string | **(not requested)** — would feed `BookRecord.language` | n/a |
| P953 (full work URL) | string | **(not requested)** | n/a |
| P364 (original language) | string | **(not requested)** | n/a |
| P437 (distribution format) | string | **(not requested)** | n/a |
| P655 (translator) | string | **(not requested)** | n/a |
| P527 (has part) | string[] | **(not requested)** — anthology contents | n/a |
| P361 (part of) | string | **(not requested)** — series-of-series | n/a |
| P655 (translator) | string | **(not requested)** | n/a |
| P5331 (OCLC work) | string | **(not requested)** — cross-reference | n/a |
| P1085 (LibraryThing work id) | string | **(not requested)** — directly relevant to step 4 | n/a |
| P2969 (Goodreads work id) | string | **(not requested)** | n/a |
| LIMIT 5 — the SPARQL takes only the first binding | — | — | — |

**Notable drops:** `?authorLabel` IS extracted (`WikidataHit.authorLabel`) but never assigned to `result.canonicalAuthor`. The first-binding-wins rule on a P212 exact match is correct (P212 is unique), but extra bindings could confirm/disambiguate when the same ISBN appears on multiple work entities (rare but possible with re-issues). **P1085 (LibraryThing work id)** is exactly what step 4 wants for LT lookups when ISBN isn't enough — currently not requested.

---

## 10. Wikidata SPARQL title-search

- **Implementation:** `lookupWikidata` (`lib/book-lookup.ts:1059–1138`). SPARQL at `buildWikidataSparql` (`1006–1036`). Fires only as a last-resort gap-filler when no ISBN was ever discovered AND no LCC was found by LoC title+author search.
- **Type filter:** `wd:Q571 wd:Q7725634 wd:Q47461344` (book / literary work / written work).
- **Match strategy:** `CONTAINS(LCASE(?label), …)` — returns up to 5 bindings, scored by LCC-presence + author-substring match.

| Wikidata property / variable | Type | Carnegie destination | Used by tag prompt? |
|---|---|---|---|
| `?itemLabel` | string | Used for title-match scoring; not persisted | indirect |
| `?isbn13` (P212) | string | `result.isbn` (gap-fill) | yes |
| `?lcc` (P1036) | string | `result.lcc` (gap-fill) | yes |
| `?ddc` (P971) | string | `result.ddc` (gap-fill) | yes |
| `?authorLabel` (P50 → label) | string | Used in scoring; **not persisted** to `canonicalAuthor` | no |
| `?publisherLabel` (P123 → label) | string | `result.publisher` | yes |
| `?pubdate` (P577) | string | `result.publicationYear` | yes |
| `?genreLabel` (P136 → label) | string | **`hit.genre` returned but the title-search merge block (`book-lookup.ts:1766–1780`) does NOT push it into `result.subjects`** — by-ISBN path does, title-path drops it | **silently dropped** |
| `?subjectLabel` (P921 → label) | string | Same as above — by-ISBN merges to subjects, title-search merge **drops** | **silently dropped** |
| `?pages` (P1104) | number | `result.pageCount` (gap-fill) | no |
| `?seriesLabel` (P179 → label) | string | `result.series` (gap-fill) | no |
| LIMIT 5 — pre-scored, top binding wins | — | — | — |

**Notable drop:** **The title-search path silently discards `genre` and `subject` even when the SPARQL returns them.** The by-ISBN path at `book-lookup.ts:1610–1620` correctly merges these into `result.subjects`; the title-search merge at `1766–1780` only handles `lcc/ddc/isbn/publisher/pageCount/series/publicationYear`. This is a real bug — the title-search path is the last fallback before model-guess, and exactly when it kicks in (no ISBN + no LCC) is when those P136/P921 signals matter most for tag inference.

---

## 11. Tag-prompt input completeness

What `/api/infer-tags` actually receives, end-to-end, from `inferTagsClient` (`lib/pipeline.ts:231–245`):

| Argument | Sourced from | Persisted to BookRecord? |
|---|---|---|
| `title` | `read.title` (spineRead) or canonical | yes |
| `author` | `read.author` (spineRead) | yes |
| `isbn` | `lookup.isbn` | yes |
| `publisher` | `lookup.publisher` | yes |
| `publicationYear` | `lookup.publicationYear` | yes |
| `lcc` | `lookup.lcc` | yes |
| `subjectHeadings` | `lookup.subjects` (OL + ISBNdb merged + GB merged + Wikidata genre/subject from by-ISBN path only) | yes |
| `existingGenreTags` | `read.existingGenreTags` from prior tagging | yes |
| `ddc` | `lookup.ddc` | yes |
| `lcshSubjects` | `lookup.lcshSubjects` (MARC 600/610/611/630/650/651 only) | yes |
| `synopsis` | `lookup.synopsis` (OL work `description` OR ISBNdb `synopsis` OR — never reaches — GB `description`, MARC 520) | yes |
| `corrections` | last 20 from `corrections-log` | n/a (sent only) |

What is NOT passed to the prompt despite being on the BookRecord (or recoverable):

- `canonicalAuthor` / `allAuthors` — only single `author` lands in the prompt.
- `subtitle` — surfaced in Review UI, but useful for disambiguation in the prompt.
- `edition` — could change a tag (e.g., "first edition" form tag, "annotated" content marker).
- `binding` / `language` / `pageCount` — all on the BookRecord, none in the prompt.
- `series` — on the BookRecord; Penguin Classics / Library of America / Folio Society would be relevant form tags.
- `coverUrlFallbacks` — UI only (correct — not relevant to tags).
- `BISAC categories` — not sourced anywhere (LT in step 4 is the proposed source).
- `LT tags` — not sourced (step 4).
- `MARC 655 genre/form` — silently dropped at the parser.
- `Wikidata genre/subject from title-search path` — silently dropped at the merge.

---

## 12. Summary — what's silently dropped vs. what enrichment claims

The Phase-5 enrichment series (CHANGELOG-V4.0 §"Tag inference enrichment") fixed the BookRecord persistence side: `ddc`, `lcshSubjects`, `synopsis`, `pageCount`, `edition`, `binding`, `language`, `series`, `allAuthors`, `canonicalTitle`, `subtitle`, `coverUrlFallbacks` all exist on the type and most are populated. The Review UI surfaces them.

What it did **not** do:

1. **Tag-prompt delivery for non-LCC/LCSH enrichment fields.** `edition`, `series`, `binding`, `language`, `pageCount`, `subtitle`, `allAuthors` reach the BookRecord but never reach `/api/infer-tags`. Prompt rules 7–8 (form tags) explicitly key off `series` and `edition`, but the prompt is never told what those values are.

2. **Wikidata title-search genre/subject merge.** A bug — by-ISBN path merges them to `result.subjects`, title-search path drops them. The title-search path is precisely when these signals matter most.

3. **MARC parser coverage.** 655 (explicit cataloger genre/form), 520 (summary), 504/505 (bibliography / contents) are all not parsed despite being in the same MARC XML the parser already fetches. 010 (LCCN) is not parsed.

4. **OL work-record `subjects`.** Typed in `OpenLibraryWork` but never assigned to `result.subjects`. Phase-2's `enrichFromIsbn` doesn't extract them either.

5. **Google Books surface area.** Both GB tiers (search + by-ISBN) declare narrow inline interfaces that omit `description`, `pageCount`, `subtitle`, `language`, `mainCategory`, `authors` (on by-ISBN). The fields are in the response — just not in our type definitions, so they vanish.

6. **OL `/isbn/{isbn}.json`.** The richest single OL response per ISBN. Currently only used by the barcode preview route for two fields. Could be a much stronger Phase-2 enrichment than `enrichFromIsbn`'s search-level call.

7. **External-id passthroughs.** OL exposes `id_librarything`, `id_amazon`, `id_goodreads`, `lccn`, `oclc` on `/search.json` (when `fields=` requests them) — none are requested. Wikidata exposes P1085 (LT work id), P5331 (OCLC), P2969 (Goodreads). None are used. These are exactly the cross-reference identifiers step 4 (LibraryThing tier) and any future deduplication work would benefit from.

---

## 13. Implications for the five-strategy plan

| Strategy | Implication |
|---|---|
| 1. Pass-B sticker extraction | Independent of this audit — adds a new tier on the spine-read side. The audit doesn't change what should be extracted; the new fields plumb forward as `extractedIsbn` / `extractedCallNumber` / `extractedSeries`. |
| 2. DDC→LCC class fallback | Audit confirms `result.ddc` IS populated (ISBNdb, MARC 082, Wikidata P971) but is the only DDC source feeding the prompt. The fallback is purely additive — a derived LCC where none was sourced. No silent-drop fix needed first. |
| 3. Author-similarity backfill | Independent — reads from the export ledger, not the lookup tiers. |
| 4. LibraryThing API | High-value because it adds the **only crowd-applied tag source** to the pipeline. Audit-relevant note: OL `/search.json` could expose `id_librarything` (per-edition LT work id) if `fields=` is widened, which would let LT lookups skip needing a fresh ISBN match. Worth widening `OL_FIELDS` as a side-effect of step 4. |
| 5. Two-step tag inference | Audit-relevant note: the prompt is currently NOT receiving `edition`, `series`, `subtitle`, `allAuthors`, `binding`, `language`, `pageCount`. The two-step refactor is the right time to fix the user-message builder so these flow into call 2 (focused tag inference). Otherwise the focused call still operates on the same partial data the single call already does. |

**Recommended pre-step adjustments before the five-strategy plan executes:**

- **Step 5 should also fix the user-message builder** — pass `edition`, `series`, `subtitle`, `allAuthors`, `binding`, `language`, `pageCount` to the focused tag-inference call. Otherwise the architectural split doesn't recover the missed signal that's been on `BookRecord` since the Phase-5 enrichment series.
- **Step 1 (Pass B sticker extraction)** is unaffected by the audit and can land as planned.
- **Bonus low-cost fix worth landing alongside one of the five:** the **Wikidata title-search genre/subject drop** (§10) — a 5-line merge fix that recovers signal silently lost on every lookup that falls through to the title-search path. Could fold into step 5 as part of the prompt-wiring pass.

The bigger MARC parser expansion (655, 520, 504/505), the GB interface widening (description, pageCount, subtitle), and the OL `/isbn/{isbn}.json` swap are all **out-of-scope for the five-strategy plan** but worth a follow-up commit each. None block any of the five.

---

End of audit.
