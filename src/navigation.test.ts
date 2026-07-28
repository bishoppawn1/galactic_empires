import { describe, expect, it } from 'vitest';
import {
  MAX_PHASE_LANE_DISTANCE,
  PHASE_TUNNEL_MIN_SECONDS,
  PHASE_TUNNEL_SECONDS_PER_MAP_UNIT,
  createInitialState,
  findPlanetPath,
  localPlanetConnections,
  phaseTravelTime,
} from './game';

describe('sparse phase-lane navigation', () => {
  it('keeps generated maps connected while removing redundant nearby lanes', () => {
    for (const mapSize of ['small', 'medium', 'large', 'huge'] as const) {
      for (let mapSeed = 0; mapSeed <= 20; mapSeed += 1) {
        const state = createInitialState({ mapSize, difficulty: 'commander', mapSeed });
        const connections = localPlanetConnections(state.planets);
        const nearbyPairs = state.planets.flatMap((planet, index) => state.planets.slice(index + 1).filter(other =>
          Math.hypot(other.x - planet.x, other.y - planet.y) <= MAX_PHASE_LANE_DISTANCE,
        )).length;

        expect(connections.length).toBeGreaterThanOrEqual(state.planets.length - 1);
        expect(connections.length).toBeLessThanOrEqual(nearbyPairs);
        expect(connections.every(connection => connection.distance <= MAX_PHASE_LANE_DISTANCE)).toBe(true);
        expect(state.planets.every(planet => findPlanetPath(state.planets, state.planets[0].id, planet.id))).toBe(true);
        if (nearbyPairs > state.planets.length - 1) expect(connections.length).toBeLessThan(nearbyPairs);
      }
    }
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
