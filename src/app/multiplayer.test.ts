import { describe, expect, it } from 'vitest';
import {
  canSendStateUpdate,
  MAX_PLAYERS,
  MAX_BUFFERED_STATE_MESSAGES,
  MULTIPLAYER_SERIALIZATION,
  PEER_OPEN_TIMEOUT_MS,
  prepareIncomingState,
  prepareOutgoingCommand,
  STATE_SYNC_INTERVAL_MS,
} from './multiplayer';
import { createCompetitiveState, isGameCommand, viewStateForFaction, type GameCommand } from '../game';

describe('multiplayer state transport', () => {
  it('uses PeerJS binary serialization so large snapshots are automatically chunked', () => {
    expect(MULTIPLAYER_SERIALIZATION).toBe('binary');
    expect(MAX_PLAYERS).toBe(4);
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

  it('validates a host-tailored authoritative snapshot without changing its perspective', () => {
    const canonical = createCompetitiveState({ mapSize: 'small', difficulty: 'commander' });
    const rival = prepareIncomingState(viewStateForFaction(canonical, 'enemy'))!;
    expect(rival.planets.find(planet => planet.id === 'cygnus')?.owner).toBe('player');
    expect(prepareIncomingState({ planets: [] })).toBeUndefined();
    expect(prepareIncomingState(null)).toBeUndefined();
  });

  it('omits undefined optional fields before binary command serialization', () => {
    const command: GameCommand = { type: 'queueUnit', planetId: 'cygnus', kind: 'transport', yardIds: undefined };
    const prepared = prepareOutgoingCommand(command);

    expect(prepared).toEqual({ type: 'queueUnit', planetId: 'cygnus', kind: 'transport' });
    expect(Object.hasOwn(prepared, 'yardIds')).toBe(false);
    expect(isGameCommand(prepared)).toBe(true);
  });
});
