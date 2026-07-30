import type { Faction, Planet, PlanetConnection, ResourcePool } from './types';

export const formatCost = (cost: ResourcePool) => [cost.metal && `${cost.metal}M`, cost.crystal && `${cost.crystal}C`, cost.gold && `${cost.gold}G`].filter(Boolean).join(' · ');

export const ownerLabel = (owner: Faction) => owner === 'player' ? 'COLONY' : owner ? 'HOSTILE' : 'UNCHARTED';

export const headingForVector = (dx: number, dy: number, fallback = 0) => Math.hypot(dx, dy) < .001
  ? fallback
  : (Math.atan2(dy, dx) * 180 / Math.PI + 450) % 360;

export const shortestHeadingDelta = (current: number, target: number) =>
  ((target - current + 540) % 360) - 180;

export const turnHeadingToward = (current: number, target: number, maximumTurn: number) => {
  const normalizedCurrent = (current % 360 + 360) % 360;
  const normalizedTarget = (target % 360 + 360) % 360;
  const delta = shortestHeadingDelta(normalizedCurrent, normalizedTarget);
  if (Math.abs(delta) <= maximumTurn) return normalizedTarget;
  return (normalizedCurrent + Math.sign(delta) * Math.max(0, maximumTurn) + 360) % 360;
};

export const MAX_PHASE_LANE_DISTANCE = 42;
export const STAR_PHASE_LANE_DISTANCE = 32;
export const MUTUAL_PHASE_LANE_NEIGHBOR_LIMIT = 3;
export const PHASE_LANE_TARGET_DENSITY = 1.4;
export const PHASE_LANE_MAX_DEGREE = 4;

const laneRandomValue = (connection: PlanetConnection) => {
  const systems = [connection.from, connection.to].sort((a, b) => a.id.localeCompare(b.id));
  const key = systems.map(system => `${system.id}:${system.x.toFixed(4)},${system.y.toFixed(4)}`).join('|');
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
};

export function localPlanetConnections(planets: Planet[], maxDistance = MAX_PHASE_LANE_DISTANCE): PlanetConnection[] {
  const candidates: PlanetConnection[] = [];
  for (let i = 0; i < planets.length; i += 1) {
    for (let j = i + 1; j < planets.length; j += 1) {
      const from = planets[i], to = planets[j];
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      const connectionRange = from.systemKind === 'star' || to.systemKind === 'star'
        ? Math.min(maxDistance, STAR_PHASE_LANE_DISTANCE)
        : maxDistance;
      if (distance <= connectionRange) candidates.push({ from, to, distance });
    }
  }
  const priority = new Map(candidates.map(connection => [
    connection,
    laneRandomValue(connection) + connection.distance / maxDistance * .15,
  ]));
  const randomizedCandidates = candidates.sort((a, b) =>
    priority.get(a)! - priority.get(b)!
    || a.from.id.localeCompare(b.from.id)
    || a.to.id.localeCompare(b.to.id));

  const parent = new Map(planets.map(planet => [planet.id, planet.id]));
  const root = (id: string): string => {
    const next = parent.get(id)!;
    if (next === id) return id;
    const resolved = root(next);
    parent.set(id, resolved);
    return resolved;
  };
  const connections: PlanetConnection[] = [];
  const selected = new Set<string>();
  const connectionKey = (connection: PlanetConnection) => `${connection.from.id}:${connection.to.id}`;
  const degree = new Map(planets.map(planet => [planet.id, 0]));
  const addConnection = (connection: PlanetConnection) => {
    connections.push(connection);
    selected.add(connectionKey(connection));
    degree.set(connection.from.id, degree.get(connection.from.id)! + 1);
    degree.set(connection.to.id, degree.get(connection.to.id)! + 1);
  };
  for (const connection of randomizedCandidates) {
    const fromRoot = root(connection.from.id), toRoot = root(connection.to.id);
    if (fromRoot === toRoot) continue;
    parent.set(toRoot, fromRoot);
    addConnection(connection);
  }

  // Give branch tips another exit before adding a bounded set of seeded shortcuts.
  for (const planet of planets) {
    if (degree.get(planet.id)! >= 2) continue;
    const connection = randomizedCandidates.find(candidate => {
      if (selected.has(connectionKey(candidate))) return false;
      const other = candidate.from.id === planet.id ? candidate.to
        : candidate.to.id === planet.id ? candidate.from
          : undefined;
      return !!other && degree.get(other.id)! < PHASE_LANE_MAX_DEGREE;
    });
    if (connection) addConnection(connection);
  }

  const targetCount = Math.min(
    randomizedCandidates.length,
    Math.ceil(planets.length * PHASE_LANE_TARGET_DENSITY),
  );
  for (const connection of randomizedCandidates) {
    if (connections.length >= targetCount) break;
    if (selected.has(connectionKey(connection))
      || degree.get(connection.from.id)! >= PHASE_LANE_MAX_DEGREE
      || degree.get(connection.to.id)! >= PHASE_LANE_MAX_DEGREE) continue;
    addConnection(connection);
  }
  return connections.sort((a, b) => a.distance - b.distance
    || a.from.id.localeCompare(b.from.id)
    || a.to.id.localeCompare(b.to.id));
}

export function findPlanetPath(planets: Planet[], originId: string, destinationId: string): string[] | undefined {
  if (originId === destinationId) return [originId];
  const connections = localPlanetConnections(planets);
  const distances = new Map(planets.map(planet => [planet.id, Number.POSITIVE_INFINITY]));
  const previous = new Map<string, string>();
  const unvisited = new Set(planets.map(planet => planet.id));
  distances.set(originId, 0);

  while (unvisited.size) {
    const currentId = [...unvisited].reduce<string | undefined>((best, id) => best === undefined || distances.get(id)! < distances.get(best)! ? id : best, undefined);
    if (!currentId || distances.get(currentId) === Number.POSITIVE_INFINITY) break;
    unvisited.delete(currentId);
    if (currentId === destinationId) break;
    for (const connection of connections) {
      const neighborId = connection.from.id === currentId ? connection.to.id : connection.to.id === currentId ? connection.from.id : undefined;
      if (!neighborId || !unvisited.has(neighborId)) continue;
      const candidate = distances.get(currentId)! + connection.distance;
      if (candidate < distances.get(neighborId)!) {
        distances.set(neighborId, candidate);
        previous.set(neighborId, currentId);
      }
    }
  }

  if (!previous.has(destinationId)) return undefined;
  const path = [destinationId];
  while (path[0] !== originId) path.unshift(previous.get(path[0])!);
  return path;
}
