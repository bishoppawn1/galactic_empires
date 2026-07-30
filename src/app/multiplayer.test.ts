import { describe, expect, it } from 'vitest';
import {
  canSendStateUpdate,
  GUEST_STATE_TRANSITION_MS,
  MAX_PLAYERS,
  MAX_BUFFERED_STATE_MESSAGES,
  MULTIPLAYER_SERIALIZATION,
  matchSlotsForLobby,
  PEER_OPEN_TIMEOUT_MS,
  prepareIncomingState,
  prepareIncomingSnapshot,
  prepareOutgoingCommand,
  STATE_SYNC_INTERVAL_MS,
} from './multiplayer';
import { createCompetitiveState, isGameCommand, UNITS, viewStateForFaction, type EmpireFaction, type GameCommand, type MatchEmpireSlot } from '../game';

describe('multiplayer state transport', () => {
  it('uses PeerJS binary serialization so large snapshots are automatically chunked', () => {
    expect(MULTIPLAYER_SERIALIZATION).toBe('binary');
    expect(MAX_PLAYERS).toBe(4);
  });

  it('limits full-state synchronization to four updates per second', () => {
    expect(STATE_SYNC_INTERVAL_MS).toBe(250);
    expect(GUEST_STATE_TRANSITION_MS).toBeGreaterThan(STATE_SYNC_INTERVAL_MS);
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

  it('installs current authoritative updates without cloning and remigrating the full match', () => {
    const current = viewStateForFaction(createCompetitiveState({ mapSize: 'small', difficulty: 'commander' }), 'enemy');
    expect(prepareIncomingSnapshot(current)).toBe(current);
    expect(prepareIncomingSnapshot({ ...current, elapsed: Number.NaN })).toBeUndefined();
    expect(prepareIncomingSnapshot({ ...current, planets: [] })).toBeUndefined();
  });

  it('marks every guest empire ship as local before client-side viewport culling', () => {
    const factions: EmpireFaction[] = ['player', 'enemy', 'rival2', 'rival3'];
    const slots: MatchEmpireSlot[] = factions.map(faction => ({ faction, controller: 'human', civilization: 'human' }));
    const canonical = createCompetitiveState({ mapSize: 'huge', difficulty: 'commander' }, slots);

    for (const faction of factions) {
      const home = canonical.planets.find(planet => planet.owner === faction)!;
      home.orbitUnits = [{
        id: `${faction}-viewport-ship`,
        kind: 'escortFrigate',
        faction,
        hp: UNITS.escortFrigate.hp,
        maxHp: UNITS.escortFrigate.hp,
        shields: UNITS.escortFrigate.shields,
        maxShields: UNITS.escortFrigate.shields,
      }];
      const localView = prepareIncomingState(viewStateForFaction(canonical, faction))!;
      const localHome = localView.planets.find(planet => planet.id === home.id)!;
      expect(localHome.owner).toBe('player');
      expect(localHome.orbitUnits).toEqual([expect.objectContaining({ id: `${faction}-viewport-ship`, faction: 'player' })]);
    }
  });

  it('omits undefined optional fields before binary command serialization', () => {
    const command: GameCommand = { type: 'queueUnit', planetId: 'cygnus', kind: 'transport', yardIds: undefined };
    const prepared = prepareOutgoingCommand(command);

    expect(prepared).toEqual({ type: 'queueUnit', planetId: 'cygnus', kind: 'transport' });
    expect(Object.hasOwn(prepared, 'yardIds')).toBe(false);
    expect(isGameCommand(prepared)).toBe(true);
  });

  it('carries every lobby commander civilization into the match slots', () => {
    const slots = matchSlotsForLobby({
      code: 'ABC234',
      config: { mapSize: 'small', difficulty: 'commander', playerFaction: 'aegis' },
      players: [
        { id: 'host', label: 'HOST COMMANDER', host: true, faction: 'player', civilization: 'aegis' },
        { id: 'guest', label: 'COMMANDER 2', host: false, faction: 'enemy', civilization: 'brood' },
        { id: 'guest-2', label: 'COMMANDER 3', host: false, faction: 'rival2', civilization: 'covenant' },
      ],
    });

    expect(slots).toEqual([
      { faction: 'player', controller: 'human', civilization: 'aegis' },
      { faction: 'enemy', controller: 'human', civilization: 'brood' },
      { faction: 'rival2', controller: 'human', civilization: 'covenant' },
    ]);
    const state = createCompetitiveState({ mapSize: 'small', difficulty: 'commander' }, slots);
    expect(state.empireCivilizations).toMatchObject({ player: 'aegis', enemy: 'brood', rival2: 'covenant' });
    expect(state.enemyResources.biomass).toBeGreaterThan(0);
  });
});
