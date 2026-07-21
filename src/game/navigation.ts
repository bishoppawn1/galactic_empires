import type { Faction, Planet, PlanetConnection, ResourcePool } from './types';

export const formatCost = (cost: ResourcePool) => [cost.metal && `${cost.metal}M`, cost.crystal && `${cost.crystal}C`, cost.gold && `${cost.gold}G`].filter(Boolean).join(' · ');

export const ownerLabel = (owner: Faction) => owner === 'player' ? 'COLONY' : owner ? 'HOSTILE' : 'UNCHARTED';

export const headingForVector = (dx: number, dy: number, fallback = 0) => Math.hypot(dx, dy) < .001
  ? fallback
  : (Math.atan2(dy, dx) * 180 / Math.PI + 450) % 360;

export function localPlanetConnections(planets: Planet[], maxDistance = 42): PlanetConnection[] {
  const connections: PlanetConnection[] = [];
  for (let i = 0; i < planets.length; i += 1) {
    for (let j = i + 1; j < planets.length; j += 1) {
      const from = planets[i], to = planets[j];
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      if (distance <= maxDistance) connections.push({ from, to, distance });
    }
  }
  return connections;
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
