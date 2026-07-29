import {
  GROUND_BATTLEFIELD_HEIGHT,
  GROUND_BATTLEFIELD_WIDTH,
  GROUND_UNIT_HITBOX_RADIUS,
  type GroundPosition,
} from './constants';

export type GroundTerrainKind = 'crater' | 'forest' | 'rocks' | 'ridge' | 'scrub';

export interface GroundTerrainPiece {
  kind: GroundTerrainKind;
  x: number;
  y: number;
  size: number;
  rotation: number;
}

export const GROUND_FOREST_DAMAGE_MULTIPLIER = .7;
const terrainCache = new Map<string, GroundTerrainPiece[]>();

export function groundTerrainForPlanet(planetId: string): GroundTerrainPiece[] {
  const cached = terrainCache.get(planetId);
  if (cached) return cached;
  let seed = 2166136261;
  for (const character of planetId) {
    seed ^= character.charCodeAt(0);
    seed = Math.imul(seed, 16777619);
  }
  const random = () => {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822519);
    seed = Math.imul(seed ^ (seed >>> 13), 3266489917);
    return ((seed ^= seed >>> 16) >>> 0) / 0xffffffff;
  };
  const kinds: GroundTerrainKind[] = ['rocks', 'forest', 'rocks', 'crater', 'forest', 'ridge', 'rocks', 'scrub', 'forest'];
  const terrain = Array.from({ length: 36 }, (_, index) => {
    const kind = kinds[index % kinds.length];
    return {
      kind,
      x: kind === 'rocks' ? 20 + random() * 60 : 6 + random() * 88,
      y: 6 + random() * 88,
      size: kind === 'forest' ? 260 + random() * 260 : kind === 'rocks' ? 180 + random() * 220 : 150 + random() * 260,
      rotation: -35 + random() * 70,
    };
  });
  terrainCache.set(planetId, terrain);
  return terrain;
}

function terrainCoordinates(piece: GroundTerrainPiece, position: GroundPosition) {
  const pixelX = (position.battleX - piece.x) / 100 * GROUND_BATTLEFIELD_WIDTH;
  const pixelY = (position.battleY - piece.y) / 100 * GROUND_BATTLEFIELD_HEIGHT;
  const radians = -piece.rotation / 180 * Math.PI;
  return {
    x: pixelX * Math.cos(radians) - pixelY * Math.sin(radians),
    y: pixelX * Math.sin(radians) + pixelY * Math.cos(radians),
  };
}

export function groundTerrainContains(
  piece: GroundTerrainPiece,
  position: GroundPosition,
  padding = 0,
) {
  const point = terrainCoordinates(piece, position);
  const radiusX = piece.size * .5 + padding;
  const radiusY = piece.size * .31 + padding;
  return (point.x / radiusX) ** 2 + (point.y / radiusY) ** 2 <= 1;
}

export function groundPositionBlocked(planetId: string, position: GroundPosition) {
  return groundRockCollisionDepth(planetId, position) > 0;
}

export function groundRockCollisionDepth(planetId: string, position: GroundPosition) {
  return groundTerrainForPlanet(planetId).reduce((depth, piece) => {
    if (piece.kind !== 'rocks') return depth;
    const point = terrainCoordinates(piece, position);
    const radiusX = piece.size * .5 + GROUND_UNIT_HITBOX_RADIUS;
    const radiusY = piece.size * .31 + GROUND_UNIT_HITBOX_RADIUS;
    return Math.max(depth, 1 - Math.hypot(point.x / radiusX, point.y / radiusY));
  }, 0);
}

export function groundForestAtPosition(planetId: string, position: GroundPosition) {
  return groundTerrainForPlanet(planetId)
    .some(piece => piece.kind === 'forest' && groundTerrainContains(piece, position));
}

const stableDirection = (unitId: string) => {
  let hash = 2166136261;
  for (const character of unitId) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2 ? 1 : -1;
};

export function groundTerrainMovementStep(
  planetId: string,
  unitId: string,
  current: GroundPosition,
  target: GroundPosition,
  travel: number,
): GroundPosition {
  let position = { ...current };
  let remaining = travel;
  const preferredDirection = stableDirection(unitId);
  while (remaining > 1e-6) {
    const step = Math.min(.35, remaining);
    const dx = target.battleX - position.battleX;
    const dy = target.battleY - position.battleY;
    const distance = Math.hypot(dx, dy);
    if (!distance) break;
    const baseAngle = Math.atan2(dy, dx);
    const candidateAngles = [0];
    for (let offset = 15; offset <= 180; offset += 15) {
      candidateAngles.push(offset * preferredDirection, -offset * preferredDirection);
    }
    const currentCollisionDepth = groundRockCollisionDepth(planetId, position);
    const candidates = candidateAngles.map(offset => {
      const angle = baseAngle + offset / 180 * Math.PI;
      const candidate = {
        battleX: position.battleX + Math.cos(angle) * Math.min(step, distance),
        battleY: position.battleY + Math.sin(angle) * Math.min(step, distance),
      };
      return { candidate, offset, distance: Math.hypot(target.battleX - candidate.battleX, target.battleY - candidate.battleY) };
    }).filter(({ candidate }) => {
      const candidateDepth = groundRockCollisionDepth(planetId, candidate);
      return candidateDepth <= 0 || candidateDepth < currentCollisionDepth - 1e-6;
    })
      .sort((a, b) => a.distance + Math.abs(a.offset) * .001 - (b.distance + Math.abs(b.offset) * .001));
    if (!candidates.length) break;
    position = candidates[0].candidate;
    remaining -= step;
  }
  return position;
}
