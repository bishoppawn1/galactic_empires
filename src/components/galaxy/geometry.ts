import {
  GALAXY_CANVAS_HEIGHT, GALAXY_CANVAS_WIDTH, MAX_SHIP_ORBIT_RADIUS, MIN_SHIP_ORBIT_SEPARATION,
  headingForVector, orbitalDefenseOffset, type Fleet, type GalaxyCanvasDimensions, type Planet, type Unit,
} from '../../game';

export { GALAXY_CANVAS_HEIGHT, GALAXY_CANVAS_WIDTH };
export const DEFAULT_GALAXY_CANVAS_DIMENSIONS: GalaxyCanvasDimensions = { width: GALAXY_CANVAS_WIDTH, height: GALAXY_CANVAS_HEIGHT };

export interface GalaxyViewportBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const pointInViewport = (bounds: GalaxyViewportBounds | undefined, x: number, y: number, padding = 0) => !bounds
  || (x >= bounds.left - padding && x <= bounds.right + padding && y >= bounds.top - padding && y <= bounds.bottom + padding);

export const systemBorderPoint = (from: Planet, to: Planet, dimensions = DEFAULT_GALAXY_CANVAS_DIMENSIONS) => {
  const fromX = dimensions.width * from.x / 100, fromY = dimensions.height * from.y / 100;
  const dx = dimensions.width * (to.x - from.x) / 100, dy = dimensions.height * (to.y - from.y) / 100;
  const distance = Math.hypot(dx, dy) || 1;
  const radius = MAX_SHIP_ORBIT_RADIUS;
  return { x: fromX + dx / distance * radius, y: fromY + dy / distance * radius };
};

export const fleetMapPosition = (fleet: Fleet, planets: Planet[], dimensions = DEFAULT_GALAXY_CANVAS_DIMENSIONS) => {
  const from = planets.find(planet => planet.id === fleet.originId)!;
  const to = planets.find(planet => planet.id === fleet.destinationId)!;
  const phase = fleet.phase ?? 'tunnel';
  const originBorder = systemBorderPoint(from, to, dimensions);
  const destinationBorder = systemBorderPoint(to, from, dimensions);
  const start = phase === 'exiting'
    ? { x: dimensions.width * from.x / 100 + (fleet.departureX ?? 0), y: dimensions.height * from.y / 100 + (fleet.departureY ?? 0) }
    : originBorder;
  const end = phase === 'tunnel' ? destinationBorder : originBorder;
  const progress = fleet.travelTime ? Math.min(1, fleet.progress / fleet.travelTime) : 1;
  return { x: start.x + (end.x - start.x) * progress, y: start.y + (end.y - start.y) * progress, phase };
};

export const shipMapPosition = (planet: Planet, ship: Unit, index: number, dimensions = DEFAULT_GALAXY_CANVAS_DIMENSIONS) => {
  if (ship.docked) {
    const docked = planet.orbitUnits.filter(candidate => candidate.docked);
    const dockedIndex = docked.findIndex(candidate => candidate.id === ship.id);
    const columns = Math.min(4, docked.length);
    const column = Math.max(0, dockedIndex) % columns, row = Math.floor(Math.max(0, dockedIndex) / columns);
    const rowCount = Math.min(columns, docked.length - row * columns);
    return {
      x: dimensions.width * planet.x / 100 + (column - (rowCount - 1) / 2) * MIN_SHIP_ORBIT_SEPARATION,
      y: dimensions.height * planet.y / 100 - 110 - row * MIN_SHIP_ORBIT_SEPARATION,
    };
  }
  const angle = -Math.PI / 2 + index * (Math.PI * 2 / Math.max(3, planet.orbitUnits.length));
  const radius = 155 + (index % 2) * 35;
  return {
    x: dimensions.width * planet.x / 100 + (ship.orbitX ?? Math.cos(angle) * radius),
    y: dimensions.height * planet.y / 100 + (ship.orbitY ?? Math.sin(angle) * radius),
  };
};

export const orbitShipHeading = (ship: Unit) => ship.heading ?? (
  typeof ship.orbitTargetX === 'number' && typeof ship.orbitTargetY === 'number'
    ? headingForVector(ship.orbitTargetX - (ship.orbitX ?? 0), ship.orbitTargetY - (ship.orbitY ?? 0))
    : 0
);

export const fleetHeading = (fleet: Fleet, planets: Planet[], dimensions = DEFAULT_GALAXY_CANVAS_DIMENSIONS) => {
  if (typeof fleet.unit.heading === 'number') return fleet.unit.heading;
  const from = planets.find(planet => planet.id === fleet.originId)!;
  const to = planets.find(planet => planet.id === fleet.destinationId)!;
  return headingForVector(
    dimensions.width * (to.x - from.x) / 100,
    dimensions.height * (to.y - from.y) / 100,
    fleet.unit.heading,
  );
};

export const yardMapPosition = (planet: Planet, index: number, count: number, dimensions = DEFAULT_GALAXY_CANVAS_DIMENSIONS) => {
  const angle = Math.PI / 4 + index * (Math.PI * 2 / Math.max(1, count));
  const radius = 295 + (index % 2) * 28;
  return { x: dimensions.width * planet.x / 100 + Math.cos(angle) * radius, y: dimensions.height * planet.y / 100 + Math.sin(angle) * radius };
};

export const defenseMapPosition = (planet: Planet, index: number, count: number, dimensions = DEFAULT_GALAXY_CANVAS_DIMENSIONS) => {
  const offset = orbitalDefenseOffset(index, count);
  return { x: dimensions.width * planet.x / 100 + offset.x, y: dimensions.height * planet.y / 100 + offset.y };
};
