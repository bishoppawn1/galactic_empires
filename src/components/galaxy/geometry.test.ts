import { describe, expect, it } from 'vitest';
import { UNITS, type Fleet, type Planet, type Unit } from '../../game';
import { fleetHeading, orbitShipHeading } from './geometry';

const ship = (heading: number): Unit => ({
  id: 'turning-ship',
  kind: 'escortFrigate',
  faction: 'player',
  hp: UNITS.escortFrigate.hp,
  maxHp: UNITS.escortFrigate.hp,
  shields: UNITS.escortFrigate.shields,
  maxShields: UNITS.escortFrigate.shields,
  orbitX: 0,
  orbitY: 0,
  orbitTargetX: 100,
  orbitTargetY: 0,
  heading,
});

describe('galaxy ship heading presentation', () => {
  it('renders the simulated heading instead of snapping artwork toward its destination', () => {
    const turningShip = ship(25);
    expect(orbitShipHeading(turningShip)).toBe(25);

    const planets = [
      { id: 'origin', x: 10, y: 10 },
      { id: 'destination', x: 90, y: 90 },
    ] as Planet[];
    const fleet = {
      id: 'turning-fleet',
      faction: 'player',
      originId: 'origin',
      destinationId: 'destination',
      unit: turningShip,
      progress: 0,
      travelTime: 10,
      phase: 'exiting',
    } satisfies Fleet;
    expect(fleetHeading(fleet, planets)).toBe(25);
  });
});
