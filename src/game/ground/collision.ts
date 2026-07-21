import type { Unit } from '../types';

export const GROUND_BATTLEFIELD_WIDTH = 2600;
export const GROUND_BATTLEFIELD_HEIGHT = 1600;
export const GROUND_UNIT_HITBOX_RADIUS = 52;
export const GROUND_UNIT_MIN_SPACING = GROUND_UNIT_HITBOX_RADIUS * 2;

const X_MARGIN = GROUND_UNIT_HITBOX_RADIUS / GROUND_BATTLEFIELD_WIDTH * 100;
const Y_MARGIN = GROUND_UNIT_HITBOX_RADIUS / GROUND_BATTLEFIELD_HEIGHT * 100;
const X_SPACING = GROUND_UNIT_MIN_SPACING / GROUND_BATTLEFIELD_WIDTH * 100;
const Y_SPACING = GROUND_UNIT_MIN_SPACING / GROUND_BATTLEFIELD_HEIGHT * 100;

export interface GroundPosition {
  id?: string;
  battleX: number;
  battleY: number;
}

export const GROUND_FORMATION_X_SPACING = X_SPACING;
export const GROUND_FORMATION_Y_SPACING = Y_SPACING;

export function clampGroundPosition(battleX: number, battleY: number): GroundPosition {
  return {
    battleX: Math.max(X_MARGIN, Math.min(100 - X_MARGIN, battleX)),
    battleY: Math.max(Y_MARGIN, Math.min(100 - Y_MARGIN, battleY)),
  };
}

const pixelVector = (a: GroundPosition, b: GroundPosition) => ({
  x: (b.battleX - a.battleX) / 100 * GROUND_BATTLEFIELD_WIDTH,
  y: (b.battleY - a.battleY) / 100 * GROUND_BATTLEFIELD_HEIGHT,
});

export function groundUnitPixelDistance(a: GroundPosition, b: GroundPosition) {
  const vector = pixelVector(a, b);
  return Math.hypot(vector.x, vector.y);
}

export function hasGroundUnitClearance(position: GroundPosition, occupied: GroundPosition[]) {
  return occupied.every(other => (position.id !== undefined && other.id === position.id)
    || groundUnitPixelDistance(position, other) >= GROUND_UNIT_MIN_SPACING - 1e-6);
}

export function nearestOpenGroundPosition(battleX: number, battleY: number, occupied: GroundPosition[]): GroundPosition {
  const origin = clampGroundPosition(battleX, battleY);
  if (hasGroundUnitClearance(origin, occupied)) return origin;

  const directions = 24;
  for (let ring = 1; ring <= 24; ring += 1) {
    const radius = ring * GROUND_UNIT_MIN_SPACING;
    for (let direction = 0; direction < directions; direction += 1) {
      const angle = direction / directions * Math.PI * 2;
      const candidate = clampGroundPosition(
        origin.battleX + Math.cos(angle) * radius / GROUND_BATTLEFIELD_WIDTH * 100,
        origin.battleY + Math.sin(angle) * radius / GROUND_BATTLEFIELD_HEIGHT * 100,
      );
      if (hasGroundUnitClearance(candidate, occupied)) return candidate;
    }
  }
  return origin;
}

const stableAngle = (firstId: string, secondId: string) => {
  let hash = 2166136261;
  for (const character of `${firstId}:${secondId}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff * Math.PI * 2;
};

const cellKey = (unit: Unit) => {
  const x = (unit.battleX ?? 0) / 100 * GROUND_BATTLEFIELD_WIDTH;
  const y = (unit.battleY ?? 0) / 100 * GROUND_BATTLEFIELD_HEIGHT;
  return `${Math.floor(x / GROUND_UNIT_MIN_SPACING)},${Math.floor(y / GROUND_UNIT_MIN_SPACING)}`;
};

const moveUnitByPixels = (unit: Unit, x: number, y: number) => {
  const position = clampGroundPosition(
    (unit.battleX ?? 0) + x / GROUND_BATTLEFIELD_WIDTH * 100,
    (unit.battleY ?? 0) + y / GROUND_BATTLEFIELD_HEIGHT * 100,
  );
  unit.battleX = position.battleX;
  unit.battleY = position.battleY;
};

function separatePair(first: Unit, second: Unit) {
  let vector = pixelVector(
    { battleX: first.battleX ?? 0, battleY: first.battleY ?? 0 },
    { battleX: second.battleX ?? 0, battleY: second.battleY ?? 0 },
  );
  let distance = Math.hypot(vector.x, vector.y);
  if (distance >= GROUND_UNIT_MIN_SPACING - 1e-6) return false;
  if (distance < 1e-6) {
    const angle = stableAngle(first.id, second.id);
    vector = { x: Math.cos(angle), y: Math.sin(angle) };
    distance = 0;
  }
  const divisor = distance || 1;
  const overlap = GROUND_UNIT_MIN_SPACING - distance;
  const firstFixed = Boolean(first.sourceBuildingId);
  const secondFixed = Boolean(second.sourceBuildingId);
  const firstShare = firstFixed && !secondFixed ? 0 : secondFixed && !firstFixed ? 1 : .5;
  const secondShare = 1 - firstShare;
  moveUnitByPixels(first, -vector.x / divisor * overlap * firstShare, -vector.y / divisor * overlap * firstShare);
  moveUnitByPixels(second, vector.x / divisor * overlap * secondShare, vector.y / divisor * overlap * secondShare);
  return true;
}

export function separateGroundUnits(units: Unit[]) {
  const ordered = [...units].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  for (let pass = 0; pass < 12; pass += 1) {
    const cells = new Map<string, Unit[]>();
    for (const unit of ordered) {
      const key = cellKey(unit);
      const occupants = cells.get(key);
      if (occupants) occupants.push(unit);
      else cells.set(key, [unit]);
    }
    let moved = false;
    for (const unit of ordered) {
      const pixelX = (unit.battleX ?? 0) / 100 * GROUND_BATTLEFIELD_WIDTH;
      const pixelY = (unit.battleY ?? 0) / 100 * GROUND_BATTLEFIELD_HEIGHT;
      const cellX = Math.floor(pixelX / GROUND_UNIT_MIN_SPACING);
      const cellY = Math.floor(pixelY / GROUND_UNIT_MIN_SPACING);
      for (let x = cellX - 1; x <= cellX + 1; x += 1) {
        for (let y = cellY - 1; y <= cellY + 1; y += 1) {
          for (const other of cells.get(`${x},${y}`) ?? []) {
            if (unit.id >= other.id) continue;
            moved = separatePair(unit, other) || moved;
          }
        }
      }
    }
    if (!moved) break;
  }
}
