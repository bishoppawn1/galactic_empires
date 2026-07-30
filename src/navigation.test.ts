import { describe, expect, it } from 'vitest';
import {
  MAX_PHASE_LANE_DISTANCE,
  PHASE_LANE_TARGET_DENSITY,
  PHASE_TUNNEL_MIN_SECONDS,
  PHASE_TUNNEL_SECONDS_PER_MAP_UNIT,
  STAR_PHASE_LANE_DISTANCE,
  SHIP_TURN_RATE_DEGREES_PER_SECOND,
  createInitialState,
  findPlanetPath,
  galaxyCanvasDimensions,
  localPlanetConnections,
  phaseTravelTime,
  shortestHeadingDelta,
  turnHeadingToward,
} from './game';

describe('sparse phase-lane navigation', () => {
  it('turns through the shortest arc at the capped ship rotation rate', () => {
    expect(SHIP_TURN_RATE_DEGREES_PER_SECOND).toBe(90);
    expect(turnHeadingToward(350, 10, 5)).toBe(355);
    expect(turnHeadingToward(350, 10, 15)).toBe(5);
    expect(turnHeadingToward(10, 350, 5)).toBe(5);
    expect(shortestHeadingDelta(350, 10)).toBe(20);
    expect(shortestHeadingDelta(10, 350)).toBe(-20);
  });

  it('builds seeded branching networks with several alternate routes', () => {
    expect(PHASE_LANE_TARGET_DENSITY).toBe(1.4);
    const topologies = new Set<string>();
    for (let mapSeed = 1; mapSeed <= 20; mapSeed += 1) {
      const state = createInitialState({ mapSize: 'galactic', difficulty: 'commander', mapSeed });
      const connections = localPlanetConnections(state.planets);
      const degree = new Map(state.planets.map(planet => [planet.id, 0]));
      const nearest = new Map(state.planets.map(planet => {
        const [closest] = state.planets
          .filter(other => other.id !== planet.id)
          .sort((a, b) => Math.hypot(a.x - planet.x, a.y - planet.y) - Math.hypot(b.x - planet.x, b.y - planet.y));
        return [planet.id, closest.id];
      }));
      connections.forEach(connection => {
        degree.set(connection.from.id, degree.get(connection.from.id)! + 1);
        degree.set(connection.to.id, degree.get(connection.to.id)! + 1);
      });
      topologies.add(connections
        .map(connection => [connection.from.id, connection.to.id].sort().join(':'))
        .sort()
        .join('|'));

      expect(connections.length).toBeGreaterThan(state.planets.length);
      expect(connections.some(connection =>
        nearest.get(connection.from.id) !== connection.to.id
        && nearest.get(connection.to.id) !== connection.from.id)).toBe(true);
      expect([...degree.values()].filter(value => value >= 2).length).toBeGreaterThanOrEqual(
        Math.floor(state.planets.length * .8),
      );
      expect([...degree.values()].filter(value => value >= 3).length).toBeGreaterThanOrEqual(
        Math.floor(state.planets.length * .3),
      );
    }
    expect(topologies.size).toBe(20);
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
