import { describe, expect, it } from 'vitest';
import {
  canSendStateUpdate,
  MAX_BUFFERED_STATE_MESSAGES,
  MULTIPLAYER_SERIALIZATION,
  PEER_OPEN_TIMEOUT_MS,
  prepareIncomingState,
  STATE_SYNC_INTERVAL_MS,
} from './multiplayer';
import { createCompetitiveState } from '../game';

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

  it('bounds signaling startup instead of waiting forever', () => {
    expect(PEER_OPEN_TIMEOUT_MS).toBe(10000);
  });

  it('validates authoritative snapshots before changing perspective', () => {
    const canonical = createCompetitiveState({ mapSize: 'small', difficulty: 'commander' });
    const rival = prepareIncomingState(canonical)!;
    expect(rival.planets.find(planet => planet.id === 'cygnus')?.owner).toBe('player');
    expect(prepareIncomingState({ planets: [] })).toBeUndefined();
    expect(prepareIncomingState(null)).toBeUndefined();
  });
});
