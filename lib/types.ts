export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface SpineRead {
  position: number;
  rawText: string;
  title?: string;
  author?: string;
  publisher?: string;
  confidence: Confidence;
  note?: string;
}

export interface BookLookupResult {
  isbn: string;
  publisher: string;
  publicationYear: number;
  lcc: string;
  subjects?: string[];
  source: 'openlibrary' | 'googlebooks' | 'none';
}

export interface BookRecord {
  id: string;
  spineRead: SpineRead;
  title: string;
  author: string;
  authorLF: string;
  isbn: string;
  publisher: string;
  publicationYear: number;
  lcc: string;
  genreTags: string[];
  formTags: string[];
  confidence: Confidence;
  reasoning: string;
  status: 'pending' | 'approved' | 'rejected';
  warnings: string[];
  sourcePhoto: string;
}

export interface PhotoBatch {
  id: string;
  filename: string;
  fileSize: number;
  thumbnail: string;
  status: 'queued' | 'processing' | 'done' | 'error';
  error?: string;
  spinesDetected: number;
  booksIdentified: number;
  books: BookRecord[];
}

export interface AppState {
  batches: PhotoBatch[];
  allBooks: BookRecord[];
}

export interface InferTagsResult {
  genreTags: string[];
  formTags: string[];
  confidence: Confidence;
  reasoning: string;
}
