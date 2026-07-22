import { describe, expect, it } from 'vitest';
import { createInitialState, isGameCommand, maneuverGroundUnits, ORBITAL_BOMBARDMENT_DAMAGE_PER_SHIP, tick, UNITS, type GroundUnitKind, type Unit } from './game';

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
    expect(fired.battles[0].attackers[0].battleTargetX).toBe(20);
    expect(fired.battles[0].defenders[0].shields).toBeLessThan(UNITS.infantry.shields);
  });

  it('pursues an out-of-range artillery unit after taking fire and retaliates in range', () => {
    const state = createInitialState();
    state.battles = [{ planetId: 'draven', attackers: [combatUnit('infantry', 'infantry', 'player', 40)], defenders: [combatUnit('artillery', 'artillery', 'enemy', 70)] }];
    const holding = maneuverGroundUnits(state, 'draven', ['infantry'], 40, 50);
    expect(holding.ok).toBe(true);
    if (!holding.ok) return;

    const hit = tick(holding.state, 1);
    expect(hit.battles[0].attackers[0].battleX).toBe(40);
    expect(hit.battles[0].attackers[0].battleRetaliationTargetId).toBe('artillery');
    expect(hit.battles[0].attackers[0].battleTargetX).toBeUndefined();
    const redirected = maneuverGroundUnits(hit, 'draven', ['infantry'], 25, 50);
    expect(redirected.ok).toBe(true);
    if (redirected.ok) expect(redirected.state.battles[0].attackers[0].battleRetaliationTargetId).toBeUndefined();

    const pursuing = tick(hit, 1);
    expect(pursuing.battles[0].attackers[0].battleX).toBeGreaterThan(40);
    const inRange = tick(pursuing, 4);
    const retaliating = tick(inRange, 1);
    expect(retaliating.battles[0].defenders[0].shields).toBeLessThan(UNITS.artillery.shields);
  });

  it('bombards opposing ground forces for one damage per uncontested ship per second', () => {
    const state = createInitialState();
    const draven = state.planets.find(planet => planet.id === 'draven')!;
    const target = { ...combatUnit('defender', 'infantry', 'enemy', 88), shields: 0 };
    state.battles = [{ planetId: draven.id, attackers: [combatUnit('attacker', 'infantry', 'player', 12)], defenders: [target] }];
    draven.orbitUnits = [
      { id: 'support-1', kind: 'escortFrigate', faction: 'player', hp: 260, maxHp: 260, shields: 130, maxShields: 130 },
      { id: 'support-2', kind: 'transport', faction: 'player', hp: 360, maxHp: 360, shields: 180, maxShields: 180 },
    ];

    const bombarded = tick(state, 2);
    expect(bombarded.battles[0].defenders[0].hp).toBe(target.hp - 2 * 2 * ORBITAL_BOMBARDMENT_DAMAGE_PER_SHIP);
  });

  it('suppresses orbital bombardment while an opposing ship remains in the system', () => {
    const state = createInitialState();
    const draven = state.planets.find(planet => planet.id === 'draven')!;
    const target = { ...combatUnit('defender', 'infantry', 'enemy', 88), shields: 0 };
    state.battles = [{ planetId: draven.id, attackers: [combatUnit('attacker', 'infantry', 'player', 12)], defenders: [target] }];
    draven.orbitUnits = [
      { id: 'support', kind: 'escortFrigate', faction: 'player', hp: 260, maxHp: 260, shields: 130, maxShields: 130, orbitX: -500, orbitY: 0 },
      { id: 'blocker', kind: 'escortFrigate', faction: 'enemy', hp: 260, maxHp: 260, shields: 130, maxShields: 130, orbitX: 500, orbitY: 0 },
    ];

    const contested = tick(state, 2);
    expect(contested.battles[0].defenders[0].hp).toBe(target.hp);
  });
});
