import { describe, expect, it } from 'vitest';
import { createInitialState, isGameCommand, maneuverGroundUnits, tick, UNITS, type GroundUnitKind, type Unit } from './game';

const combatUnit = (id: string, kind: GroundUnitKind, faction: 'player' | 'enemy', battleX: number): Unit => ({
  id,
  kind,
  faction,
  hp: UNITS[kind].hp,
  maxHp: UNITS[kind].hp,
  shields: UNITS[kind].shields,
  maxShields: UNITS[kind].shields,
  battleX,
  battleY: 50,
});

describe('manual ground controls', () => {
  it('serializes finite multiplayer maneuver orders', () => {
    expect(isGameCommand({ type: 'battleManeuver', planetId: 'terra', unitIds: ['u1'], battleX: 42, battleY: 57 })).toBe(true);
    expect(isGameCommand({ type: 'battleManeuver', planetId: 'terra', unitIds: ['u1'], battleX: Number.NaN, battleY: 57 })).toBe(false);
  });

  it('moves selected troops toward separate formation positions and holds them there', () => {
    const state = createInitialState();
    state.battles = [{ planetId: 'draven', attackers: [combatUnit('a1', 'infantry', 'player', 12), combatUnit('a2', 'infantry', 'player', 14)], defenders: [combatUnit('d1', 'defenseTurret', 'enemy', 98)] }];
    const ordered = maneuverGroundUnits(state, 'draven', ['a1', 'a2'], 36, 32);
    expect(ordered.ok).toBe(true);
    if (!ordered.ok) return;
    expect(ordered.state.battles[0].attackers[0].battleTargetX).not.toBe(ordered.state.battles[0].attackers[1].battleTargetX);
    expect(state.battles[0].attackers[0].battleTargetX).toBeUndefined();

    const underway = tick(ordered.state, 1);
    expect(underway.battles[0].attackers[0].battleX).toBeGreaterThan(12);
    const arrived = tick(underway, 30);
    expect(arrived.battles[0].attackers[0].battleX).toBeCloseTo(arrived.battles[0].attackers[0].battleTargetX!);
    expect(arrived.battles[0].attackers[0].battleY).toBeCloseTo(arrived.battles[0].attackers[0].battleTargetY!);
  });

  it('automatically fires at hostiles in range before continuing a move order', () => {
    const state = createInitialState();
    state.battles = [{ planetId: 'draven', attackers: [combatUnit('a1', 'infantry', 'player', 40)], defenders: [combatUnit('d1', 'infantry', 'enemy', 52)] }];
    const ordered = maneuverGroundUnits(state, 'draven', ['a1'], 20, 30);
    expect(ordered.ok).toBe(true);
    if (!ordered.ok) return;
    const fired = tick(ordered.state, 1);
    expect(fired.battles[0].attackers[0].battleX).toBe(40);
    expect(fired.battles[0].defenders[0].shields).toBeLessThan(UNITS.infantry.shields);
  });
});
