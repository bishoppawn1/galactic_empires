import { describe, expect, it } from 'vitest';
import {
  GROUND_UNIT_MIN_SPACING, UNITS, createInitialState, groundUnitPixelDistance,
  maneuverGroundUnits, tick, type GroundUnitKind, type Unit,
} from './game';

const combatUnit = (
  id: string,
  kind: GroundUnitKind,
  faction: 'player' | 'enemy',
  battleX?: number,
  battleY?: number,
): Unit => ({
  id,
  kind,
  faction,
  hp: UNITS[kind].hp,
  maxHp: UNITS[kind].hp,
  shields: UNITS[kind].shields,
  maxShields: UNITS[kind].shields,
  ...(typeof battleX === 'number' ? { battleX } : {}),
  ...(typeof battleY === 'number' ? { battleY } : {}),
});

const expectClearance = (units: Unit[]) => {
  units.forEach((unit, index) => units.slice(index + 1).forEach(other => {
    expect(groundUnitPixelDistance(
      { battleX: unit.battleX!, battleY: unit.battleY! },
      { battleX: other.battleX!, battleY: other.battleY! },
    )).toBeGreaterThanOrEqual(GROUND_UNIT_MIN_SPACING - .01);
  }));
};

describe('ground unit hitboxes', () => {
  it('separates overlapping units from older battles deterministically', () => {
    const state = createInitialState();
    state.battles = [{
      planetId: 'draven',
      attackers: [combatUnit('a1', 'infantry', 'player', 50, 50), combatUnit('a2', 'infantry', 'player', 50, 50)],
      defenders: [combatUnit('d1', 'defenseTurret', 'enemy', 50, 50)],
    }];

    const resolved = tick(state, 0);
    const units = [...resolved.battles[0].attackers, ...resolved.battles[0].defenders];
    expectClearance(units);
    expect(tick(state, 0).battles[0]).toEqual(resolved.battles[0]);
  });

  it('deploys dense armies without overlapping their hitboxes', () => {
    const state = createInitialState();
    state.battles = [{
      planetId: 'draven',
      attackers: Array.from({ length: 40 }, (_, index) => combatUnit(`a${index}`, 'broodling', 'player')),
      defenders: Array.from({ length: 40 }, (_, index) => combatUnit(`d${index}`, 'aegisWarden', 'enemy')),
    }];

    const deployed = tick(state, 0);
    expectClearance([...deployed.battles[0].attackers, ...deployed.battles[0].defenders]);
  });

  it('reserves open formation destinations around stationary and selected units', () => {
    const state = createInitialState();
    state.battles = [{
      planetId: 'draven',
      attackers: [combatUnit('a1', 'infantry', 'player', 12, 45), combatUnit('a2', 'infantry', 'player', 12, 55)],
      defenders: [{ ...combatUnit('turret', 'defenseTurret', 'enemy', 50, 50), sourceBuildingId: 'ground-defense' }],
    }];

    const ordered = maneuverGroundUnits(state, 'draven', ['a1', 'a2'], 50, 50);
    expect(ordered.ok).toBe(true);
    if (!ordered.ok) return;
    const targets = ordered.state.battles[0].attackers.map(unit => ({ battleX: unit.battleTargetX!, battleY: unit.battleTargetY! }));
    expectClearance(targets as Unit[]);
    targets.forEach(target => expect(groundUnitPixelDistance(target, { battleX: 50, battleY: 50 })).toBeGreaterThanOrEqual(GROUND_UNIT_MIN_SPACING - .01));

    const arrived = tick(ordered.state, 40);
    expectClearance([...arrived.battles[0].attackers, ...arrived.battles[0].defenders]);
  });

  it('keeps converging enemies outside each other hitboxes during pursuit', () => {
    const state = createInitialState();
    state.battles = [{
      planetId: 'draven',
      attackers: [combatUnit('a1', 'infantry', 'player', 48, 50)],
      defenders: [combatUnit('d1', 'infantry', 'enemy', 52, 50)],
    }];

    const advanced = tick(state, .5);
    expectClearance([...advanced.battles[0].attackers, ...advanced.battles[0].defenders]);
  });
});
