/**
 * Local-only mode — a developer affordance that suppresses every
 * remote-write call (ledger, corrections, vocabulary) while leaving
 * local state, reads, and AI calls fully functional.
 *
 * The flag lives in localStorage so it survives reloads. Each write
 * site reads the flag at call time (not module-load time) so flipping
 * the toggle takes effect for the next operation without any restart.
 *
 * UI components subscribe via `subscribeNoWriteMode` and re-render on
 * change; programmatic flips dispatch the same event so multiple
 * surfaces (sidebar toggle, mobile menu, indicator) stay in sync.
 */

const KEY = 'carnegie:no-write-mode';
const EVENT = 'carnegie:no-write-mode-changed';

export function isNoWriteMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setNoWriteMode(on: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (on) {
      localStorage.setItem(KEY, '1');
    } else {
      localStorage.removeItem(KEY);
    }
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    // ignore quota errors — this is a dev affordance, not load-bearing
  }
}

/**
 * Subscribe to flag changes. Fires both for in-tab updates (via the
 * setNoWriteMode dispatch) and cross-tab updates (via the storage
 * event when localStorage changes in another tab). Returns an
 * unsubscribe function.
 */
export function subscribeNoWriteMode(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onCustom = () => cb();
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  window.addEventListener(EVENT, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * Lightweight uniform log for skipped writes. Each site calls this
 * with the operation name so a dev scanning the console can see what
 * would have been written.
 */
export function logSkippedWrite(opName: string, payload?: unknown): void {
  if (typeof window === 'undefined') return;
  if (payload === undefined) {
    console.info(`[no-write] skipping ${opName}`);
  } else {
    console.info(`[no-write] skipping ${opName}`, payload);
  }
}
