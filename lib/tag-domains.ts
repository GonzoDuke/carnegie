import vocab from './tag-vocabulary.json';

export type DomainKey =
  | 'philosophy'
  | 'religion'
  | 'psychology'
  | 'literature'
  | 'language'
  | 'history'
  | 'media_tech'
  | 'social_political'
  | 'science'
  | 'biography'
  | 'arts_culture'
  | 'books_libraries'
  | '_unclassified';

export const VOCAB = vocab as {
  domains: Record<DomainKey, { label: string; lcc_prefixes: string[]; tags: string[] }>;
  form_tags: {
    content_forms: string[];
    series: string[];
    collectible: string[];
  };
};

const tagToDomain = new Map<string, DomainKey>();
for (const key of Object.keys(VOCAB.domains) as DomainKey[]) {
  for (const tag of VOCAB.domains[key].tags) {
    tagToDomain.set(tag, key);
  }
}

export function domainForTag(tag: string): DomainKey | null {
  if (!tag) return null;
  const cleaned = tag.replace(/^\[Proposed\]\s*/i, '');
  return tagToDomain.get(cleaned) ?? null;
}

export function isProposedTag(tag: string): boolean {
  return /^\[Proposed\]/i.test(tag);
}

export const FORM_CONTENT = new Set(VOCAB.form_tags.content_forms);
export const FORM_SERIES = new Set(VOCAB.form_tags.series);
export const FORM_COLLECTIBLE = new Set(VOCAB.form_tags.collectible);

export type FormCategory = 'content' | 'series' | 'collectible';

export function formCategory(tag: string): FormCategory | null {
  const cleaned = tag.replace(/^\[Proposed\]\s*/i, '');
  if (FORM_CONTENT.has(cleaned)) return 'content';
  if (FORM_SERIES.has(cleaned)) return 'series';
  if (FORM_COLLECTIBLE.has(cleaned)) return 'collectible';
  return null;
}

export const ALL_GENRE_TAGS: { domain: DomainKey; label: string; tag: string }[] = [];
for (const key of Object.keys(VOCAB.domains) as DomainKey[]) {
  for (const tag of VOCAB.domains[key].tags) {
    ALL_GENRE_TAGS.push({ domain: key, label: VOCAB.domains[key].label, tag });
  }
}

export const ALL_FORM_TAGS: string[] = [
  ...VOCAB.form_tags.content_forms,
  ...VOCAB.form_tags.series,
  ...VOCAB.form_tags.collectible,
];
