import {
  GALAXY_CANVAS_HEIGHT, GALAXY_CANVAS_WIDTH, MAX_SHIP_ORBIT_RADIUS, MIN_SHIP_ORBIT_SEPARATION,
  headingForVector, orbitalDefenseOffset, type Fleet, type Planet, type Unit,
} from '../../game';

export { GALAXY_CANVAS_HEIGHT, GALAXY_CANVAS_WIDTH };

export interface GalaxyViewportBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const pointInViewport = (bounds: GalaxyViewportBounds | undefined, x: number, y: number, padding = 0) => !bounds
  || (x >= bounds.left - padding && x <= bounds.right + padding && y >= bounds.top - padding && y <= bounds.bottom + padding);

export const systemBorderPoint = (from: Planet, to: Planet) => {
  const fromX = GALAXY_CANVAS_WIDTH * from.x / 100, fromY = GALAXY_CANVAS_HEIGHT * from.y / 100;
  const dx = GALAXY_CANVAS_WIDTH * (to.x - from.x) / 100, dy = GALAXY_CANVAS_HEIGHT * (to.y - from.y) / 100;
  const distance = Math.hypot(dx, dy) || 1;
  const radius = MAX_SHIP_ORBIT_RADIUS;
  return { x: fromX + dx / distance * radius, y: fromY + dy / distance * radius };
};

export const fleetMapPosition = (fleet: Fleet, planets: Planet[]) => {
  const from = planets.find(planet => planet.id === fleet.originId)!;
  const to = planets.find(planet => planet.id === fleet.destinationId)!;
  const phase = fleet.phase ?? 'tunnel';
  const originBorder = systemBorderPoint(from, to);
  const destinationBorder = systemBorderPoint(to, from);
  const start = phase === 'exiting'
    ? { x: GALAXY_CANVAS_WIDTH * from.x / 100 + (fleet.departureX ?? 0), y: GALAXY_CANVAS_HEIGHT * from.y / 100 + (fleet.departureY ?? 0) }
    : originBorder;
  const end = phase === 'tunnel' ? destinationBorder : originBorder;
  const progress = fleet.travelTime ? Math.min(1, fleet.progress / fleet.travelTime) : 1;
  return { x: start.x + (end.x - start.x) * progress, y: start.y + (end.y - start.y) * progress, phase };
};

export const shipMapPosition = (planet: Planet, ship: Unit, index: number) => {
  if (ship.docked) {
    const docked = planet.orbitUnits.filter(candidate => candidate.docked);
    const dockedIndex = docked.findIndex(candidate => candidate.id === ship.id);
    const columns = Math.min(4, docked.length);
    const column = Math.max(0, dockedIndex) % columns, row = Math.floor(Math.max(0, dockedIndex) / columns);
    const rowCount = Math.min(columns, docked.length - row * columns);
    return {
      x: GALAXY_CANVAS_WIDTH * planet.x / 100 + (column - (rowCount - 1) / 2) * MIN_SHIP_ORBIT_SEPARATION,
      y: GALAXY_CANVAS_HEIGHT * planet.y / 100 - 110 - row * MIN_SHIP_ORBIT_SEPARATION,
    };
  }
  const angle = -Math.PI / 2 + index * (Math.PI * 2 / Math.max(3, planet.orbitUnits.length));
  const radius = 155 + (index % 2) * 35;
  return {
    x: GALAXY_CANVAS_WIDTH * planet.x / 100 + (ship.orbitX ?? Math.cos(angle) * radius),
    y: GALAXY_CANVAS_HEIGHT * planet.y / 100 + (ship.orbitY ?? Math.sin(angle) * radius),
  };
};

export const orbitShipHeading = (ship: Unit) => typeof ship.orbitTargetX === 'number' && typeof ship.orbitTargetY === 'number'
  ? headingForVector(ship.orbitTargetX - (ship.orbitX ?? 0), ship.orbitTargetY - (ship.orbitY ?? 0), ship.heading)
  : ship.heading ?? 0;

export const fleetHeading = (fleet: Fleet, planets: Planet[]) => {
  const from = planets.find(planet => planet.id === fleet.originId)!;
  const to = planets.find(planet => planet.id === fleet.destinationId)!;
  return headingForVector(
    GALAXY_CANVAS_WIDTH * (to.x - from.x) / 100,
    GALAXY_CANVAS_HEIGHT * (to.y - from.y) / 100,
    fleet.unit.heading,
  );
};

export const yardMapPosition = (planet: Planet, index: number, count: number) => {
  const angle = Math.PI / 4 + index * (Math.PI * 2 / Math.max(1, count));
  const radius = 295 + (index % 2) * 28;
  return { x: GALAXY_CANVAS_WIDTH * planet.x / 100 + Math.cos(angle) * radius, y: GALAXY_CANVAS_HEIGHT * planet.y / 100 + Math.sin(angle) * radius };
};

export const defenseMapPosition = (planet: Planet, index: number, count: number) => {
  const offset = orbitalDefenseOffset(index, count);
  return { x: GALAXY_CANVAS_WIDTH * planet.x / 100 + offset.x, y: GALAXY_CANVAS_HEIGHT * planet.y / 100 + offset.y };
};
