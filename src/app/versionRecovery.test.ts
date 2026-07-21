import { describe, expect, it, vi } from 'vitest';
import { STALE_CHUNK_RELOAD_KEY, STALE_CHUNK_RELOAD_WINDOW_MS, recoverFromStaleChunk } from './versionRecovery';

describe('deployed version recovery', () => {
  it('prevents the stale import error and reloads the current deployment once', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
    const reload = vi.fn();
    const event = new Event('vite:preloadError', { cancelable: true });

    expect(recoverFromStaleChunk(event, reload, storage, 1000)).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
    expect(storage.getItem(STALE_CHUNK_RELOAD_KEY)).toBe('1000');

    expect(recoverFromStaleChunk(new Event('vite:preloadError', { cancelable: true }), reload, storage, 1001)).toBe(false);
    expect(reload).toHaveBeenCalledOnce();

    expect(recoverFromStaleChunk(new Event('vite:preloadError', { cancelable: true }), reload, storage, 1000 + STALE_CHUNK_RELOAD_WINDOW_MS)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
