'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from 'react';
import type { BookRecord, PhotoBatch } from './types';

type Action =
  | { type: 'ADD_BATCH'; batch: PhotoBatch }
  | { type: 'UPDATE_BATCH'; id: string; patch: Partial<PhotoBatch> }
  | { type: 'REMOVE_BATCH'; id: string }
  | { type: 'ADD_BOOK'; batchId: string; book: BookRecord }
  | { type: 'UPDATE_BOOK'; id: string; patch: Partial<BookRecord> }
  | { type: 'CLEAR' };

interface State {
  batches: PhotoBatch[];
  allBooks: BookRecord[];
}

const initialState: State = { batches: [], allBooks: [] };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ADD_BATCH':
      return { ...state, batches: [...state.batches, action.batch] };
    case 'UPDATE_BATCH':
      return {
        ...state,
        batches: state.batches.map((b) =>
          b.id === action.id ? { ...b, ...action.patch } : b
        ),
      };
    case 'REMOVE_BATCH': {
      const batch = state.batches.find((b) => b.id === action.id);
      const removedIds = new Set(batch?.books.map((b) => b.id));
      return {
        batches: state.batches.filter((b) => b.id !== action.id),
        allBooks: state.allBooks.filter((b) => !removedIds.has(b.id)),
      };
    }
    case 'ADD_BOOK':
      return {
        ...state,
        batches: state.batches.map((b) =>
          b.id === action.batchId
            ? {
                ...b,
                books: [...b.books, action.book],
                booksIdentified: b.booksIdentified + 1,
              }
            : b
        ),
        allBooks: [...state.allBooks, action.book],
      };
    case 'UPDATE_BOOK':
      return {
        batches: state.batches.map((b) => ({
          ...b,
          books: b.books.map((bk) =>
            bk.id === action.id ? { ...bk, ...action.patch } : bk
          ),
        })),
        allBooks: state.allBooks.map((bk) =>
          bk.id === action.id ? { ...bk, ...action.patch } : bk
        ),
      };
    case 'CLEAR':
      return initialState;
  }
}

interface StoreApi {
  state: State;
  addBatch: (batch: PhotoBatch) => void;
  updateBatch: (id: string, patch: Partial<PhotoBatch>) => void;
  removeBatch: (id: string) => void;
  addBook: (batchId: string, book: BookRecord) => void;
  updateBook: (id: string, patch: Partial<BookRecord>) => void;
  clear: () => void;
}

const StoreCtx = createContext<StoreApi | null>(null);

const STORAGE_KEY = 'skinsbury:state:v1';

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState, (init) => {
    if (typeof window === 'undefined') return init;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return init;
      const parsed = JSON.parse(raw) as State;
      // Strip any in-flight processing state
      const batches = parsed.batches.map((b) =>
        b.status === 'processing' || b.status === 'queued'
          ? { ...b, status: 'done' as const }
          : b
      );
      return { batches, allBooks: parsed.allBooks ?? [] };
    } catch {
      return init;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      // Don't persist thumbnails (large data URIs) — keep payload small
      const slim = {
        batches: state.batches.map((b) => ({ ...b, thumbnail: '' })),
        allBooks: state.allBooks,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
    } catch {
      // ignore quota errors
    }
  }, [state]);

  const api = useMemo<StoreApi>(
    () => ({
      state,
      addBatch: (batch) => dispatch({ type: 'ADD_BATCH', batch }),
      updateBatch: (id, patch) => dispatch({ type: 'UPDATE_BATCH', id, patch }),
      removeBatch: (id) => dispatch({ type: 'REMOVE_BATCH', id }),
      addBook: (batchId, book) => dispatch({ type: 'ADD_BOOK', batchId, book }),
      updateBook: (id, patch) => dispatch({ type: 'UPDATE_BOOK', id, patch }),
      clear: () => dispatch({ type: 'CLEAR' }),
    }),
    [state]
  );

  return <StoreCtx.Provider value={api}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}

export function useDarkMode() {
  const apply = useCallback((on: boolean) => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle('dark', on);
    try {
      localStorage.setItem('skinsbury:dark', on ? '1' : '0');
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('skinsbury:dark');
      if (stored !== null) {
        apply(stored === '1');
        return;
      }
    } catch {
      // ignore
    }
    const prefers = window.matchMedia('(prefers-color-scheme: dark)').matches;
    apply(prefers);
  }, [apply]);

  return { setDark: apply };
}
