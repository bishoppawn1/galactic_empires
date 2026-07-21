import { describe, expect, it } from 'vitest';
import {
  canSendStateUpdate,
  MAX_BUFFERED_STATE_MESSAGES,
  MULTIPLAYER_SERIALIZATION,
  STATE_SYNC_INTERVAL_MS,
} from './multiplayer';

describe('multiplayer state transport', () => {
  it('uses PeerJS binary serialization so large snapshots are automatically chunked', () => {
    expect(MULTIPLAYER_SERIALIZATION).toBe('binary');
  });

  it('limits full-state synchronization to four updates per second', () => {
    expect(STATE_SYNC_INTERVAL_MS).toBe(250);
    expect(canSendStateUpdate(1000, 1249)).toBe(false);
    expect(canSendStateUpdate(1000, 1250)).toBe(true);
  });

  it('waits for an overloaded peer channel to drain', () => {
    expect(canSendStateUpdate(1000, 1400, MAX_BUFFERED_STATE_MESSAGES)).toBe(false);
    expect(canSendStateUpdate(1000, 1400, MAX_BUFFERED_STATE_MESSAGES - 1)).toBe(true);
  });
});
