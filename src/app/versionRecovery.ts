export const STALE_CHUNK_RELOAD_KEY = 'galactic-empires-stale-chunk-reload';
export const STALE_CHUNK_RELOAD_WINDOW_MS = 15000;

type ReloadStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function recoverFromStaleChunk(
  event: Event,
  reload = () => window.location.reload(),
  storage: ReloadStorage = window.sessionStorage,
  now = Date.now(),
) {
  event.preventDefault();
  const previousReload = Number(storage.getItem(STALE_CHUNK_RELOAD_KEY) ?? 0);
  if (previousReload > 0 && now - previousReload < STALE_CHUNK_RELOAD_WINDOW_MS) return false;
  storage.setItem(STALE_CHUNK_RELOAD_KEY, String(now));
  reload();
  return true;
}

export function installVersionRecovery() {
  window.addEventListener('vite:preloadError', recoverFromStaleChunk);
}
