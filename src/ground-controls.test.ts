import { describe, expect, it } from 'vitest';
import { COALITION_GROUND_KINDS, BROOD_GROUND_KINDS, AEGIS_GROUND_KINDS, COVENANT_GROUND_KINDS, createInitialState, evacuateGroundTransports, groundFormationAliveCount, groundFormationSize, groundPositionBlocked, groundUnitVisionRange, holdGroundUnits, isFlyingGroundUnit, isGameCommand, loadGroundTransport, maneuverGroundUnits, ORBITAL_BOMBARDMENT_DAMAGE_PER_SHIP, tick, UNITS, type GroundUnitKind, type Unit } from './game';

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
    expect(isGameCommand({ type: 'battleLoad', planetId: 'terra', transportId: 't1', unitIds: ['u1'] })).toBe(true);
    expect(isGameCommand({ type: 'battleEvacuate', planetId: 'terra', transportIds: ['t1'] })).toBe(true);
  });

  it('adds two flying ground units with distinct sight ranges to every faction roster', () => {
    const flyingRoster = (kinds: GroundUnitKind[]) => kinds.filter(kind => isFlyingGroundUnit(combatUnit(kind, kind, 'player', 10)));
    expect(flyingRoster(COALITION_GROUND_KINDS)).toEqual(['dragonflyScout', 'falconGunship']);
    expect(flyingRoster(BROOD_GROUND_KINDS)).toEqual(['razorwing', 'sporewing']);
    expect(flyingRoster(AEGIS_GROUND_KINDS)).toEqual(['aegisSeraphSkimmer', 'aegisHaloGunship']);
    expect(flyingRoster(COVENANT_GROUND_KINDS)).toEqual(['covenantWaspDrone', 'covenantFurnaceGunship']);
    expect(groundUnitVisionRange(combatUnit('scout', 'dragonflyScout', 'player', 10))).toBeGreaterThan(groundUnitVisionRange(combatUnit('gunship', 'falconGunship', 'player', 10)));
  });

  it('groups ground forces into eight-, four-, two-, and one-model formations', () => {
    expect(groundFormationSize('infantry')).toBe(8);
    expect(groundFormationSize('broodling')).toBe(8);
    expect(groundFormationSize('lightTank')).toBe(4);
    expect(groundFormationSize('aegisRampartArtillery')).toBe(4);
    expect(groundFormationSize('siegeWalker')).toBe(2);
    expect(groundFormationSize('covenantJuggernaut')).toBe(2);
    expect(groundFormationSize('defenseTurret')).toBe(1);
    expect(groundFormationSize('transport')).toBe(1);
  });

  it('shares shields but assigns hull damage to one deterministic formation member', () => {
    const battleState = (shields: number) => {
      const state = createInitialState();
      const target = { ...combatUnit('target', 'artillery', 'enemy', 60), shields, maxShields: shields, weaponCooldown: 999 };
      state.battles = [{
        planetId: 'draven',
        attackers: [{ ...combatUnit('walker', 'siegeWalker', 'player', 40), weaponCooldown: 0 }],
        defenders: [target],
        focusTargetId: target.id,
      }];
      return tick(state, .1).battles[0].defenders[0];
    };

    const shielded = battleState(10);
    expect(shielded.shields).toBe(0);
    expect(shielded.memberHp).toHaveLength(4);
    expect(shielded.memberHp!.filter(hp => hp < shielded.maxHp / 4)).toHaveLength(1);
    expect(shielded.hp).toBeCloseTo(UNITS.artillery.hp - (UNITS.siegeWalker.weapon.damage - 10));
    expect(groundFormationAliveCount(shielded)).toBe(4);

    const exposed = battleState(0);
    expect(exposed.memberHp).toEqual(battleState(0).memberHp);
    expect(exposed.hp).toBeCloseTo(UNITS.artillery.hp - UNITS.artillery.hp / 4);
    expect(groundFormationAliveCount(exposed)).toBe(3);
  });

  it('reduces battalion firepower as individual members are lost', () => {
    const shieldLoss = (memberHp?: number[]) => {
      const state = createInitialState();
      const tank = { ...combatUnit('tank', 'lightTank', 'player', 40), weaponCooldown: 0, ...(memberHp ? { memberHp, hp: memberHp.reduce((total, hp) => total + hp, 0) } : {}) };
      const target = { ...combatUnit('target', 'artillery', 'enemy', 50), weaponCooldown: 999 };
      state.battles = [{ planetId: 'draven', attackers: [tank], defenders: [target], focusTargetId: target.id }];
      const damaged = tick(state, .1).battles[0].defenders[0];
      return target.shields - damaged.shields;
    };

    const memberMaximum = UNITS.lightTank.hp / 4;
    expect(shieldLoss()).toBeCloseTo(UNITS.lightTank.weapon.damage);
    expect(shieldLoss([0, memberMaximum, memberMaximum, memberMaximum])).toBeCloseTo(UNITS.lightTank.weapon.damage * .75);
  });

  it('removes player and enemy squads with no living formation members', () => {
    const state = createInitialState();
    const depletedMemberHp = Array.from({ length: groundFormationSize('infantry') }, () => 1e-7);
    const depletedHp = depletedMemberHp.reduce((total, hp) => total + hp, 0);
    const depleted = (id: string, faction: 'player' | 'enemy', battleX: number): Unit => ({
      ...combatUnit(id, 'infantry', faction, battleX),
      hp: depletedHp,
      shields: 0,
      memberHp: depletedMemberHp,
      weaponCooldown: 999,
    });
    state.battles = [{
      planetId: 'draven',
      attackers: [
        combatUnit('living-player', 'infantry', 'player', 10),
        depleted('depleted-player', 'player', 20),
      ],
      defenders: [
        combatUnit('living-enemy', 'infantry', 'enemy', 90),
        depleted('depleted-enemy', 'enemy', 80),
      ],
    }];

    const advanced = tick(state, .01);
    expect(advanced.battles[0].attackers.map(unit => unit.id)).toEqual(['living-player']);
    expect(advanced.battles[0].defenders.map(unit => unit.id)).toEqual(['living-enemy']);
  });

  it('moves ground units at half their defined tactical speed', () => {
    const state = createInitialState();
    state.battles = [{
      planetId: 'draven',
      attackers: [combatUnit('scout', 'dragonflyScout', 'player', 10)],
      defenders: [combatUnit('turret', 'defenseTurret', 'enemy', 98)],
    }];
    const ordered = maneuverGroundUnits(state, 'draven', ['scout'], 90, 50, true);
    expect(ordered.ok).toBe(true);
    if (!ordered.ok) return;

    const underway = tick(ordered.state, 1);
    expect(underway.battles[0].attackers[0].battleX).toBeCloseTo(17);
    expect(underway.battles[0].attackers[0].battleY).toBeCloseTo(50);
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

  it('keeps explicitly held troops still until their first movement order', () => {
    const state = createInitialState();
    const held = { ...combatUnit('held-squad', 'infantry', 'player', 12), battleHoldPosition: true };
    state.battles = [{ planetId: 'draven', attackers: [held], defenders: [combatUnit('defender', 'infantry', 'enemy', 88)] }];

    const holding = tick(state, 3);
    expect(holding.battles[0].attackers[0]).toMatchObject({ battleX: 12, battleY: 50, battleHoldPosition: true });

    const ordered = maneuverGroundUnits(holding, 'draven', [held.id], 45, 50);
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
      defenders: [combatUnit('attacking-artillery', 'artillery', 'enemy', 64)],
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
      defenders: [{ ...combatUnit('spotted', 'infantry', 'enemy', 61), weaponCooldown: 999 }],
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

  it('does not acquire unseen enemies but still retaliates after an unseen attacker fires', () => {
    const state = createInitialState();
    state.battles = [{
      planetId: 'draven',
      attackers: [{ ...combatUnit('infantry', 'infantry', 'player', 40), battleHoldPosition: true }],
      defenders: [{ ...combatUnit('artillery', 'artillery', 'enemy', 64), weaponCooldown: 999 }],
    }];

    const unaware = tick(state, 1);
    expect(unaware.battles[0].attackers[0].battleX).toBe(40);
    expect(unaware.battles[0].attackers[0].battleRetaliationTargetId).toBeUndefined();

    unaware.battles[0].defenders[0].weaponCooldown = 0;
    const attacked = tick(unaware, 1);
    expect(attacked.battles[0].attackers[0].battleRetaliationTargetId).toBe('artillery');
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

  it('loads battle squads into a grounded transport and evacuates the loaded craft to orbit', () => {
    const state = createInitialState();
    const draven = state.planets.find(planet => planet.id === 'draven')!;
    const transport: Unit = {
      id: 'landed-transport',
      kind: 'transport',
      faction: 'player',
      hp: UNITS.transport.hp,
      maxHp: UNITS.transport.hp,
      shields: UNITS.transport.shields,
      maxShields: UNITS.transport.shields,
      battleX: 20,
      battleY: 50,
      landedTransport: true,
      cargo: [],
      loadedUnitIds: [],
    };
    state.battles = [{
      planetId: draven.id,
      attackers: [combatUnit('boarding', 'infantry', 'player', 22), combatUnit('covering', 'infantry', 'player', 24), transport],
      defenders: [combatUnit('defender', 'infantry', 'enemy', 80)],
      attackerFaction: 'player',
    }];

    const loaded = loadGroundTransport(state, draven.id, transport.id, ['boarding']);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const grounded = loaded.state.battles[0].attackers.find(unit => unit.id === transport.id)!;
    expect(loaded.state.battles[0].attackers.map(unit => unit.id)).not.toContain('boarding');
    expect(grounded.cargo?.map(unit => unit.id)).toEqual(['boarding']);
    expect(grounded.loadedUnitIds).toEqual(['boarding']);

    const evacuated = evacuateGroundTransports(loaded.state, draven.id, [transport.id]);
    expect(evacuated.ok).toBe(true);
    if (!evacuated.ok) return;
    expect(evacuated.state.battles[0].attackers.map(unit => unit.id)).toEqual(['covering']);
    const orbiting = evacuated.state.planets.find(planet => planet.id === draven.id)!.orbitUnits.find(unit => unit.id === transport.id)!;
    expect(orbiting.landedTransport).toBeUndefined();
    expect(orbiting.cargo?.map(unit => unit.id)).toEqual(['boarding']);
    expect(orbiting.orbitX).toBe(0);
  });

  it('pursues an out-of-range artillery unit after taking fire and retaliates in range', () => {
    const state = createInitialState();
    state.battles = [{ planetId: 'draven', attackers: [combatUnit('infantry', 'infantry', 'player', 40)], defenders: [combatUnit('artillery', 'artillery', 'enemy', 64)] }];
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

  it('focuses orbital bombardment on one ground target until that target is destroyed', () => {
    const state = createInitialState();
    const draven = state.planets.find(planet => planet.id === 'draven')!;
    const primary = { ...combatUnit('primary-target', 'infantry', 'enemy', 88), hp: 3, shields: 0 };
    const secondary = { ...combatUnit('secondary-target', 'infantry', 'enemy', 96), shields: 0 };
    state.battles = [{
      planetId: draven.id,
      attackers: [combatUnit('attacker', 'infantry', 'player', 12)],
      defenders: [primary, secondary],
    }];
    draven.orbitUnits = [
      { id: 'support-1', kind: 'escortFrigate', faction: 'player', hp: 260, maxHp: 260, shields: 130, maxShields: 130 },
      { id: 'support-2', kind: 'transport', faction: 'player', hp: 360, maxHp: 360, shields: 180, maxShields: 180 },
    ];

    const focused = tick(state, 1);
    expect(focused.battles[0].defenders.find(unit => unit.id === primary.id)?.hp).toBe(1);
    expect(focused.battles[0].defenders.find(unit => unit.id === secondary.id)?.hp).toBe(secondary.hp);

    const destroyed = tick(focused, 1);
    expect(destroyed.battles[0].defenders.map(unit => unit.id)).toEqual([secondary.id]);
    expect(destroyed.battles[0].defenders[0].hp).toBe(secondary.hp);

    const reacquired = tick(destroyed, 1);
    expect(reacquired.battles[0].defenders[0].hp).toBeLessThan(secondary.hp);
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
