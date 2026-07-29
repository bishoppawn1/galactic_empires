import { describe, expect, it } from 'vitest';
import {
  MAX_PHASE_LANE_DISTANCE,
  MUTUAL_PHASE_LANE_NEIGHBOR_LIMIT,
  PHASE_TUNNEL_MIN_SECONDS,
  PHASE_TUNNEL_SECONDS_PER_MAP_UNIT,
  STAR_PHASE_LANE_DISTANCE,
  createInitialState,
  findPlanetPath,
  galaxyCanvasDimensions,
  localPlanetConnections,
  phaseTravelTime,
} from './game';

describe('sparse phase-lane navigation', () => {
  it('allows three mutual local neighbors without restoring every nearby lane', () => {
    expect(MUTUAL_PHASE_LANE_NEIGHBOR_LIMIT).toBe(3);
  });

  it('keeps generated maps connected while removing redundant nearby lanes', () => {
    for (const mapSize of ['small', 'medium', 'large', 'huge', 'massive', 'galactic'] as const) {
      for (let mapSeed = 0; mapSeed <= 20; mapSeed += 1) {
        const state = createInitialState({ mapSize, difficulty: 'commander', mapSeed });
        const connections = localPlanetConnections(state.planets);
        const nearbyPairs = state.planets.flatMap((planet, index) => state.planets.slice(index + 1).filter(other =>
          Math.hypot(other.x - planet.x, other.y - planet.y) <= MAX_PHASE_LANE_DISTANCE,
        )).length;

        expect(connections.length).toBeGreaterThanOrEqual(state.planets.length - 1);
        expect(connections.length).toBeLessThanOrEqual(nearbyPairs);
        expect(connections.every(connection => connection.distance <= MAX_PHASE_LANE_DISTANCE)).toBe(true);
        expect(
          state.planets.every(planet => findPlanetPath(state.planets, state.planets[0].id, planet.id)),
          `${mapSize} map seed ${mapSeed} should remain connected`,
        ).toBe(true);
        if (!state.planets.some(system => system.systemKind === 'star') && nearbyPairs > state.planets.length - 1) {
          expect(connections.length).toBeLessThan(nearbyPairs);
        }
      }
    }
  });

  it('keeps star lanes local instead of making the star a wide phase-lane hub', () => {
    let omittedWideApproach = false;
    for (let mapSeed = 1; mapSeed <= 20; mapSeed += 1) {
      const state = createInitialState({ mapSize: 'galactic', difficulty: 'commander', mapSeed });
      const star = state.planets.find(system => system.systemKind === 'star')!;
      const connections = localPlanetConnections(state.planets);
      const starConnections = connections.filter(connection =>
        connection.from.id === star.id || connection.to.id === star.id);
      const formerlyNearby = state.planets.filter(system => {
        const distance = Math.hypot(system.x - star.x, system.y - star.y);
        return system.id !== star.id && distance > STAR_PHASE_LANE_DISTANCE && distance <= MAX_PHASE_LANE_DISTANCE;
      });

      expect(starConnections.length).toBeGreaterThan(0);
      expect(starConnections.every(connection => connection.distance <= STAR_PHASE_LANE_DISTANCE)).toBe(true);
      omittedWideApproach ||= formerlyNearby.some(system => !starConnections.some(connection =>
        connection.from.id === system.id || connection.to.id === system.id));
    }
    expect(omittedWideApproach).toBe(true);
  });

  it('makes Galactic maps physically wider without shrinking their height', () => {
    const massive = galaxyCanvasDimensions('massive');
    const galactic = galaxyCanvasDimensions('galactic');
    expect(galactic.width).toBe(massive.width * 1.5);
    expect(galactic.height).toBe(massive.height);
  });

  it('crosses phase tunnels at roughly three times the former warp speed', () => {
    const state = createInitialState();
    const terra = state.planets.find(planet => planet.id === 'terra')!;
    const halcyon = state.planets.find(planet => planet.id === 'halcyon')!;
    const distance = Math.hypot(halcyon.x - terra.x, halcyon.y - terra.y);
    const tunnelTime = phaseTravelTime(terra, halcyon);

    expect(tunnelTime).toBeCloseTo(Math.max(PHASE_TUNNEL_MIN_SECONDS, distance * PHASE_TUNNEL_SECONDS_PER_MAP_UNIT));
    expect(tunnelTime).toBeLessThan(Math.max(12, distance * .85) / 3);
  });
});
