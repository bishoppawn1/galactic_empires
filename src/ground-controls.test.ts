import { describe, expect, it } from 'vitest';
import { createInitialState, groundPositionBlocked, holdGroundUnits, isGameCommand, maneuverGroundUnits, ORBITAL_BOMBARDMENT_DAMAGE_PER_SHIP, tick, UNITS, type GroundUnitKind, type Unit } from './game';

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
    expect(isGameCommand({ type: 'battleManeuver', planetId: 'terra', unitIds: ['u1'], battleX: 42, battleY: 57, forceMove: true })).toBe(true);
    expect(isGameCommand({ type: 'battleManeuver', planetId: 'terra', unitIds: ['u1'], battleX: Number.NaN, battleY: 57 })).toBe(false);
    expect(isGameCommand({ type: 'battleManeuver', planetId: 'terra', unitIds: ['u1'], battleX: 42, battleY: 57, forceMove: 'yes' })).toBe(false);
    expect(isGameCommand({ type: 'battleHold', planetId: 'terra', unitIds: ['u1'] })).toBe(true);
  });

  it('moves selected troops toward separate formation positions', () => {
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

  it('keeps newly landed player troops still until their first order', () => {
    const state = createInitialState();
    const landed = { ...combatUnit('landed-squad', 'infantry', 'player', 12), battleHoldPosition: true };
    state.battles = [{ planetId: 'draven', attackers: [landed], defenders: [combatUnit('defender', 'infantry', 'enemy', 88)] }];

    const holding = tick(state, 3);
    expect(holding.battles[0].attackers[0]).toMatchObject({ battleX: 12, battleY: 50, battleHoldPosition: true });

    const ordered = maneuverGroundUnits(holding, 'draven', [landed.id], 45, 50);
    expect(ordered.ok).toBe(true);
    if (!ordered.ok) return;
    expect(ordered.state.battles[0].attackers[0].battleHoldPosition).toBeUndefined();
    expect(tick(ordered.state, 1).battles[0].attackers[0].battleX).toBeGreaterThan(12);
  });

  it('holds selected troops in place with H semantics while still returning fire in range', () => {
    const state = createInitialState();
    state.battles = [{
      planetId: 'draven',
      attackers: [combatUnit('holding-infantry', 'infantry', 'player', 40)],
      defenders: [combatUnit('attacking-artillery', 'artillery', 'enemy', 70)],
    }];

    const held = holdGroundUnits(state, 'draven', ['holding-infantry']);
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    const attacked = tick(held.state, 1);
    const unit = attacked.battles[0].attackers[0];
    expect(unit).toMatchObject({ battleX: 40, battleY: 50, battleHoldPosition: true, battleRetaliationTargetId: 'attacking-artillery' });

    const attackerInRange = attacked.battles[0].defenders[0];
    attackerInRange.battleX = 53;
    const shieldsBefore = attackerInRange.shields;
    const returnedFire = tick(attacked, 1);
    expect(returnedFire.battles[0].attackers[0].battleX).toBe(40);
    expect(returnedFire.battles[0].defenders[0].shields).toBeLessThan(shieldsBefore);
  });

  it('accepts a repeated destination as a forced move that ignores attackers until arrival', () => {
    const state = createInitialState();
    state.battles = [{
      planetId: 'draven',
      attackers: [combatUnit('forced-infantry', 'infantry', 'player', 40)],
      defenders: [combatUnit('interceptor', 'infantry', 'enemy', 52)],
    }];

    const first = maneuverGroundUnits(state, 'draven', ['forced-infantry'], 70, 50);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const repeated = maneuverGroundUnits(first.state, 'draven', ['forced-infantry'], 70, 50, true);
    expect(repeated.ok).toBe(true);
    if (!repeated.ok) return;
    const forcedUnit = repeated.state.battles[0].attackers[0];
    expect(forcedUnit.battleForceMove).toBe(true);
    expect(groundPositionBlocked('draven', { battleX: forcedUnit.battleTargetX!, battleY: forcedUnit.battleTargetY! })).toBe(false);

    const advancing = tick(repeated.state, 1);
    expect(advancing.battles[0].attackers[0].battleX).toBeGreaterThan(40);
    expect(advancing.battles[0].attackers[0].battleForceMove).toBe(true);
    expect(advancing.battles[0].defenders[0].shields).toBe(UNITS.infantry.shields);
  });

  it('abandons a move order and automatically fires when a hostile is already in range', () => {
    const state = createInitialState();
    state.battles = [{ planetId: 'draven', attackers: [combatUnit('a1', 'infantry', 'player', 40)], defenders: [combatUnit('d1', 'infantry', 'enemy', 52)] }];
    const ordered = maneuverGroundUnits(state, 'draven', ['a1'], 20, 30);
    expect(ordered.ok).toBe(true);
    if (!ordered.ok) return;
    const fired = tick(ordered.state, 1);
    expect(fired.battles[0].attackers[0].battleX).toBe(40);
    expect(fired.battles[0].attackers[0].battleTargetX).toBeUndefined();
    expect(fired.battles[0].attackers[0].battleRetaliationTargetId).toBe('d1');
    expect(fired.battles[0].defenders[0].shields).toBeLessThan(UNITS.infantry.shields);
  });

  it('abandons a move order to pursue a hostile that enters sight range', () => {
    const state = createInitialState();
    state.battles = [{
      planetId: 'draven',
      attackers: [combatUnit('scout', 'infantry', 'player', 40)],
      defenders: [{ ...combatUnit('spotted', 'infantry', 'enemy', 64), weaponCooldown: 999 }],
    }];
    const ordered = maneuverGroundUnits(state, 'draven', ['scout'], 20, 50);
    expect(ordered.ok).toBe(true);
    if (!ordered.ok) return;

    const pursuing = tick(ordered.state, 1);
    expect(pursuing.battles[0].attackers[0].battleX).toBeGreaterThan(40);
    expect(pursuing.battles[0].attackers[0].battleRetaliationTargetId).toBe('spotted');
    expect(pursuing.battles[0].attackers[0].battleTargetX).toBeUndefined();
    expect(pursuing.battles[0].attackers[0].battleTargetY).toBeUndefined();
  });

  it('keeps landed transports stationary, unarmed, and outside maneuver groups', () => {
    const state = createInitialState();
    const transport: Unit = {
      id: 'landed-transport',
      kind: 'transport',
      faction: 'player',
      hp: UNITS.transport.hp,
      maxHp: UNITS.transport.hp,
      shields: UNITS.transport.shields,
      maxShields: UNITS.transport.shields,
      battleX: 40,
      battleY: 50,
      landedTransport: true,
    };
    state.battles = [{
      planetId: 'draven',
      attackers: [transport],
      defenders: [combatUnit('defender', 'infantry', 'enemy', 50)],
    }];

    expect(maneuverGroundUnits(state, 'draven', [transport.id], 70, 70).ok).toBe(false);
    const advanced = tick(state, 1);
    expect(advanced.battles[0].attackers[0].battleX).toBe(40);
    expect(advanced.battles[0].attackers[0].battleY).toBe(50);
    expect(advanced.battles[0].attackers[0].weaponFlash ?? 0).toBe(0);
    expect(advanced.battles[0].defenders[0].shields).toBe(UNITS.infantry.shields);
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
