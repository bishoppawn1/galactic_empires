import { visibleOrbitUnits, type GameState } from '../../game';

export const LARGE_FLEET_RENDER_THRESHOLD = 96;
export const MAX_LARGE_FLEET_VISUAL_SHOTS = 96;
export const MAX_LARGE_FLEET_FIGHTERS_PER_SORTIE = 3;
export const MAX_LARGE_FLEET_PROJECTILES_PER_SALVO = 2;

export const visibleShipCount = (state: GameState) => state.planets.reduce(
  (total, planet) => total + visibleOrbitUnits(planet).length,
  state.fleets.length,
);

export const usesLargeFleetRenderBudget = (state: GameState) =>
  visibleShipCount(state) >= LARGE_FLEET_RENDER_THRESHOLD;

export const canvasPixelScale = (zoom: number, devicePixelRatio: number) =>
  Math.min(1.25, Math.max(.02, zoom * Math.min(1, Math.max(.5, devicePixelRatio))));

export function evenlySampleVisuals<T>(items: T[], limit: number): T[] {
  if (limit <= 0) return [];
  if (items.length <= limit) return items;
  return Array.from({ length: limit }, (_, index) => items[Math.floor(index * items.length / limit)]);
}
