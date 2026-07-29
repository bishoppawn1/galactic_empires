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
  candidates.sort((a, b) => a.distance - b.distance
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
  for (const connection of candidates) {
    const fromRoot = root(connection.from.id), toRoot = root(connection.to.id);
    if (fromRoot === toRoot) continue;
    parent.set(toRoot, fromRoot);
    connections.push(connection);
    selected.add(connectionKey(connection));
  }

  const nearestNeighbors = new Map(planets.map(planet => [planet.id, new Set<string>()]));
  for (const planet of planets) {
    candidates
      .filter(connection => connection.from.id === planet.id || connection.to.id === planet.id)
      .slice(0, MUTUAL_PHASE_LANE_NEIGHBOR_LIMIT)
      .forEach(connection => nearestNeighbors.get(planet.id)!.add(
        connection.from.id === planet.id ? connection.to.id : connection.from.id,
      ));
  }
  for (const connection of candidates) {
    if (selected.has(connectionKey(connection))
      || !nearestNeighbors.get(connection.from.id)!.has(connection.to.id)
      || !nearestNeighbors.get(connection.to.id)!.has(connection.from.id)) continue;
    connections.push(connection);
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
