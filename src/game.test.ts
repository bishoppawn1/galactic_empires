import { describe, expect, it } from 'vitest';
import {
  beginResearch, constructBuilding, createCompetitiveState, createInitialState, dispatchSpaceUnit, dispatchSpaceUnits, dispatchTransport, dockSpaceUnit, dockSpaceUnits, maneuverSpaceUnit, maneuverSpaceUnits,
  applyGameCommand, defenseDurabilityMultiplier, findPlanetPath, groundProductionMultiplier, headingForVector, isGameCommand, migrateGameState, orbitalDamageMultiplier, phaseTravelMultiplier, queueUnit, recoverGroundUnits, recoverOrbitalDefense, recoverSpaceUnit, researchIncomeMultiplier, researchLabCount, researchProductionMultiplier, researchSpeedMultiplier, setOrbitFocusTarget, shieldRecoveryMultiplier, spaceProductionMultiplier, spaceYards, swapPlayerPerspective, tick, upgradeTitan, viewStateForFaction,
  localPlanetConnections, orbitalCombatShots,
  biomassCost, recoverableBiomass,
  AEGIS_GROUND_KINDS, AEGIS_GROUND_SHIELD_REGEN, AEGIS_SHIELD_REGEN_BONUS, AEGIS_SPACE_KINDS,
  BROOD_BIOMASS_PER_PLANET, BROOD_GROUND_KINDS, BROOD_SPACE_KINDS, BROOD_STARTING_BIOMASS, COALITION_GROUND_KINDS, COALITION_SPACE_KINDS, GRAVITY_WELL_RADIUS, LANDING_APPROACH_SPEED, MAX_COMMAND_UNIT_IDS, MAX_SHIP_ORBIT_RADIUS, MIN_SHIP_ORBIT_SEPARATION, ORBIT_MANEUVER_SPEED, PHASE_GATE_CHARGE_SECONDS, ORBITAL_DEFENSE_HULL_REGEN, ORBITAL_DEFENSE_SHIELD_REGEN, ORBITAL_DEFENSE_STATS, RESEARCH, RESEARCH_UNLOCKS, SPACE_COMBAT_DAMAGE_MULTIPLIER, TITAN_UPGRADES, UNITS, civilizationUnitKind, isTitanKind, unitRange, unitWeaponDamage, type GroundUnitKind, type PlayableFaction, type Unit, type UnitKind,
} from './game';

function expectOk<T extends { ok: boolean }>(result: T): asserts result is T & { ok: true } {
  expect(result.ok).toBe(true);
}

const makeUnit = (id: string, kind: UnitKind, faction: 'player' | 'enemy'): Unit => ({
  id, kind, faction, hp: UNITS[kind].hp, maxHp: UNITS[kind].hp, shields: UNITS[kind].shields, maxShields: UNITS[kind].shields,
});

const fullLandingApproachSeconds = Math.ceil((GRAVITY_WELL_RADIUS - 18) / LANDING_APPROACH_SPEED);

describe('unit weapon definitions', () => {
  it('gives every space and ground unit a distinct weapon profile', () => {
    const definitions = Object.values(UNITS);
    expect(new Set(definitions.map(definition => definition.weapon.label)).size).toBe(definitions.length);
    definitions.forEach(definition => {
      expect(definition.weapon.damage).toBeGreaterThan(0);
      expect(definition.weapon.cooldown).toBeGreaterThan(0);
      expect(definition.weapon.projectiles).toBeGreaterThan(0);
    });
  });

  it('defines escort lasers as frequent multi-shot fire and the missile frigate as one slow heavy launcher', () => {
    const lasers = UNITS.escortFrigate.weapon;
    const missile = UNITS.missileFrigate.weapon;
    expect(lasers).toMatchObject({ projectiles: 3, effect: 'laser' });
    expect(missile).toMatchObject({ projectiles: 1, effect: 'missile' });
    expect(lasers.cooldown).toBeLessThan(missile.cooldown);
    expect(lasers.damage * lasers.projectiles).toBeLessThan(missile.damage);
  });
});

function seedPlayerForces(state: ReturnType<typeof createInitialState>) {
  const terra = state.planets[0];
  terra.groundUnits = [makeUnit('u1', 'infantry', 'player'), makeUnit('u3', 'infantry', 'player'), makeUnit('u4', 'antiVehicle', 'player')];
  terra.orbitUnits = [
    { ...makeUnit('u2', 'transport', 'player'), orbitX: 0, orbitY: -180 },
    { ...makeUnit('u5', 'escortFrigate', 'player'), orbitX: 127, orbitY: -127 },
    { ...makeUnit('u6', 'missileFrigate', 'player'), orbitX: 180, orbitY: 0 },
  ];
  return terra;
}

function advanceFleetToArrival(input: ReturnType<typeof createInitialState>, unitId: string) {
  let state = input;
  for (let phase = 0; phase < 64; phase += 1) {
    const fleet = state.fleets.find(candidate => candidate.unit.id === unitId);
    if (!fleet) return state;
    state = tick(state, Math.max(.000001, fleet.travelTime - fleet.progress + 1e-9));
  }
  throw new Error(`Fleet ${unitId} did not arrive after 64 travel phases.`);
}

function addOrbitalDefense(state: ReturnType<typeof createInitialState>) {
  const cygnus = state.planets.find(p => p.id === 'cygnus')!;
  cygnus.buildings.push({ id: 'test-defense', kind: 'spaceDefense', hp: ORBITAL_DEFENSE_STATS.hp, maxHp: ORBITAL_DEFENSE_STATS.hp, shields: ORBITAL_DEFENSE_STATS.shields, maxShields: ORBITAL_DEFENSE_STATS.shields });
  return cygnus;
}

describe('economy and construction', () => {
  it('starts with all three mines on the homeworld', () => {
    const terra = createInitialState().planets[0];
    expect(terra.buildings.map(b => b.kind)).toEqual(expect.arrayContaining(['metalMine', 'crystalMine', 'goldMine']));
  });

  it('starts both factions on one world with equal stockpiles and no units', () => {
    const state = createInitialState({ mapSize: 'large', difficulty: 'admiral' });
    expect(state.planets.filter(planet => planet.owner === 'player')).toHaveLength(1);
    expect(state.planets.filter(planet => planet.owner === 'enemy')).toHaveLength(1);
    expect(state.planets.flatMap(planet => [...planet.groundUnits, ...planet.orbitUnits]).filter(unit => unit.faction !== 'neutral')).toHaveLength(0);
    expect(state.planets.filter(planet => planet.owner === null).every(planet =>
      planet.groundUnits.length >= 1 && planet.groundUnits.length <= 2
      && planet.groundUnits.every(unit => unit.faction === 'neutral') && !planet.orbitUnits.length)).toBe(true);
    expect(state.enemyResources).toEqual(state.resources);
    const playerBuildings = state.planets.find(planet => planet.owner === 'player')!.buildings.map(building => building.kind);
    const enemyBuildings = state.planets.find(planet => planet.owner === 'enemy')!.buildings.map(building => building.kind);
    expect(enemyBuildings).toEqual(playerBuildings);
  });

  it('mines resources indefinitely', () => {
    const state = createInitialState();
    const firstCentury = tick(state, 100);
    const secondCentury = tick(firstCentury, 100);
    expect(firstCentury.resources.metal - state.resources.metal).toBeCloseTo(280);
    expect(secondCentury.resources.metal - firstCentury.resources.metal).toBeCloseTo(280);
  });

  it('applies serializable multiplayer commands through the deterministic rules engine', () => {
    const state = createInitialState();
    const command = { type: 'construct', planetId: 'terra', kind: 'metalMine' } as const;
    expect(isGameCommand(command)).toBe(true);
    const result = applyGameCommand(state, command); expectOk(result);
    expect(result.state.planets[0].buildings.filter(building => building.kind === 'metalMine')).toHaveLength(2);
    expect(isGameCommand({ type: 'maneuver', planetId: 'terra', unitIds: [], orbitX: Infinity, orbitY: 0 })).toBe(false);
  });

  it('trades mineral resources in immutable three-to-one lots', () => {
    const state = createInitialState();
    const result = applyGameCommand(state, { type: 'trade', from: 'gold', to: 'metal' }); expectOk(result);
    expect(result.state.resources).toEqual({ metal: 570, crystal: 420, gold: 130 });
    expect(state.resources).toEqual({ metal: 520, crystal: 420, gold: 280 });
    expect(result.state.messages[0]).toBe('TRADE COMPLETE — 150 GOLD exchanged for 50 METAL.');
  });

  it('rejects unaffordable, same-resource, invalid, and biomass trades', () => {
    const state = createInitialState(); state.resources.gold = 149;
    const poorTrade = applyGameCommand(state, { type: 'trade', from: 'gold', to: 'metal' });
    expect(poorTrade.ok).toBe(false);
    expect(poorTrade.state).toBe(state);
    expect(isGameCommand({ type: 'trade', from: 'gold', to: 'gold' })).toBe(false);
    expect(isGameCommand({ type: 'trade', from: 'biomass', to: 'metal' })).toBe(false);
    const brood = createInitialState({ mapSize: 'small', difficulty: 'commander', playerFaction: 'brood' });
    const broodTrade = applyGameCommand(brood, { type: 'trade', from: 'gold', to: 'metal' });
    expect(broodTrade.ok).toBe(false);
  });

  it('accepts and applies formation orders for fleets larger than 70 ships', () => {
    const state = createInitialState(); const terra = state.planets[0];
    terra.orbitUnits = Array.from({ length: 96 }, (_, index) => ({ ...makeUnit(`large-fleet-${index}`, 'escortFrigate', 'player'), orbitX: index % 12, orbitY: Math.floor(index / 12) }));
    const unitIds = terra.orbitUnits.map(unit => unit.id);
    const command = { type: 'maneuver', planetId: terra.id, unitIds, orbitX: 340, orbitY: -180 } as const;
    expect(isGameCommand(command)).toBe(true);
    const result = applyGameCommand(state, command); expectOk(result);
    expect(result.state.planets[0].orbitUnits.filter(unit => unit.orbitTargetX !== undefined && unit.orbitTargetY !== undefined)).toHaveLength(96);
    expect(isGameCommand({ ...command, unitIds: Array.from({ length: MAX_COMMAND_UNIT_IDS + 1 }, (_, index) => `u${index}`) })).toBe(false);
  });

  it('charges complementary resources for each mine type', () => {
    const state = createInitialState(); const nyx = state.planets[1]; nyx.owner = 'player';
    const result = constructBuilding(state, nyx.id, 'metalMine'); expectOk(result);
    expect(result.state.resources).toEqual({ metal: 520, crystal: 340, gold: 235 });
  });

  it('uses building quantities and enforces each planet maximum', () => {
    let state = createInitialState(); state.resources = { metal: 5000, crystal: 5000, gold: 5000 };
    for (let count = 1; count < 5; count += 1) {
      const built = constructBuilding(state, 'terra', 'metalMine'); expectOk(built); state = built.state;
    }
    expect(state.planets[0].buildings.filter(b => b.kind === 'metalMine')).toHaveLength(5);
    expect(constructBuilding(state, 'terra', 'metalMine').ok).toBe(false);
    expect('tier' in state.planets[0].buildings[0]).toBe(false);
  });

  it('allows unlimited factories and space yards on every planet', () => {
    let state = createInitialState();
    state.resources = { metal: 100_000, crystal: 100_000, gold: 100_000 };
    state.completedResearch.push('advancedIndustry');
    const kinds = ['groundFactory', 'advancedGroundFactory', 'spaceFactory', 'advancedSpaceFactory'] as const;

    for (const kind of kinds) {
      const legacyMaximum = state.planets[0].buildingLimits[kind];
      while (state.planets[0].buildings.filter(building => building.kind === kind).length <= legacyMaximum) {
        const built = constructBuilding(state, 'terra', kind); expectOk(built); state = built.state;
      }
      expect(state.planets[0].buildings.filter(building => building.kind === kind)).toHaveLength(legacyMaximum + 1);
    }
  });
});

describe('starter faction foundations', () => {
  const broodConfig = { mapSize: 'small', difficulty: 'commander', playerFaction: 'brood' } as const;

  it('starts the Brood with biomass and no mineral extraction buildings', () => {
    const state = createInitialState(broodConfig); const terra = state.planets[0];
    expect(state.empireCivilizations.player).toBe('brood');
    expect(state.resources).toEqual({ metal: 0, crystal: 0, gold: 0, biomass: BROOD_STARTING_BIOMASS });
    expect(terra.buildings.map(building => building.kind)).toEqual(['groundFactory', 'spaceFactory']);
    expect(state.empireCivilizations.enemy).toBe('human');
  });

  it('grows biomass naturally from every controlled planet', () => {
    const state = createInitialState(broodConfig); state.enemyActionClock = 9999; state.enemyAttackClock = 9999;
    const before = state.resources.biomass!;
    const advanced = tick(state, 10);
    expect(advanced.resources.biomass! - before).toBe(BROOD_BIOMASS_PER_PLANET * 10);
    expect(advanced.resources).toMatchObject({ metal: 0, crystal: 0, gold: 0 });
    state.completedResearch.push('quantumExtraction');
    expect(tick(state, 10).resources.biomass! - before).toBe(BROOD_BIOMASS_PER_PLANET * 10 * 1.25);
  });

  it('pays biomass for structures and units while rejecting mineral mines', () => {
    const state = createInitialState(broodConfig);
    const built = constructBuilding(state, 'terra', 'groundDefense'); expectOk(built);
    expect(built.state.resources.biomass).toBe(BROOD_STARTING_BIOMASS - biomassCost({ metal: 100, crystal: 45, gold: 25 }));
    const queued = queueUnit(built.state, 'terra', 'broodling'); expectOk(queued);
    expect(queued.state.resources.biomass).toBe(built.state.resources.biomass! - biomassCost(UNITS.broodling.cost));
    expect(queued.state.planets[0].groundQueue[0].kind).toBe('broodling');
    const coalitionUnit = queueUnit(queued.state, 'terra', 'infantry');
    expect(coalitionUnit.ok).toBe(false);
    const mine = constructBuilding(queued.state, 'terra', 'metalMine');
    expect(mine.ok).toBe(false);
    if (!mine.ok) expect(mine.error).toContain('naturally');
  });

  it('harvests destroyed enemy ground forces in a Brood battle', () => {
    const state = createInitialState(broodConfig); state.enemyActionClock = 9999; state.enemyAttackClock = 9999;
    const attacker = { ...makeUnit('brood-siege', 'siegeCrawler', 'player'), battleX: 40, battleY: 50 };
    const victim = { ...makeUnit('harvested-infantry', 'infantry', 'enemy'), hp: 1, shields: 0, battleX: 60, battleY: 50 };
    state.battles = [{ planetId: 'draven', attackerFaction: 'player', attackers: [attacker], defenders: [victim] }];
    const before = state.resources.biomass!;
    const resolved = tick(state, 1);
    expect(resolved.resources.biomass).toBe(before + BROOD_BIOMASS_PER_PLANET + recoverableBiomass([victim]));
    expect(resolved.messages.some(message => message.includes('BROOD HARVEST'))).toBe(true);
  });

  it('recycles its own destroyed ships and their dead cargo', () => {
    const state = createInitialState(broodConfig); const terra = state.planets[0];
    state.enemyActionClock = 9999; state.enemyAttackClock = 9999;
    const doomed = { ...makeUnit('doomed-spore-ark', 'sporeArk', 'player'), hp: 1, shields: 0, orbitX: 0, orbitY: 0, cargo: [makeUnit('lost-brood', 'broodling', 'player')] };
    terra.orbitUnits = [doomed, { ...makeUnit('executioner', 'dreadnought', 'enemy'), orbitX: 80, orbitY: 0 }];
    const before = state.resources.biomass!;
    const resolved = tick(state, .1);
    expect(resolved.planets[0].orbitUnits.some(unit => unit.id === doomed.id)).toBe(false);
    expect(resolved.resources.biomass).toBeCloseTo(before + BROOD_BIOMASS_PER_PLANET * .1 + recoverableBiomass([doomed]));
  });

  it('swaps civilization identities with multiplayer command perspective', () => {
    const state = createCompetitiveState(broodConfig, [
      { faction: 'player', controller: 'human', civilization: 'brood' },
      { faction: 'enemy', controller: 'human', civilization: 'aegis' },
    ]);
    const rivalView = viewStateForFaction(state, 'enemy');
    expect(rivalView.empireCivilizations).toMatchObject({ player: 'aegis', enemy: 'brood' });
    expect(viewStateForFaction(rivalView, 'enemy')).toEqual(state);
  });

  it('lets an AI-controlled Brood empire spend its biomass economy', () => {
    const state = createCompetitiveState(broodConfig, [
      { faction: 'player', controller: 'human', civilization: 'human' },
      { faction: 'enemy', controller: 'ai', civilization: 'brood' },
    ]);
    state.enemyActionClock = 0; state.enemyAttackClock = 9999;
    const advanced = tick(state, .1); const enemyHome = advanced.planets.find(planet => planet.owner === 'enemy')!;
    expect(enemyHome.buildings.some(building => ['metalMine', 'crystalMine', 'goldMine'].includes(building.kind))).toBe(false);
    expect(enemyHome.buildings.filter(building => building.kind === 'groundFactory')).toHaveLength(2);
    expect(enemyHome.groundQueue.length).toBeGreaterThan(0);
    expect(enemyHome.groundQueue.every(item => BROOD_GROUND_KINDS.includes(item.kind as GroundUnitKind))).toBe(true);
    const enemySpaceQueue = enemyHome.buildings.flatMap(building => building.spaceQueue ?? []);
    expect(enemySpaceQueue.length).toBeGreaterThan(0);
    expect(enemySpaceQueue.every(item => BROOD_SPACE_KINDS.includes(item.kind as typeof BROOD_SPACE_KINDS[number]))).toBe(true);
    expect(advanced.enemyResources.biomass).toBeLessThan(BROOD_STARTING_BIOMASS);
  });

  it('provides a complete production roster that never overlaps Coalition units', () => {
    expect(BROOD_GROUND_KINDS).toHaveLength(9);
    expect(BROOD_SPACE_KINDS).toHaveLength(8);
    const coalitionKinds = new Set<UnitKind>([...COALITION_GROUND_KINDS, ...COALITION_SPACE_KINDS]);
    expect(BROOD_GROUND_KINDS.filter(kind => coalitionKinds.has(kind))).toEqual([]);
    expect(BROOD_SPACE_KINDS.filter(kind => coalitionKinds.has(kind))).toEqual([]);
    expect(BROOD_GROUND_KINDS.map(kind => UNITS[kind].label)).toEqual(expect.arrayContaining(['Broodling Pack', 'Spore Lobber', 'Siege Crawler']));
    expect(BROOD_SPACE_KINDS.map(kind => UNITS[kind].label)).toEqual(expect.arrayContaining(['Spore Ark', 'Brood Carrier', 'World Eater']));

    const coalition = createInitialState();
    expect(queueUnit(coalition, 'terra', 'broodling').ok).toBe(false);
    expect(queueUnit(coalition, 'terra', 'sporeArk').ok).toBe(false);
  });

  it('upgrades legacy Brood saves from Coalition units to living equivalents', () => {
    const legacy = createInitialState(broodConfig); const terra = legacy.planets[0];
    terra.groundUnits = [{ ...makeUnit('legacy-infantry', 'infantry', 'player'), hp: 50, shields: 10 }];
    terra.orbitUnits = [{ ...makeUnit('legacy-transport', 'transport', 'player'), cargo: [makeUnit('legacy-cargo', 'antiVehicle', 'player')] }];
    terra.groundQueue = [{ id: 'legacy-ground-queue', kind: 'artillery', remaining: 5, total: 24 }];
    terra.buildings.find(building => building.kind === 'spaceFactory')!.spaceQueue = [{ id: 'legacy-space-queue', kind: 'escortFrigate', remaining: 8, total: 26 }];

    const migrated = migrateGameState(legacy); const home = migrated.planets[0];
    expect(home.groundUnits[0]).toMatchObject({ kind: 'broodling', hp: UNITS.broodling.hp / 2, shields: 0 });
    expect(home.orbitUnits[0].kind).toBe('sporeArk');
    expect(home.orbitUnits[0].cargo?.[0].kind).toBe('acidSpitter');
    expect(home.groundQueue[0].kind).toBe('sporeLobber');
    expect(home.buildings.find(building => building.kind === 'spaceFactory')?.spaceQueue?.[0].kind).toBe('clawFrigate');
  });

  it('gives the Aegis Directorate a separate durable production roster', () => {
    const state = createInitialState({ mapSize: 'small', difficulty: 'commander', playerFaction: 'aegis' });
    state.resources = { metal: 10_000, crystal: 10_000, gold: 10_000 };
    expect(AEGIS_GROUND_KINDS).toHaveLength(5);
    expect(AEGIS_SPACE_KINDS).toHaveLength(6);
    expect(UNITS.aegisWarden.shields).toBeGreaterThan(UNITS.infantry.shields);
    expect(UNITS.aegisShieldMonitor.shields).toBeGreaterThan(UNITS.escortFrigate.shields);
    expect(queueUnit(state, 'terra', 'infantry').ok).toBe(false);
    const queued = queueUnit(state, 'terra', 'aegisWarden'); expectOk(queued);
    expect(tick(queued.state, UNITS.aegisWarden.time!).planets[0].groundUnits.some(unit => unit.kind === 'aegisWarden')).toBe(true);
  });

  it('gives every Aegis unit its own tactical ability', () => {
    const kinds = [...AEGIS_GROUND_KINDS, ...AEGIS_SPACE_KINDS];
    const abilities = kinds.map(kind => UNITS[kind].ability?.kind);
    expect(abilities.every(Boolean)).toBe(true);
    expect(new Set(abilities).size).toBe(kinds.length);
  });

  it('regenerates Aegis shields faster in orbit and during ground combat', () => {
    const ship = { ...makeUnit('monitor', 'aegisShieldMonitor', 'player'), shields: 10 };
    expect(recoverSpaceUnit(ship, false, 2, 'aegis').shields).toBe(10 + 2 * (5 + AEGIS_SHIELD_REGEN_BONUS));
    const state = createInitialState({ mapSize: 'small', difficulty: 'commander', playerFaction: 'aegis' });
    state.enemyActionClock = 9999; state.enemyAttackClock = 9999;
    const warden = { ...makeUnit('warden', 'aegisWarden', 'player'), shields: 20, battleX: 8, battleY: 50, battleTargetX: 8, battleTargetY: 50 };
    const enemy = { ...makeUnit('distant-enemy', 'infantry', 'enemy'), battleX: 92, battleY: 50, battleTargetX: 92, battleTargetY: 50 };
    state.battles = [{ planetId: 'draven', attackerFaction: 'player', attackers: [warden], defenders: [enemy] }];
    expect(tick(state, 2).battles[0].attackers[0].shields).toBe(20 + 2 * AEGIS_GROUND_SHIELD_REGEN);
  });

  it('uses Warden walls, Paladin interception, and anchored Bastion armor to protect a ground formation', () => {
    const state = createInitialState({ mapSize: 'small', difficulty: 'commander', playerFaction: 'aegis' });
    state.enemyActionClock = 9999; state.enemyAttackClock = 9999;
    const target = { ...makeUnit('target', 'aegisRampartArtillery', 'player'), battleX: 50, battleY: 50 };
    const warden = { ...makeUnit('warden', 'aegisWarden', 'player'), battleX: 52, battleY: 50 };
    const paladin = { ...makeUnit('paladin', 'aegisPaladinGuard', 'player'), battleX: 54, battleY: 50 };
    const tank = { ...makeUnit('tank', 'aegisBastionTank', 'player'), battleX: 50, battleY: 65 };
    const targetShooter = { ...makeUnit('target-shooter', 'infantry', 'enemy'), battleX: 60, battleY: 50 };
    const tankShooter = { ...makeUnit('tank-shooter', 'infantry', 'enemy'), battleX: 60, battleY: 65 };
    state.battles = [{ planetId: 'draven', attackers: [targetShooter], defenders: [target, warden, paladin], enemyFocusTargetId: target.id }];
    const battle = tick(state, .1).battles[0];
    const protectedTarget = battle.defenders.find(unit => unit.id === target.id)!;
    const guardingPaladin = battle.defenders.find(unit => unit.id === paladin.id)!;
    expect(target.maxShields - protectedTarget.shields).toBeCloseTo(3 * .6 * .8);
    expect(paladin.maxShields - guardingPaladin.shields).toBeCloseTo(3 * .4 * .8);

    const anchorState = createInitialState({ mapSize: 'small', difficulty: 'commander', playerFaction: 'aegis' });
    anchorState.enemyActionClock = 9999; anchorState.enemyAttackClock = 9999;
    anchorState.battles = [{ planetId: 'draven', attackers: [tankShooter], defenders: [tank], enemyFocusTargetId: tank.id }];
    const anchored = tick(anchorState, .1).battles[0].defenders[0];
    expect(tank.maxShields - anchored.shields).toBeCloseTo(3 * .65);
  });

  it('lets Rampart batteries punish movement and Fortress Walkers damage clustered ground targets', () => {
    const state = createInitialState({ mapSize: 'small', difficulty: 'commander', playerFaction: 'aegis' });
    state.enemyActionClock = 9999; state.enemyAttackClock = 9999;
    const rampart = { ...makeUnit('rampart', 'aegisRampartArtillery', 'player'), battleX: 40, battleY: 30 };
    const moving = { ...makeUnit('moving', 'infantry', 'enemy'), battleX: 65, battleY: 30, battleTargetX: 85, battleTargetY: 30 };
    state.battles = [{ planetId: 'draven', attackers: [rampart], defenders: [moving], focusTargetId: moving.id }];
    const advanced = tick(state, .1).battles[0];
    const movedTarget = advanced.defenders.find(unit => unit.id === moving.id)!;
    expect(moving.hp + moving.shields - movedTarget.hp - movedTarget.shields).toBeCloseTo(28 * 1.75);

    const splashState = createInitialState({ mapSize: 'small', difficulty: 'commander', playerFaction: 'aegis' });
    splashState.enemyActionClock = 9999; splashState.enemyAttackClock = 9999;
    const walker = { ...makeUnit('walker', 'aegisFortressWalker', 'player'), battleX: 40, battleY: 70 };
    const primary = { ...makeUnit('primary', 'lightTank', 'enemy'), battleX: 65, battleY: 70 };
    const secondary = { ...makeUnit('secondary', 'lightTank', 'enemy'), battleX: 67, battleY: 70 };
    splashState.battles = [{ planetId: 'draven', attackers: [walker], defenders: [primary, secondary], focusTargetId: primary.id }];
    const splashed = tick(splashState, .1).battles[0].defenders.find(unit => unit.id === secondary.id)!;
    expect(secondary.hp + secondary.shields - splashed.hp - splashed.shields).toBeCloseTo(52 * .45);
  });

  it('projects Monitor shields and repairs nearby ships with Citadel drones during combat', () => {
    const fleetState = (withSupport: boolean) => {
      const state = createInitialState({ mapSize: 'small', difficulty: 'commander', playerFaction: 'aegis' });
      state.enemyActionClock = 9999; state.enemyAttackClock = 9999;
      const planet = state.planets[0];
      const ally = { ...makeUnit('ally', 'aegisLanceFrigate', 'player'), hp: 200, shields: 100, orbitX: 0, orbitY: 0 };
      const support = withSupport ? [
        { ...makeUnit('monitor', 'aegisShieldMonitor', 'player'), orbitX: 80, orbitY: 0 },
        { ...makeUnit('carrier', 'aegisCitadelCarrier', 'player'), orbitX: 100, orbitY: 0 },
      ] : [];
      planet.orbitUnits = [ally, ...support, { ...makeUnit('enemy', 'missileFrigate', 'enemy'), orbitX: 280, orbitY: 0 }];
      return tick(state, 1).planets[0].orbitUnits.find(unit => unit.id === ally.id)!;
    };
    const unsupported = fleetState(false);
    const supported = fleetState(true);
    expect(supported.shields).toBeGreaterThan(unsupported.shields);
    expect(supported.hp).toBeGreaterThan(unsupported.hp + 5);
  });

  it('gives Aegis orbital specialists positional targeting behavior', () => {
    const planet = createInitialState({ mapSize: 'small', difficulty: 'commander', playerFaction: 'aegis' }).planets[0];
    const lance = { ...makeUnit('lance', 'aegisLanceFrigate', 'player'), orbitX: 0, orbitY: 0 };
    const target = { ...makeUnit('target', 'transport', 'enemy'), orbitX: 400, orbitY: 0 };
    const ward = { ...makeUnit('ward', 'aegisWardCruiser', 'enemy'), orbitX: 420, orbitY: 0 };
    planet.orbitUnits = [lance, target, ward];
    const lanceShot = orbitalCombatShots(planet).find(shot => shot.attackerId === lance.id)!;
    expect(lanceShot.targetId).toBe(ward.id);
    expect(lanceShot.damageMultiplier).toBeCloseTo(1 + .7 * (420 / UNITS.aegisLanceFrigate.range));

    const sovereign = { ...makeUnit('sovereign', 'aegisSovereignDreadnought', 'player'), orbitX: 0, orbitY: 0 };
    const clusteredA = { ...makeUnit('cluster-a', 'escortFrigate', 'enemy'), orbitX: 300, orbitY: 0 };
    const clusteredB = { ...makeUnit('cluster-b', 'escortFrigate', 'enemy'), orbitX: 320, orbitY: 0 };
    planet.orbitUnits = [sovereign, clusteredA, clusteredB];
    const barrage = orbitalCombatShots(planet).filter(shot => shot.attackerId === sovereign.id);
    expect(barrage.map(shot => shot.targetId)).toEqual([clusteredA.id, clusteredB.id]);
    expect(barrage[1].damageMultiplier).toBe(.35);
  });

  it('hardens a Bastion Lander only during its troop approach', () => {
    const shieldAfterVolley = (pendingEmbark: boolean) => {
      const state = createInitialState({ mapSize: 'small', difficulty: 'commander', playerFaction: 'aegis' });
      state.enemyActionClock = 9999; state.enemyAttackClock = 9999;
      const planet = state.planets[0];
      const lander = { ...makeUnit('lander', 'aegisBastionLander', 'player'), orbitX: 0, orbitY: 0, ...(pendingEmbark ? { pendingEmbark: true, orbitTargetX: 500, orbitTargetY: 0 } : {}) };
      planet.orbitUnits = [lander, { ...makeUnit('enemy', 'missileFrigate', 'enemy'), orbitX: 180, orbitY: 0 }];
      return tick(state, .1).planets[0].orbitUnits.find(unit => unit.id === lander.id)!.shields;
    };
    const normalLoss = UNITS.aegisBastionLander.shields - shieldAfterVolley(false);
    const approachLoss = UNITS.aegisBastionLander.shields - shieldAfterVolley(true);
    expect(approachLoss).toBeCloseTo(normalLoss * .55);
  });

  it('makes an AI Aegis empire build only Aegis units', () => {
    const state = createCompetitiveState({ mapSize: 'small', difficulty: 'commander' }, [
      { faction: 'player', controller: 'human', civilization: 'human' },
      { faction: 'enemy', controller: 'ai', civilization: 'aegis' },
    ]);
    state.enemyActionClock = 0; state.enemyAttackClock = 9999;
    const advanced = tick(state, .1); const enemyHome = advanced.planets.find(planet => planet.owner === 'enemy')!;
    const queuedKinds = [...enemyHome.groundQueue, ...spaceYards(enemyHome).flatMap(yard => yard.spaceQueue ?? [])].map(item => item.kind);
    const aegisKinds = new Set<UnitKind>([...AEGIS_GROUND_KINDS, ...AEGIS_SPACE_KINDS]);
    expect(queuedKinds.length).toBeGreaterThan(0);
    expect(queuedKinds.every(kind => aegisKinds.has(kind))).toBe(true);
  });
});

describe('campaign configuration', () => {
  it('creates the requested number of worlds for every map size', () => {
    expect(createInitialState({ mapSize: 'small', difficulty: 'commander' }).planets).toHaveLength(7);
    expect(createInitialState({ mapSize: 'medium', difficulty: 'commander' }).planets).toHaveLength(11);
    expect(createInitialState({ mapSize: 'large', difficulty: 'commander' }).planets).toHaveLength(15);
    expect(createInitialState({ mapSize: 'huge', difficulty: 'commander' }).planets).toHaveLength(21);
  });

  it('changes AI cadence by difficulty without granting starting forces', () => {
    const cadet = createInitialState({ mapSize: 'large', difficulty: 'cadet' });
    const admiral = createInitialState({ mapSize: 'large', difficulty: 'admiral' });
    expect(admiral.enemyAttackClock).toBeLessThan(cadet.enemyAttackClock);
    expect(admiral.planets.flatMap(planet => [...planet.groundUnits, ...planet.orbitUnits]).filter(unit => unit.faction !== 'neutral')).toHaveLength(0);
    expect(cadet.planets.flatMap(planet => [...planet.groundUnits, ...planet.orbitUnits]).filter(unit => unit.faction !== 'neutral')).toHaveLength(0);
  });

  it('assigns a sensible configuration to an older save', () => {
    const legacy = createInitialState({ mapSize: 'small', difficulty: 'commander' });
    delete (legacy as Partial<typeof legacy>).config;
    delete (legacy as Partial<typeof legacy>).enemyMissionCount;
    const migrated = migrateGameState(legacy);
    expect(migrated.config).toEqual({ mapSize: 'small', difficulty: 'commander', playerFaction: 'human' });
    expect(migrated.enemyMissionCount).toBe(0);
  });

  it('repairs missing research and collection fields in older saves', () => {
    const legacy = createInitialState({ mapSize: 'small', difficulty: 'commander' });
    const damaged = legacy as unknown as Record<string, unknown>;
    for (const key of ['fleets', 'battles', 'completedResearch', 'enemyCompletedResearch', 'researchQueue', 'enemyResearchQueue', 'messages', 'empireCivilizations']) delete damaged[key];
    delete (legacy.planets[0] as Partial<typeof legacy.planets[0]>).groundQueue;
    delete (legacy.planets[0] as Partial<typeof legacy.planets[0]>).spaceQueue;

    const migrated = migrateGameState(legacy);
    expect(migrated.fleets).toEqual([]);
    expect(migrated.battles).toEqual([]);
    expect(migrated.completedResearch).toEqual([]);
    expect(migrated.enemyCompletedResearch).toEqual([]);
    expect(migrated.researchQueue).toEqual([]);
    expect(migrated.enemyResearchQueue).toEqual([]);
    expect(migrated.empireCivilizations).toMatchObject({ player: 'human', enemy: 'human' });
    expect(migrated.planets[0].groundQueue).toEqual([]);
    expect(migrated.messages[0]).toContain('RECOVERED');
    expect(() => tick(migrated, .1)).not.toThrow();
  });

  it('adds neutral garrisons to older saves exactly once', () => {
    const legacy = createInitialState({ mapSize: 'small', difficulty: 'commander' });
    legacy.planets.filter(planet => planet.owner === null).forEach(planet => { planet.groundUnits = []; });
    delete (legacy as Partial<typeof legacy>).neutralGarrisonsInitialized;
    const migrated = migrateGameState(legacy);
    const firstCounts = migrated.planets.filter(planet => planet.owner === null).map(planet => planet.groundUnits.length);
    expect(firstCounts.every(count => count >= 1 && count <= 2)).toBe(true);
    expect(migrateGameState(migrated).planets.filter(planet => planet.owner === null).map(planet => planet.groundUnits.length)).toEqual(firstCounts);
  });
});

describe('competitive multiplayer', () => {
  it('creates four different empires on a larger map and preserves AI slot ownership', () => {
    const state = createCompetitiveState({ mapSize: 'small', difficulty: 'commander' }, [
      { faction: 'player', controller: 'human' },
      { faction: 'enemy', controller: 'human' },
      { faction: 'rival2', controller: 'ai' },
      { faction: 'rival3', controller: 'human' },
    ]);
    expect(state.config.mapSize).toBe('huge');
    expect(state.planets).toHaveLength(21);
    expect(new Set(state.planets.filter(planet => planet.owner !== null).map(planet => planet.owner))).toEqual(new Set(['player', 'enemy', 'rival2', 'rival3']));
    expect(state.aiFactions).toEqual(['rival2']);
    expect(state.additionalEmpires?.rival2?.resources).toEqual(state.resources);
    expect(state.additionalEmpires?.rival3?.resources).toEqual(state.resources);
  });

  it('gives a third commander an independent reversible perspective and economy', () => {
    const canonical = createCompetitiveState(undefined, [
      { faction: 'player', controller: 'human' },
      { faction: 'enemy', controller: 'human' },
      { faction: 'rival2', controller: 'human' },
    ]);
    const thirdView = viewStateForFaction(canonical, 'rival2');
    expect(thirdView.planets.find(planet => planet.id === 'halcyon')?.owner).toBe('player');
    expect(thirdView.planets.find(planet => planet.id === 'terra')?.owner).toBe('rival2');
    const built = applyGameCommand(thirdView, { type: 'construct', planetId: 'halcyon', kind: 'metalMine' }); expectOk(built);
    const updatedCanonical = viewStateForFaction(built.state, 'rival2');
    expect(updatedCanonical.additionalEmpires?.rival2?.resources).toEqual({ metal: 520, crystal: 340, gold: 235 });
    expect(viewStateForFaction(thirdView, 'rival2')).toEqual(canonical);
  });

  it('gives the rival an independent player perspective and economy', () => {
    const canonical = createCompetitiveState({ mapSize: 'small', difficulty: 'admiral' });
    const rivalView = swapPlayerPerspective(canonical);
    expect(rivalView.planets.find(planet => planet.id === 'cygnus')!.owner).toBe('player');
    expect(rivalView.planets.find(planet => planet.id === 'terra')!.owner).toBe('enemy');

    const built = applyGameCommand(rivalView, { type: 'construct', planetId: 'cygnus', kind: 'metalMine' }); expectOk(built);
    const updatedCanonical = swapPlayerPerspective(built.state);
    expect(updatedCanonical.enemyResources).toEqual({ metal: 520, crystal: 340, gold: 235 });
    expect(updatedCanonical.resources).toEqual(canonical.resources);
    expect(updatedCanonical.planets.find(planet => planet.id === 'cygnus')!.buildings.filter(building => building.kind === 'metalMine')).toHaveLength(2);
    expect(updatedCanonical.planets.find(planet => planet.id === 'terra')!.buildings.filter(building => building.kind === 'metalMine')).toHaveLength(1);
  });

  it('applies a guest resource trade only to that empire', () => {
    const canonical = createCompetitiveState();
    const guestView = viewStateForFaction(canonical, 'enemy');
    const traded = applyGameCommand(guestView, { type: 'trade', from: 'gold', to: 'metal' }); expectOk(traded);
    const updatedCanonical = viewStateForFaction(traded.state, 'enemy');
    expect(updatedCanonical.enemyResources).toEqual({ metal: 570, crystal: 420, gold: 130 });
    expect(updatedCanonical.resources).toEqual(canonical.resources);
  });

  it('applies a guest ship order to the host state', () => {
    const canonical = createCompetitiveState();
    const guestView = viewStateForFaction(canonical, 'enemy');
    const guestHome = guestView.planets.find(planet => planet.owner === 'player')!;
    const yardId = spaceYards(guestHome)[0].id;

    const preview = applyGameCommand(guestView, { type: 'queueUnit', planetId: guestHome.id, kind: 'transport', yardIds: [yardId] });
    expectOk(preview);
    const updatedCanonical = viewStateForFaction(preview.state, 'enemy');

    expect(spaceYards(updatedCanonical.planets.find(planet => planet.id === guestHome.id)!)[0].spaceQueue?.[0].kind).toBe('transport');
    expect(updatedCanonical.enemyResources).toEqual({ metal: 450, crystal: 372, gold: 260 });
    expect(updatedCanonical.resources).toEqual(canonical.resources);
  });

  it('keeps both empires symmetric and disables strategic AI actions', () => {
    const state = createCompetitiveState({ mapSize: 'medium', difficulty: 'admiral' });
    const firstBefore = { ...state.resources }, secondBefore = { ...state.enemyResources };
    const advanced = tick(state, 100);
    for (const resource of ['metal', 'crystal', 'gold'] as const) {
      expect(advanced.resources[resource] - firstBefore[resource]).toBeCloseTo(advanced.enemyResources[resource] - secondBefore[resource]);
    }
    expect(advanced.planets.find(planet => planet.id === 'terra')!.buildings).toHaveLength(5);
    expect(advanced.planets.find(planet => planet.id === 'cygnus')!.buildings).toHaveLength(5);
    expect(advanced.enemyCompletedResearch).toHaveLength(0);
  });

  it('swaps separate research queues and targeting orders reversibly', () => {
    const state = createCompetitiveState();
    state.researchQueue.push({ id: 'advancedIndustry', remaining: 12, total: 45 });
    state.enemyResearchQueue.push({ id: 'groundWarfare', remaining: 18, total: 55 });
    state.planets[0].orbitFocusTargetId = 'host-target';
    state.planets[0].enemyOrbitFocusTargetId = 'rival-target';
    const rivalView = swapPlayerPerspective(state);
    expect(rivalView.researchQueue[0].id).toBe('groundWarfare');
    expect(rivalView.planets[0].orbitFocusTargetId).toBe('rival-target');
    expect(swapPlayerPerspective(rivalView)).toEqual(state);
  });

  it('preserves Titan travel and refits through multiplayer perspective translation', () => {
    const state = createCompetitiveState();
    state.planets[0].orbitUnits = [{
      ...makeUnit('multiplayer-titan', 'dreadnought', 'player'), orbitX: 180, orbitY: 0,
      titanUpgrades: ['siegeCore'],
    }];

    const rivalView = swapPlayerPerspective(state);
    const inspected = rivalView.planets[0].orbitUnits[0];
    expect(inspected).toMatchObject({ faction: 'enemy', titanUpgrades: ['siegeCore'] });
    expect(swapPlayerPerspective(rivalView)).toEqual(state);
  });

  it('scales each multiplayer empire research queue from its own labs', () => {
    const state = createCompetitiveState();
    const terra = state.planets.find(planet => planet.id === 'terra')!;
    const cygnus = state.planets.find(planet => planet.id === 'cygnus')!;
    terra.buildings.push({ id: 'host-lab', kind: 'researchLab' });
    cygnus.buildings.push({ id: 'guest-lab-1', kind: 'researchLab' }, { id: 'guest-lab-2', kind: 'researchLab' }, { id: 'guest-lab-3', kind: 'researchLab' });
    state.researchQueue.push({ id: 'advancedIndustry', remaining: 45, total: 45 });
    state.enemyResearchQueue.push({ id: 'advancedIndustry', remaining: 45, total: 45 });

    const progressed = tick(state, 10);
    expect(progressed.researchQueue[0].remaining).toBe(35);
    expect(progressed.enemyResearchQueue[0].remaining).toBe(25);
  });
});

describe('galaxy routes', () => {
  it('only connects nearby planets', () => {
    const connections = localPlanetConnections(createInitialState().planets);
    expect(connections.length).toBeGreaterThan(0);
    expect(connections.every(connection => connection.distance <= 42)).toBe(true);
    expect(connections.some(connection => connection.from.id === 'terra' && connection.to.id === 'vesta')).toBe(false);
  });

  it('finds the shortest multi-lane route between distant planets', () => {
    const state = createInitialState();
    const path = findPlanetPath(state.planets, 'terra', 'vesta')!;
    expect(path[0]).toBe('terra');
    expect(path.at(-1)).toBe('vesta');
    expect(path.length).toBeGreaterThan(2);
    const connections = localPlanetConnections(state.planets);
    expect(path.slice(1).every((planetId, index) => connections.some(connection => {
      const previousId = path[index];
      return (connection.from.id === previousId && connection.to.id === planetId) || (connection.to.id === previousId && connection.from.id === planetId);
    }))).toBe(true);
  });
});

describe('production and research', () => {
  it('defines four tiers of research with fifteen visible unlock packages', () => {
    expect(Object.keys(RESEARCH)).toHaveLength(15);
    expect(RESEARCH.heavyArmor.requires).toBe('groundWarfare');
    expect(RESEARCH.carrierOperations.requires).toBe('fleetLogistics');
    expect(RESEARCH.titanEngineering.requires).toBe('capitalShips');
    expect(RESEARCH_UNLOCKS.titanEngineering).toContain('Titan Dreadnought');
    expect(RESEARCH_UNLOCKS.rapidFabrication).toContain('+25% unit production speed');
  });

  it('requires advanced factories for heavy ground units and capital hulls', () => {
    const state = createInitialState();
    state.resources = { metal: 5000, crystal: 5000, gold: 5000 };
    state.completedResearch.push('advancedIndustry', 'groundWarfare', 'heavyArmor', 'orbitalEngineering', 'capitalShips');
    expect(queueUnit(state, 'terra', 'plasmaTank').ok).toBe(false);
    state.planets[0].buildings.push({ id: 'advanced-ground', kind: 'advancedGroundFactory' });
    const tank = queueUnit(state, 'terra', 'plasmaTank'); expectOk(tank);
    expect(tank.state.planets[0].groundQueue[0].kind).toBe('plasmaTank');

    expect(queueUnit(state, 'terra', 'battlecruiser').ok).toBe(false);
    state.planets[0].buildings.push({ id: 'advanced-yard', kind: 'advancedSpaceFactory', spaceQueue: [] });
    const capital = queueUnit(state, 'terra', 'battlecruiser', ['advanced-yard']); expectOk(capital);
    expect(spaceYards(capital.state.planets[0]).find(yard => yard.id === 'advanced-yard')!.spaceQueue![0].kind).toBe('battlecruiser');
  });

  it('lets an Assault Carrier embark eight squads', () => {
    const state = createInitialState(); const terra = state.planets[0];
    state.completedResearch.push('advancedIndustry', 'fleetLogistics', 'carrierOperations');
    for (let i = 0; i < 8; i += 1) terra.groundUnits.push(makeUnit(`carrier-squad-${i}`, 'infantry', 'player'));
    const carrier = makeUnit('carrier', 'assaultCarrier', 'player');
    terra.orbitUnits.push(carrier);
    const dispatched = dispatchSpaceUnit(state, 'terra', carrier.id, 'halcyon'); expectOk(dispatched);
    expect(dispatched.state.fleets.find(fleet => fleet.unit.id === carrier.id)!.unit.cargo).toHaveLength(8);
    expect(dispatched.state.planets[0].groundUnits).toHaveLength(0);
  });

  it('gates the new branch units behind their technology and advanced factories', () => {
    const state = createInitialState(); const terra = state.planets[0];
    state.resources = { metal: 10000, crystal: 10000, gold: 10000 };
    terra.buildings.push(
      { id: 'new-ground-yard', kind: 'advancedGroundFactory' },
      { id: 'new-space-yard', kind: 'advancedSpaceFactory', spaceQueue: [] },
    );
    expect(queueUnit(state, 'terra', 'shockTrooper').ok).toBe(false);
    expect(queueUnit(state, 'terra', 'destroyer', ['new-space-yard']).ok).toBe(false);
    expect(queueUnit(state, 'terra', 'dreadnought', ['new-space-yard']).ok).toBe(false);

    state.completedResearch.push('groundWarfare', 'orbitalEngineering', 'titanEngineering');
    expect(queueUnit(state, 'terra', 'shockTrooper').ok).toBe(true);
    expect(queueUnit(state, 'terra', 'destroyer', ['new-space-yard']).ok).toBe(true);
    expect(queueUnit(state, 'terra', 'dreadnought', ['new-space-yard']).ok).toBe(true);
  });

  it('gives every civilization one distinct native Titan hull', () => {
    const factions: PlayableFaction[] = ['human', 'brood', 'aegis', 'covenant'];
    const titanKinds = factions.map(faction => civilizationUnitKind(faction, 'dreadnought'));

    expect(new Set(titanKinds).size).toBe(factions.length);
    expect(titanKinds.every(isTitanKind)).toBe(true);
    expect(new Set(titanKinds.map(kind => UNITS[kind].label)).size).toBe(factions.length);
    expect(new Set(titanKinds.map(kind => UNITS[kind].weapon.label)).size).toBe(factions.length);
    expect(new Set(titanKinds.map(kind => UNITS[kind].ability?.label)).size).toBe(factions.length);
  });

  it('lets the Coalition Titan split its independent siege cores across three targets', () => {
    const planet = createInitialState().planets[0];
    planet.orbitUnits = [
      { ...makeUnit('tri-core', 'dreadnought', 'player'), orbitX: 0, orbitY: 0 },
      { ...makeUnit('target-a', 'escortFrigate', 'enemy'), orbitX: 100, orbitY: 0 },
      { ...makeUnit('target-b', 'escortFrigate', 'enemy'), orbitX: 120, orbitY: 0 },
      { ...makeUnit('target-c', 'escortFrigate', 'enemy'), orbitX: 140, orbitY: 0 },
    ];

    const titanShots = orbitalCombatShots(planet).filter(shot => shot.attackerId === 'tri-core');
    expect(titanShots).toHaveLength(3);
    expect(titanShots.map(shot => shot.targetId)).toEqual(['target-a', 'target-b', 'target-c']);
    expect(titanShots.map(shot => shot.damageMultiplier ?? 1)).toEqual([1, .5, .5]);
  });

  it('lets the Brood World Eater feed on damage dealt to orbital defenses', () => {
    const state = createInitialState(); const terra = state.planets[0];
    state.enemyActionClock = 9999; state.enemyAttackClock = 9999;
    terra.owner = 'enemy';
    terra.buildings.push({ id: 'world-eater-food', kind: 'spaceDefense', hp: ORBITAL_DEFENSE_STATS.hp, maxHp: ORBITAL_DEFENSE_STATS.hp, shields: ORBITAL_DEFENSE_STATS.shields, maxShields: ORBITAL_DEFENSE_STATS.shields });
    terra.orbitUnits = [{ ...makeUnit('feeding-titan', 'worldEater', 'player'), hp: UNITS.worldEater.hp - 100, orbitX: 0, orbitY: 0 }];

    const result = tick(state, 1);
    expect(result.planets[0].orbitUnits[0].hp).toBeGreaterThan(UNITS.worldEater.hp - 100);
  });

  it('allows only one active or queued Titan per empire and permits rebuilding after its loss', () => {
    const state = createInitialState();
    state.resources = { metal: 10_000, crystal: 10_000, gold: 10_000 };
    state.completedResearch.push('titanEngineering');
    state.planets[0].buildings.push({ id: 'titan-yard', kind: 'advancedSpaceFactory', spaceQueue: [] });

    const commissioned = queueUnit(state, 'terra', 'dreadnought', ['titan-yard']); expectOk(commissioned);
    const duplicate = queueUnit(commissioned.state, 'terra', 'dreadnought', ['titan-yard']);
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.error).toContain('only one Titan');

    commissioned.state.planets[0].buildings.find(building => building.id === 'titan-yard')!.spaceQueue = [];
    commissioned.state.planets[0].orbitUnits.push({ ...makeUnit('fallen-titan', 'dreadnought', 'player'), orbitX: 200, orbitY: 0 });
    expect(queueUnit(commissioned.state, 'terra', 'dreadnought', ['titan-yard']).ok).toBe(false);
    commissioned.state.planets[0].orbitUnits = [];
    expect(queueUnit(commissioned.state, 'terra', 'dreadnought', ['titan-yard']).ok).toBe(true);
  });

  it('purchases permanent Titan upgrades with empire resources and applies their combat bonuses', () => {
    const state = createInitialState(); const terra = state.planets[0];
    state.resources = { metal: 5000, crystal: 5000, gold: 5000 };
    const titan = { ...makeUnit('refit-titan', 'dreadnought', 'player'), orbitX: 180, orbitY: 0 };
    terra.orbitUnits = [titan];

    const siege = upgradeTitan(state, terra.id, titan.id, 'siegeCore'); expectOk(siege);
    const siegeTitan = siege.state.planets[0].orbitUnits[0];
    expect(siege.state.resources).toEqual({ metal: 4640, crystal: 4720, gold: 4820 });
    expect(unitWeaponDamage(siegeTitan)).toBeCloseTo(UNITS.dreadnought.weapon.damage * 1.35);
    expect(upgradeTitan(siege.state, terra.id, titan.id, 'siegeCore').ok).toBe(false);

    const shield = upgradeTitan(siege.state, terra.id, titan.id, 'shieldMatrix'); expectOk(shield);
    expect(shield.state.planets[0].orbitUnits[0].maxShields).toBe(Math.round(UNITS.dreadnought.shields * 1.4));
    const farcast = upgradeTitan(shield.state, terra.id, titan.id, 'farcastArray'); expectOk(farcast);
    expect(unitRange(farcast.state.planets[0].orbitUnits[0])).toBeCloseTo(UNITS.dreadnought.range * 1.25);
  });

  it('rejects unaffordable Titan upgrades and charges the Brood biomass conversion', () => {
    const poor = createInitialState();
    poor.resources = { metal: 0, crystal: 0, gold: 0 };
    poor.planets[0].orbitUnits = [{ ...makeUnit('poor-titan', 'dreadnought', 'player'), orbitX: 180, orbitY: 0 }];
    expect(upgradeTitan(poor, 'terra', 'poor-titan', 'siegeCore').ok).toBe(false);

    const brood = createInitialState({ mapSize: 'small', difficulty: 'commander', playerFaction: 'brood' });
    brood.resources.biomass = 1000;
    brood.planets[0].orbitUnits = [{ ...makeUnit('brood-refit', 'worldEater', 'player'), orbitX: 180, orbitY: 0 }];
    const upgraded = upgradeTitan(brood, 'terra', 'brood-refit', 'siegeCore'); expectOk(upgraded);
    expect(upgraded.state.resources.biomass).toBe(1000 - biomassCost(TITAN_UPGRADES.siegeCore.cost));
  });

  it('allows a selected Titan to purchase an upgrade while in phase transit', () => {
    const state = createInitialState();
    state.resources = { metal: 5000, crystal: 5000, gold: 5000 };
    state.planets[0].orbitUnits = [{ ...makeUnit('transit-titan', 'dreadnought', 'player'), orbitX: 180, orbitY: 0 }];
    const dispatched = dispatchSpaceUnit(state, 'terra', 'transit-titan', 'halcyon'); expectOk(dispatched);

    const upgraded = upgradeTitan(dispatched.state, 'terra', 'transit-titan', 'farcastArray'); expectOk(upgraded);
    expect(upgraded.state.fleets[0].unit.titanUpgrades).toEqual(['farcastArray']);
  });

  it('increases permanent mine income by 25 percent with Quantum Extraction', () => {
    const base = createInitialState();
    base.enemyActionClock = 999;
    const upgraded = createInitialState();
    upgraded.enemyActionClock = 999;
    upgraded.completedResearch.push('quantumExtraction');
    const baseBefore = { ...base.resources }, upgradedBefore = { ...upgraded.resources };
    const baseAfter = tick(base, 10), upgradedAfter = tick(upgraded, 10);
    for (const resource of ['metal', 'crystal', 'gold'] as const) {
      const baseGain = baseAfter.resources[resource] - baseBefore[resource];
      const upgradedGain = upgradedAfter.resources[resource] - upgradedBefore[resource];
      expect(upgradedGain).toBeCloseTo(baseGain * 1.25, 5);
    }
  });

  it('defines six additional research branches with simulation bonuses', () => {
    expect(Object.keys(RESEARCH)).toHaveLength(15);
    expect(RESEARCH).toMatchObject({
      rapidFabrication: { requires: 'advancedIndustry' },
      planetaryFortifications: { requires: 'groundWarfare' },
      phaseMastery: { requires: 'fleetLogistics' },
      shieldHarmonics: { requires: 'orbitalEngineering' },
      deepCoreExtraction: { requires: 'quantumExtraction' },
      weaponsCalibration: { requires: 'capitalShips' },
    });
    expect(researchProductionMultiplier(['rapidFabrication'])).toBe(1.25);
    expect(spaceProductionMultiplier(['rapidFabrication'])).toBe(1.25);
    expect(phaseTravelMultiplier(['phaseMastery'])).toBe(.75);
    expect(shieldRecoveryMultiplier(['shieldHarmonics'])).toBe(1.5);
    expect(defenseDurabilityMultiplier(['planetaryFortifications'])).toBe(1.25);
    expect(orbitalDamageMultiplier(['weaponsCalibration'])).toBe(1.15);
    expect(researchIncomeMultiplier(['quantumExtraction', 'deepCoreExtraction'])).toBe(1.5);
  });

  it('adds half-speed for every empire Research Lab after the first', () => {
    const state = createInitialState(); const terra = state.planets[0];
    expect(researchLabCount(state)).toBe(0);
    expect(researchSpeedMultiplier(state)).toBe(0);
    terra.buildings.push({ id: 'lab-1', kind: 'researchLab' });
    expect(researchSpeedMultiplier(state)).toBe(1);
    terra.buildings.push({ id: 'lab-2', kind: 'researchLab' });
    expect(researchSpeedMultiplier(state)).toBe(1.5);
    const nyx = state.planets.find(planet => planet.id === 'nyx')!;
    nyx.owner = 'player';
    nyx.buildings.push({ id: 'lab-3', kind: 'researchLab' }, { id: 'lab-4', kind: 'researchLab' });
    expect(researchLabCount(state)).toBe(4);
    expect(researchSpeedMultiplier(state)).toBe(2.5);
  });

  it('accelerates active research with additional labs and pauses it without a lab', () => {
    const state = createInitialState(); const terra = state.planets[0];
    state.resources = { metal: 5000, crystal: 5000, gold: 5000 };
    terra.buildings.push({ id: 'lab-primary', kind: 'researchLab' }, { id: 'lab-secondary', kind: 'researchLab' });
    const started = beginResearch(state, 'advancedIndustry'); expectOk(started);
    const completed = tick(started.state, 30);
    expect(completed.completedResearch).toContain('advancedIndustry');

    const paused = beginResearch(state, 'advancedIndustry'); expectOk(paused);
    paused.state.planets[0].buildings = paused.state.planets[0].buildings.filter(building => building.kind !== 'researchLab');
    const stillPaused = tick(paused.state, 30);
    expect(stillPaused.researchQueue[0].remaining).toBe(RESEARCH.advancedIndustry.time);
  });

  it('applies Rapid Fabrication to both ground and space production queues', () => {
    let state = createInitialState(); state.completedResearch.push('rapidFabrication');
    const ground = queueUnit(state, 'terra', 'infantry'); expectOk(ground); state = ground.state;
    const space = queueUnit(state, 'terra', 'transport'); expectOk(space); state = space.state;
    const progressed = tick(state, 4);
    expect(progressed.planets[0].groundQueue[0].remaining).toBe(5);
    expect(spaceYards(progressed.planets[0])[0].spaceQueue![0].remaining).toBe(13);
  });

  it('applies Shield Harmonics to ship shield regeneration', () => {
    const damaged = { ...makeUnit('harmonic-ship', 'escortFrigate', 'player'), shields: 0 };
    expect(recoverSpaceUnit(damaged, false, 2, 'human', shieldRecoveryMultiplier(['shieldHarmonics'])).shields).toBe(15);
  });

  it('queues and completes ground units in real time', () => {
    const state = createInitialState();
    const queued = queueUnit(state, 'terra', 'lightTank'); expectOk(queued);
    expect(queued.state.planets[0].groundQueue).toHaveLength(1);
    const completed = tick(queued.state, 25);
    expect(completed.planets[0].groundQueue).toHaveLength(0);
    expect(completed.planets[0].groundUnits.some(u => u.kind === 'lightTank')).toBe(true);
  });

  it('accelerates the active ground queue for every standard or advanced ground factory', () => {
    const state = createInitialState(); const terra = state.planets[0];
    terra.buildings.push({ id: 'b-extra-ground', kind: 'groundFactory' }, { id: 'b-advanced-ground', kind: 'advancedGroundFactory' });
    expect(groundProductionMultiplier(terra)).toBe(3);

    const queued = queueUnit(state, 'terra', 'infantry'); expectOk(queued);
    const nearlyComplete = tick(queued.state, 3);
    expect(nearlyComplete.planets[0].groundQueue[0].remaining).toBe(1);
    const completed = tick(nearlyComplete, 1 / 3);
    expect(completed.planets[0].groundQueue).toHaveLength(0);
    expect(completed.planets[0].groundUnits).toHaveLength(1);
  });

  it('does not apply the ground-factory speed bonus to ship production', () => {
    const state = createInitialState(); const terra = state.planets[0];
    terra.buildings.push({ id: 'b-extra-ground', kind: 'groundFactory' });
    const queued = queueUnit(state, 'terra', 'transport'); expectOk(queued);
    const progressed = tick(queued.state, 5);
    expect(spaceYards(progressed.planets[0])[0].spaceQueue![0].remaining).toBe(13);
  });

  it('gives grouped Space Yards independent production queues', () => {
    const state = createInitialState(); const terra = state.planets[0];
    state.resources = { metal: 5000, crystal: 5000, gold: 5000 };
    terra.buildings.push({ id: 'b-second-yard', kind: 'spaceFactory', spaceQueue: [] });
    const yardIds = spaceYards(terra).map(yard => yard.id);
    const grouped = queueUnit(state, 'terra', 'transport', yardIds); expectOk(grouped);
    const queuedYards = spaceYards(grouped.state.planets[0]);
    expect(queuedYards.map(yard => yard.spaceQueue?.length)).toEqual([1, 1]);
    expect(grouped.state.resources).toEqual({ metal: 4860, crystal: 4904, gold: 4960 });

    const completed = tick(grouped.state, 18);
    expect(spaceYards(completed.planets[0]).map(yard => yard.spaceQueue?.length)).toEqual([0, 0]);
    expect(completed.planets[0].orbitUnits).toHaveLength(2);
  });

  it('auto-distributes sequential ship orders across Space Yards', () => {
    let state = createInitialState(); const terra = state.planets[0];
    state.resources = { metal: 5000, crystal: 5000, gold: 5000 };
    terra.buildings.push({ id: 'b-second-yard', kind: 'spaceFactory', spaceQueue: [] });

    const first = queueUnit(state, 'terra', 'transport'); expectOk(first); state = first.state;
    const second = queueUnit(state, 'terra', 'escortFrigate'); expectOk(second); state = second.state;
    const third = queueUnit(state, 'terra', 'missileFrigate'); expectOk(third);

    const queues = spaceYards(third.state.planets[0]).map(yard => yard.spaceQueue!.map(item => item.kind));
    expect(queues).toEqual([['transport', 'missileFrigate'], ['escortFrigate']]);
    expect(third.state.messages[0]).toBe('Missile Frigate auto-routed to Space Yard 1 at Terra Nova.');
  });

  it('migrates a legacy planet ship queue into its individual Space Yards', () => {
    const state = createInitialState();
    state.planets[0].spaceQueue.push({ id: 'legacy-q', kind: 'transport', remaining: 9, total: 18 });
    const migrated = migrateGameState(state);
    expect(migrated.planets[0].spaceQueue).toHaveLength(0);
    expect(spaceYards(migrated.planets[0])[0].spaceQueue).toEqual([
      { id: 'legacy-q', kind: 'transport', remaining: 9, total: 18 },
    ]);
  });

  it('migrates an underway fleet from an older local save', () => {
    const state = createInitialState(); const terra = seedPlayerForces(state); const transport = terra.orbitUnits[0];
    const dispatched = dispatchSpaceUnit(state, 'terra', transport.id, 'halcyon'); expectOk(dispatched);
    delete dispatched.state.fleets[0].route;
    delete dispatched.state.fleets[0].finalDestinationId;
    delete dispatched.state.fleets[0].phase;
    const migrated = migrateGameState(dispatched.state);
    expect(migrated.fleets[0].route).toEqual([]);
    expect(migrated.fleets[0].finalDestinationId).toBe('halcyon');
    expect(migrated.fleets[0].phase).toBe('tunnel');
  });

  it('deploys completed ships into distinct persistent orbit positions', () => {
    const state = createInitialState(); const originalIds = new Set(state.planets[0].orbitUnits.map(ship => ship.id));
    const queued = queueUnit(state, 'terra', 'transport'); expectOk(queued);
    const completed = tick(queued.state, 20);
    const ships = completed.planets[0].orbitUnits;
    const produced = ships.find(ship => !originalIds.has(ship.id))!;
    expect(Math.hypot(produced.orbitX!, produced.orbitY!)).toBeGreaterThanOrEqual(24);
    expect(new Set(ships.map(ship => `${ship.orbitX},${ship.orbitY}`)).size).toBe(ships.length);
  });

  it('requires a research lab and prerequisite for advanced research', () => {
    const state = createInitialState();
    expect(beginResearch(state, 'advancedIndustry').ok).toBe(false);
    state.resources = { metal: 5000, crystal: 5000, gold: 5000 };
    const lab = constructBuilding(state, 'terra', 'researchLab'); expectOk(lab);
    expect(beginResearch(lab.state, 'capitalShips').ok).toBe(false);
    const started = beginResearch(lab.state, 'advancedIndustry'); expectOk(started);
    const done = tick(started.state, 50);
    expect(done.completedResearch).toContain('advancedIndustry');
  });
});

describe('enemy strategy', () => {
  it('uses its own economy to build bases and queue reinforcements', () => {
    const state = createInitialState();
    const initialPlayerResources = { ...state.resources };
    const advanced = tick(state, 8);
    const cygnus = advanced.planets.find(p => p.id === 'cygnus')!;
    expect(cygnus.buildings.filter(building => building.kind === 'metalMine')).toHaveLength(2);
    expect(cygnus.groundQueue.length).toBeGreaterThan(0);
    expect(spaceYards(cygnus)[0].spaceQueue?.[0].kind).toBe('transport');
    expect(advanced.resources.metal).toBeGreaterThan(initialPlayerResources.metal);
    expect(advanced.enemyResources).not.toEqual(state.enemyResources);
  });

  it('builds ships and launches an invasion fleet at a player colony', () => {
    const state = createInitialState(); const cygnus = state.planets.find(p => p.id === 'cygnus')!;
    state.planets[0].groundUnits.push(makeUnit('player-defender', 'infantry', 'player'));
    cygnus.groundUnits.push(makeUnit('enemy-ground-1', 'infantry', 'enemy'), makeUnit('enemy-ground-2', 'lightTank', 'enemy'));
    cygnus.orbitUnits.push(makeUnit('enemy-transport', 'transport', 'enemy'));
    state.enemyMissionCount = 2;
    state.enemyAttackClock = 0;
    const launched = tick(state, 0);
    const invasion = launched.fleets.find(fleet => fleet.unit.id === 'enemy-transport')!;
    expect(invasion.faction).toBe('enemy');
    expect(invasion.finalDestinationId).toBe('terra');
    expect(invasion.unit.cargo).toHaveLength(2);
    expect(launched.messages[0]).toContain('HOSTILE FLEET LAUNCHED');

    let arrived = launched;
    while (arrived.fleets.some(fleet => fleet.unit.id === 'enemy-transport')) {
      const activeLeg = arrived.fleets.find(fleet => fleet.unit.id === 'enemy-transport')!;
      arrived = tick(arrived, activeLeg.travelTime - activeLeg.progress);
    }
    const landingTransport = arrived.planets[0].orbitUnits.find(unit => unit.id === 'enemy-transport')!;
    expect(Math.hypot(landingTransport.orbitX!, landingTransport.orbitY!)).toBeCloseTo(MAX_SHIP_ORBIT_RADIUS);
    expect(landingTransport.pendingLanding).toBe(true);
    expect(arrived.battles).toHaveLength(0);
    const landed = tick(arrived, fullLandingApproachSeconds);
    const battle = landed.battles.find(candidate => candidate.planetId === 'terra');
    expect(battle?.attackerFaction).toBe('enemy');
    expect(battle?.attackers.every(unit => unit.faction === 'enemy')).toBe(true);
  });

  it('launches transport-independent strike fleets from every eligible rear colony', () => {
    const state = createInitialState();
    const cygnus = state.planets.find(planet => planet.id === 'cygnus')!;
    const nyx = state.planets.find(planet => planet.id === 'nyx')!;
    nyx.owner = 'enemy';
    cygnus.orbitUnits = Array.from({ length: 5 }, (_, index) => makeUnit(`cygnus-warship-${index}`, index % 2 ? 'missileFrigate' : 'escortFrigate', 'enemy'));
    nyx.orbitUnits = Array.from({ length: 5 }, (_, index) => makeUnit(`nyx-warship-${index}`, index % 2 ? 'escortFrigate' : 'missileFrigate', 'enemy'));
    state.enemyActionClock = 9999;
    state.enemyAttackClock = 0;

    const launched = tick(state, 0);
    const strikeFleets = launched.fleets.filter(fleet => fleet.faction === 'enemy');
    expect(strikeFleets.filter(fleet => fleet.originId === cygnus.id)).toHaveLength(3);
    expect(strikeFleets.filter(fleet => fleet.originId === nyx.id)).toHaveLength(3);
    expect(strikeFleets.every(fleet => !(UNITS[fleet.unit.kind].capacity ?? 0))).toBe(true);
    expect(launched.planets.find(planet => planet.id === cygnus.id)!.orbitUnits).toHaveLength(2);
    expect(launched.planets.find(planet => planet.id === nyx.id)!.orbitUnits).toHaveLength(2);
    expect(launched.messages.filter(message => message.includes('HOSTILE STRIKE FLEET'))).toHaveLength(2);
  });

  it('sends surplus warships alongside a transport invasion instead of limiting the attack to escorts', () => {
    const state = createInitialState(); const cygnus = state.planets.find(planet => planet.id === 'cygnus')!;
    state.planets[0].groundUnits.push(makeUnit('player-defender', 'infantry', 'player'));
    cygnus.groundUnits.push(makeUnit('enemy-ground-1', 'infantry', 'enemy'), makeUnit('enemy-ground-2', 'lightTank', 'enemy'));
    cygnus.orbitUnits = [
      makeUnit('invasion-transport', 'transport', 'enemy'),
      ...Array.from({ length: 9 }, (_, index) => makeUnit(`invasion-warship-${index}`, index % 2 ? 'missileFrigate' : 'escortFrigate', 'enemy')),
    ];
    state.enemyMissionCount = 2;
    state.enemyActionClock = 9999;
    state.enemyAttackClock = 0;

    const launched = tick(state, 0);
    const invasionFleets = launched.fleets.filter(fleet => fleet.faction === 'enemy' && fleet.finalDestinationId === 'terra');
    expect(invasionFleets.filter(fleet => (UNITS[fleet.unit.kind].capacity ?? 0) > 0)).toHaveLength(1);
    expect(invasionFleets.filter(fleet => !(UNITS[fleet.unit.kind].capacity ?? 0))).toHaveLength(7);
    expect(launched.planets.find(planet => planet.id === cygnus.id)!.orbitUnits).toHaveLength(2);
    expect(launched.messages.some(message => message.includes('HOSTILE STRIKE FLEET'))).toBe(true);
  });

  it('reinforces a friendly colony under orbital attack before launching another strike', () => {
    const state = createInitialState();
    const cygnus = state.planets.find(planet => planet.id === 'cygnus')!;
    const nyx = state.planets.find(planet => planet.id === 'nyx')!;
    nyx.owner = 'enemy';
    nyx.orbitUnits = [makeUnit('player-raider', 'escortFrigate', 'player')];
    cygnus.orbitUnits = Array.from({ length: 5 }, (_, index) => makeUnit(`reserve-warship-${index}`, 'escortFrigate', 'enemy'));
    state.enemyActionClock = 9999;
    state.enemyAttackClock = 0;

    const launched = tick(state, 0);
    const reinforcements = launched.fleets.filter(fleet => fleet.originId === cygnus.id);
    expect(reinforcements).toHaveLength(3);
    expect(reinforcements.every(fleet => fleet.finalDestinationId === nyx.id)).toBe(true);
    expect(launched.messages[0]).toContain('HOSTILE REINFORCEMENTS');
  });

  it('uses expansion missions to colonize neutral planets', () => {
    const state = createInitialState(); const cygnus = state.planets.find(p => p.id === 'cygnus')!;
    state.planets.filter(planet => planet.owner === null).forEach(planet => { planet.groundUnits = []; });
    cygnus.groundUnits.push(makeUnit('enemy-colonist-1', 'infantry', 'enemy'), makeUnit('enemy-colonist-2', 'infantry', 'enemy'));
    cygnus.orbitUnits.push(makeUnit('enemy-colony-transport', 'transport', 'enemy'));
    state.enemyAttackClock = 0;

    let launched = tick(state, 0);
    const mission = launched.fleets.find(fleet => fleet.unit.id === 'enemy-colony-transport')!;
    const targetId = mission.finalDestinationId!;
    expect(launched.planets.find(planet => planet.id === targetId)!.owner).toBeNull();
    expect(launched.messages[0]).toContain('HOSTILE EXPANSION FLEET');
    expect(launched.enemyMissionCount).toBe(1);

    launched.enemyActionClock = 9999; launched.enemyAttackClock = 9999;
    const arrived = advanceFleetToArrival(launched, 'enemy-colony-transport');
    const colonized = tick(arrived, fullLandingApproachSeconds + .1);
    expect(colonized.planets.find(planet => planet.id === targetId)!.owner).toBe('enemy');
  });

  it('grows an expansion force from the same zero-unit start as the player', () => {
    let state = createInitialState();
    for (let step = 0; step < 18; step += 1) state = tick(state, 8);
    expect(state.fleets.some(fleet => fleet.faction === 'enemy')).toBe(true);
    expect(state.messages.some(message => message.includes('HOSTILE EXPANSION FLEET'))).toBe(true);
  });
});

describe('transport and colonization', () => {
  it('clears the gravity well, charges at the border, then enters a faster phase tunnel', () => {
    const state = createInitialState(); const transport = seedPlayerForces(state).orbitUnits[0];
    const order = dispatchSpaceUnit(state, 'terra', transport.id, 'halcyon'); expectOk(order);
    const departure = order.state.fleets[0];
    expect(departure.phase).toBe('exiting');
    expect(departure.travelTime).toBeGreaterThan(PHASE_GATE_CHARGE_SECONDS);

    const clearing = tick(order.state, departure.travelTime / 2);
    expect(clearing.fleets[0]).toMatchObject({ phase: 'exiting', progress: departure.travelTime / 2 });
    const atBorder = tick(clearing, clearing.fleets[0].travelTime - clearing.fleets[0].progress);
    expect(atBorder.fleets[0]).toMatchObject({ phase: 'charging', progress: 0, travelTime: PHASE_GATE_CHARGE_SECONDS });
    const charging = tick(atBorder, PHASE_GATE_CHARGE_SECONDS - .1);
    expect(charging.fleets[0].phase).toBe('charging');
    const inTunnel = tick(charging, .11);
    expect(inTunnel.fleets[0].phase).toBe('tunnel');
    const terra = state.planets.find(planet => planet.id === 'terra')!, halcyon = state.planets.find(planet => planet.id === 'halcyon')!;
    const previousTunnelTime = Math.max(16, Math.hypot(halcyon.x - terra.x, halcyon.y - terra.y) * 1.1);
    expect(inTunnel.fleets[0].travelTime).toBeLessThan(previousTunnelTime);
  });

  it('cancels a jump during system exit without teleporting the ship', () => {
    const state = createInitialState(); const transport = seedPlayerForces(state).orbitUnits[0];
    state.enemyActionClock = 9999; state.enemyAttackClock = 9999;
    const order = dispatchSpaceUnit(state, 'terra', transport.id, 'halcyon'); expectOk(order);
    const leaving = tick(order.state, 1);
    const fleet = leaving.fleets[0];
    const terra = leaving.planets.find(planet => planet.id === 'terra')!;
    const halcyon = leaving.planets.find(planet => planet.id === 'halcyon')!;
    const dx = halcyon.x - terra.x, dy = halcyon.y - terra.y, distance = Math.hypot(dx, dy);
    const progress = fleet.progress / fleet.travelTime;
    const expectedX = fleet.departureX! + (dx / distance * MAX_SHIP_ORBIT_RADIUS - fleet.departureX!) * progress;
    const expectedY = fleet.departureY! + (dy / distance * MAX_SHIP_ORBIT_RADIUS - fleet.departureY!) * progress;

    const canceled = maneuverSpaceUnit(leaving, terra.id, transport.id, 80, 40); expectOk(canceled);
    const returned = canceled.state.planets.find(planet => planet.id === terra.id)!.orbitUnits.find(unit => unit.id === transport.id)!;
    expect(canceled.state.fleets.some(candidate => candidate.unit.id === transport.id)).toBe(false);
    expect(returned.orbitX).toBeCloseTo(expectedX);
    expect(returned.orbitY).toBeCloseTo(expectedY);
    expect(returned).toMatchObject({ orbitTargetX: 80, orbitTargetY: 40 });
    expect(canceled.state.messages[0]).toBe('Jump canceled — 1 ship maneuvering inside Terra Nova gravity well.');
  });

  it('allows cancellation while charging but commits the jump after tunnel entry', () => {
    const state = createInitialState(); const transport = seedPlayerForces(state).orbitUnits[0];
    state.enemyActionClock = 9999; state.enemyAttackClock = 9999;
    const order = dispatchSpaceUnit(state, 'terra', transport.id, 'halcyon'); expectOk(order);
    const atBorder = tick(order.state, order.state.fleets[0].travelTime);
    expect(atBorder.fleets[0].phase).toBe('charging');

    const canceled = maneuverSpaceUnit(atBorder, 'terra', transport.id, 50, -20); expectOk(canceled);
    const returned = canceled.state.planets[0].orbitUnits.find(unit => unit.id === transport.id)!;
    expect(Math.hypot(returned.orbitX!, returned.orbitY!)).toBeCloseTo(MAX_SHIP_ORBIT_RADIUS);

    const inTunnel = tick(atBorder, PHASE_GATE_CHARGE_SECONDS);
    expect(inTunnel.fleets[0].phase).toBe('tunnel');
    const tooLate = maneuverSpaceUnit(inTunnel, 'terra', transport.id, 50, -20);
    expect(tooLate.ok).toBe(false);
    if (!tooLate.ok) expect(tooLate.error).toContain('already entered the phase tunnel');
  });

  it('holds arrived combat ships at the system edge ready for immediate orders', () => {
    const state = createInitialState();
    state.planets[0].orbitUnits.push({ id: 'frigate', kind: 'escortFrigate', faction: 'player', hp: 260, maxHp: 260, shields: 130, maxShields: 130 });
    const order = dispatchSpaceUnit(state, 'terra', 'frigate', 'halcyon'); expectOk(order);
    const arrived = advanceFleetToArrival(order.state, 'frigate');
    const frigate = arrived.planets.find(p => p.id === 'halcyon')!.orbitUnits.find(u => u.id === 'frigate')!;
    expect(Math.hypot(frigate.orbitX!, frigate.orbitY!)).toBeCloseTo(MAX_SHIP_ORBIT_RADIUS, 1);
    expect(frigate.phaseArrival).toBeUndefined();
    expect(frigate.orbitTargetX).toBeUndefined();

    const holding = tick(arrived, 30).planets.find(p => p.id === 'halcyon')!.orbitUnits.find(u => u.id === 'frigate')!;
    expect(holding.orbitX).toBe(frigate.orbitX);
    expect(holding.orbitY).toBe(frigate.orbitY);

    const returnOrder = dispatchSpaceUnit(arrived, 'halcyon', 'frigate', 'terra'); expectOk(returnOrder);
    expect(returnOrder.state.fleets[0]).toMatchObject({ originId: 'halcyon', finalDestinationId: 'terra' });
  });

  it('fans arriving fleets apart along the destination system edge', () => {
    const state = createInitialState(); const terra = state.planets[0];
    terra.orbitUnits = ['arrival-a', 'arrival-b', 'arrival-c'].map(id => makeUnit(id, 'escortFrigate', 'player'));
    const order = dispatchSpaceUnits(state, 'terra', terra.orbitUnits.map(ship => ship.id), 'halcyon'); expectOk(order);
    const arrived = advanceFleetToArrival(order.state, 'arrival-a');
    const ships = arrived.planets.find(planet => planet.id === 'halcyon')!.orbitUnits;
    expect(ships).toHaveLength(3);
    ships.forEach((ship, index) => ships.slice(index + 1).forEach(other => {
      expect(Math.hypot(ship.orbitX! - other.orbitX!, ship.orbitY! - other.orbitY!)).toBeGreaterThanOrEqual(MIN_SHIP_ORBIT_SEPARATION - 1e-9);
    }));
  });

  it('lets a loaded arrival abort its landing approach and jump onward immediately', () => {
    const state = createInitialState(); const transport = seedPlayerForces(state).orbitUnits[0];
    state.enemyActionClock = 9999; state.enemyAttackClock = 9999;
    const outbound = dispatchTransport(state, 'terra', transport.id, 'halcyon'); expectOk(outbound);
    const arrived = advanceFleetToArrival(outbound.state, transport.id);
    const approaching = arrived.planets.find(p => p.id === 'halcyon')!.orbitUnits.find(unit => unit.id === transport.id)!;
    expect(approaching.pendingLanding).toBe(true);

    const redirected = dispatchTransport(arrived, 'halcyon', transport.id, 'terra'); expectOk(redirected);
    expect(redirected.state.fleets[0].unit.pendingLanding).toBeUndefined();
    expect(redirected.state.planets.find(p => p.id === 'halcyon')!.orbitUnits.some(unit => unit.id === transport.id)).toBe(false);
  });

  it('automatically routes distant movement through connected phase lanes over time', () => {
    const state = createInitialState(); const transport = seedPlayerForces(state).orbitUnits[0];
    const result = dispatchSpaceUnit(state, 'terra', transport.id, 'vesta');
    expectOk(result);
    expect(result.state.fleets[0].finalDestinationId).toBe('vesta');
    expect(result.state.fleets[0].destinationId).not.toBe('vesta');
    expect(result.state.fleets[0].route!.length).toBeGreaterThan(0);
    const underway = tick(result.state, 1);
    expect(underway.fleets).toHaveLength(1);
    expect(underway.planets.find(p => p.id === 'vesta')!.orbitUnits.some(unit => unit.id === transport.id)).toBe(false);
    const arrived = advanceFleetToArrival(underway, transport.id);
    expect(arrived.fleets.some(fleet => fleet.unit.id === transport.id)).toBe(false);
    expect(arrived.planets.find(p => p.id === 'vesta')!.orbitUnits.some(unit => unit.id === transport.id)).toBe(true);
  });

  it('maneuvers and docks ships gradually within a gravity well', () => {
    const state = createInitialState(); const transport = seedPlayerForces(state).orbitUnits[0];
    state.enemyActionClock = 9999; state.enemyAttackClock = 9999;
    const moved = maneuverSpaceUnit(state, 'terra', transport.id, 40, 25); expectOk(moved);
    expect(moved.state.planets[0].orbitUnits[0]).toMatchObject({ orbitTargetX: 40, orbitTargetY: 25 });
    expect(moved.state.planets[0].orbitUnits[0].heading).toBeCloseTo(headingForVector(40, 205));
    expect(moved.state.planets[0].orbitUnits[0].orbitY).toBe(-180);
    const underway = tick(moved.state, 1);
    expect(Math.hypot(underway.planets[0].orbitUnits[0].orbitX!, underway.planets[0].orbitUnits[0].orbitY! + 180)).toBeCloseTo(ORBIT_MANEUVER_SPEED);
    expect(underway.planets[0].orbitUnits[0].orbitY).toBeGreaterThan(-180);
    expect(underway.planets[0].orbitUnits[0].orbitY).toBeLessThan(25);
    const positioned = tick(underway, 20);
    expect(positioned.planets[0].orbitUnits[0]).toMatchObject({ orbitX: 40, orbitY: 25 });
    expect(positioned.planets[0].orbitUnits[0].heading).toBeCloseTo(headingForVector(40, 205));
    const docked = dockSpaceUnit(positioned, 'terra', transport.id); expectOk(docked);
    expect(docked.state.planets[0].orbitUnits[0]).toMatchObject({ pendingEmbark: true, orbitTargetX: 0, orbitTargetY: 0 });
    expect(docked.state.planets[0].orbitUnits[0].cargo).toBeUndefined();
    expect(docked.state.planets[0].groundUnits).toHaveLength(3);
    const embarked = tick(docked.state, fullLandingApproachSeconds);
    expect(embarked.planets[0].orbitUnits[0]).toMatchObject({ docked: true, orbitX: 0, orbitY: 0 });
    expect(embarked.planets[0].orbitUnits[0].pendingEmbark).toBeUndefined();
    expect(embarked.planets[0].orbitUnits[0].cargo).toHaveLength(3);
    expect(embarked.planets[0].groundUnits).toHaveLength(0);
  });

  it('allows hostile ships to destroy a transport during embarkation without killing waiting squads', () => {
    const state = createInitialState(); const terra = seedPlayerForces(state); const transport = terra.orbitUnits[0];
    state.enemyActionClock = 9999; state.enemyAttackClock = 9999;
    transport.hp = 1; transport.shields = 0;
    terra.orbitUnits.push({ ...makeUnit('embark-interceptor', 'escortFrigate', 'enemy'), orbitX: 180, orbitY: 0 });
    const docking = dockSpaceUnit(state, terra.id, transport.id); expectOk(docking);
    expect(docking.state.planets[0].orbitUnits.find(unit => unit.id === transport.id)?.pendingEmbark).toBe(true);

    const intercepted = tick(docking.state, 1);
    expect(intercepted.planets[0].orbitUnits.some(unit => unit.id === transport.id)).toBe(false);
    expect(intercepted.planets[0].groundUnits).toHaveLength(3);
    expect(intercepted.messages.some(message => message.includes('destroyed while attempting to embark'))).toBe(true);
  });

  it('uses the expanded gravity-well radius for maneuver orders', () => {
    const state = createInitialState(); const transport = seedPlayerForces(state).orbitUnits[0];
    const moved = maneuverSpaceUnit(state, 'terra', transport.id, 1000, 1000); expectOk(moved);
    const target = moved.state.planets[0].orbitUnits[0];
    expect(GRAVITY_WELL_RADIUS).toBe(780);
    expect(Math.hypot(target.orbitTargetX!, target.orbitTargetY!)).toBeCloseTo(MAX_SHIP_ORBIT_RADIUS);
  });

  it('keeps docked ship groups in separate orbital slots', () => {
    const state = createInitialState(); const terra = seedPlayerForces(state); const ids = terra.orbitUnits.map(unit => unit.id);
    terra.groundUnits = [];
    state.planets[0].orbitUnits.forEach(unit => { unit.orbitX = 0; unit.orbitY = 0; });
    const docked = dockSpaceUnits(state, 'terra', ids); expectOk(docked);
    const positions = docked.state.planets[0].orbitUnits.map(unit => `${unit.orbitTargetX},${unit.orbitTargetY}`);
    expect(new Set(positions).size).toBe(ids.length);
    expect(docked.state.planets[0].orbitUnits.every(unit => Math.hypot(unit.orbitTargetX!, unit.orbitTargetY!) >= 24)).toBe(true);
  });

  it('migrates ships stacked at the planet center into open orbit', () => {
    const state = createInitialState(); seedPlayerForces(state);
    state.planets[0].orbitUnits.forEach(unit => { unit.orbitX = 0; unit.orbitY = 0; });
    const migrated = tick(state, 0);
    const positions = migrated.planets[0].orbitUnits.map(unit => `${unit.orbitX},${unit.orbitY}`);
    expect(new Set(positions).size).toBe(state.planets[0].orbitUnits.length);
    expect(migrated.planets[0].orbitUnits.every(unit => Math.hypot(unit.orbitX!, unit.orbitY!) >= 24)).toBe(true);
  });

  it('keeps crowded fleets inside the gravity well in distinct bounded orbit slots', () => {
    const state = createInitialState(); const terra = state.planets[0];
    terra.orbitUnits = Array.from({ length: 96 }, (_, index) => ({
      ...makeUnit(`crowded-${index}`, 'escortFrigate', 'enemy'), orbitX: 0, orbitY: 0,
    }));

    const positioned = tick(state, 0).planets[0].orbitUnits;
    expect(new Set(positioned.map(ship => `${ship.orbitX},${ship.orbitY}`)).size).toBe(positioned.length);
    expect(positioned.every(ship => Math.hypot(ship.orbitX!, ship.orbitY!) <= MAX_SHIP_ORBIT_RADIUS)).toBe(true);
    positioned.forEach((ship, index) => positioned.slice(index + 1).forEach(other => {
      expect(Math.hypot(ship.orbitX! - other.orbitX!, ship.orbitY! - other.orbitY!)).toBeGreaterThanOrEqual(MIN_SHIP_ORBIT_SEPARATION - 1e-9);
    }));
  });

  it('separates idle ships that occupy the same orbital area', () => {
    const state = createInitialState(); const terra = state.planets[0];
    terra.orbitUnits = [
      { ...makeUnit('overlap-a', 'escortFrigate', 'player'), orbitX: 100, orbitY: 100 },
      { ...makeUnit('overlap-b', 'missileFrigate', 'player'), orbitX: 108, orbitY: 100 },
    ];
    const [first, second] = tick(state, 0).planets[0].orbitUnits;
    expect(Math.hypot(first.orbitX! - second.orbitX!, first.orbitY! - second.orbitY!)).toBeGreaterThanOrEqual(MIN_SHIP_ORBIT_SEPARATION);
  });

  it('clamps legacy positions and maneuver targets to the system boundary', () => {
    const state = createInitialState(); const terra = state.planets[0];
    terra.orbitUnits = [{
      ...makeUnit('outside-system', 'missileFrigate', 'enemy'),
      orbitX: 900, orbitY: 200, orbitTargetX: 850, orbitTargetY: -300,
    }];

    const bounded = tick(state, 0).planets[0].orbitUnits[0];
    expect(Math.hypot(bounded.orbitX!, bounded.orbitY!)).toBeCloseTo(MAX_SHIP_ORBIT_RADIUS);
    expect(Math.hypot(bounded.orbitTargetX!, bounded.orbitTargetY!)).toBeCloseTo(MAX_SHIP_ORBIT_RADIUS);
  });

  it('moves and phase-jumps a selected ship group in formation', () => {
    const state = createInitialState(); const terra = seedPlayerForces(state); const ids = terra.orbitUnits.map(u => u.id);
    const formation = maneuverSpaceUnits(state, 'terra', ids, 60, 30); expectOk(formation);
    const ships = formation.state.planets[0].orbitUnits;
    const positions = ships.map(u => `${u.orbitTargetX},${u.orbitTargetY}`);
    expect(new Set(positions).size).toBe(ids.length);
    ships.forEach((ship, index) => ships.slice(index + 1).forEach(other => {
      expect(Math.hypot(ship.orbitTargetX! - other.orbitTargetX!, ship.orbitTargetY! - other.orbitTargetY!)).toBeGreaterThanOrEqual(MIN_SHIP_ORBIT_SEPARATION - 1e-9);
    }));
    const jump = dispatchSpaceUnits(formation.state, 'terra', ids, 'halcyon'); expectOk(jump);
    expect(jump.state.fleets).toHaveLength(ids.length);
  });

  it('never snaps maneuvering ships into open-orbit slots when their formation paths cross', () => {
    const state = createInitialState(); const terra = state.planets[0];
    state.enemyActionClock = 9999; state.enemyAttackClock = 9999;
    terra.orbitUnits = [
      { ...makeUnit('crossing-a', 'escortFrigate', 'player'), orbitX: 100, orbitY: 0 },
      { ...makeUnit('crossing-b', 'missileFrigate', 'player'), orbitX: -100, orbitY: 0 },
    ];
    const order = maneuverSpaceUnits(state, terra.id, ['crossing-a', 'crossing-b'], 0, 100); expectOk(order);
    let moving = order.state;
    for (let step = 0; step < 40; step += 1) {
      const before = moving.planets[0].orbitUnits.map(ship => ({ id: ship.id, x: ship.orbitX!, y: ship.orbitY! }));
      moving = tick(moving, .25);
      moving.planets[0].orbitUnits.forEach(ship => {
        const previous = before.find(position => position.id === ship.id)!;
        expect(Math.hypot(ship.orbitX! - previous.x, ship.orbitY! - previous.y)).toBeLessThanOrEqual(ORBIT_MANEUVER_SPEED * .25 + 1e-9);
      });
    }
    expect(moving.planets[0].orbitUnits).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'crossing-a', orbitX: -MIN_SHIP_ORBIT_SEPARATION / 2, orbitY: 100 }),
      expect.objectContaining({ id: 'crossing-b', orbitX: MIN_SHIP_ORBIT_SEPARATION / 2, orbitY: 100 }),
    ]));
  });

  it('lets a docked formation depart the planet center without an open-orbit teleport', () => {
    const state = createInitialState(); const terra = state.planets[0];
    state.enemyActionClock = 9999; state.enemyAttackClock = 9999;
    terra.orbitUnits = [
      { ...makeUnit('docked-a', 'transport', 'player'), orbitX: 0, orbitY: 0, docked: true },
      { ...makeUnit('docked-b', 'transport', 'player'), orbitX: 0, orbitY: 0, docked: true },
    ];
    const order = maneuverSpaceUnits(state, terra.id, ['docked-a', 'docked-b'], 120, 60); expectOk(order);
    const advanced = tick(order.state, .25);
    expect(advanced.planets[0].orbitUnits.every(ship => Math.hypot(ship.orbitX!, ship.orbitY!) <= ORBIT_MANEUVER_SPEED * .25 + 1e-9)).toBe(true);
    expect(advanced.planets[0].orbitUnits.every(ship => typeof ship.orbitTargetX === 'number' && typeof ship.orbitTargetY === 'number')).toBe(true);
  });

  it('does not relocate an arrived formation ship when another ship crosses its position', () => {
    const state = createInitialState(); const terra = state.planets[0];
    state.enemyActionClock = 9999; state.enemyAttackClock = 9999;
    terra.orbitUnits = [
      { ...makeUnit('crossing', 'escortFrigate', 'player'), orbitX: 104, orbitY: 100, orbitTargetX: 220, orbitTargetY: 100 },
      { ...makeUnit('arrived', 'missileFrigate', 'player'), orbitX: 100, orbitY: 100 },
    ];

    const advanced = tick(state, .25);
    const arrived = advanced.planets[0].orbitUnits.find(ship => ship.id === 'arrived')!;
    const crossing = advanced.planets[0].orbitUnits.find(ship => ship.id === 'crossing')!;
    expect(arrived).toMatchObject({ orbitX: 100, orbitY: 100 });
    expect(crossing.orbitX).toBeGreaterThan(104);
    expect(crossing.orbitX).toBeLessThanOrEqual(104 + ORBIT_MANEUVER_SPEED * .25);
  });

  it('cannot colonize without a ground squad to auto-embark', () => {
    const state = createInitialState(); const terra = seedPlayerForces(state); terra.groundUnits = [];
    const moved = dispatchTransport(state, 'terra', terra.orbitUnits[0].id, 'halcyon'); expectOk(moved);
    const arrived = advanceFleetToArrival(moved.state, terra.orbitUnits[0].id);
    expect(arrived.planets.find(p => p.id === 'halcyon')!.owner).toBeNull();
  });

  it('automatically embarks squads and contests a neutral garrison on landing', () => {
    const state = createInitialState(); const transport = seedPlayerForces(state).orbitUnits[0];
    state.enemyActionClock = 9999; state.enemyAttackClock = 9999;
    const moved = dispatchTransport(state, 'terra', transport.id, 'halcyon'); expectOk(moved);
    expect(moved.state.planets[0].groundUnits).toHaveLength(0);
    expect(moved.state.fleets[0].unit.cargo).toHaveLength(3);
    const arrived = advanceFleetToArrival(moved.state, transport.id);
    const halcyonEdge = arrived.planets.find(p => p.id === 'halcyon')!;
    const approaching = halcyonEdge.orbitUnits.find(u => u.id === transport.id)!;
    expect(halcyonEdge.owner).toBeNull();
    expect(Math.hypot(approaching.orbitX!, approaching.orbitY!)).toBeCloseTo(MAX_SHIP_ORBIT_RADIUS, 1);
    expect(approaching.pendingLanding).toBe(true);
    expect(approaching.phaseArrival).toBeUndefined();
    expect(approaching.cargo).toHaveLength(3);
    let landed = arrived;
    for (let second = 0; second < fullLandingApproachSeconds + 2 && !landed.battles.some(battle => battle.planetId === 'halcyon'); second += 1) landed = tick(landed, 1);
    const battle = landed.battles.find(candidate => candidate.planetId === 'halcyon')!;
    const dockedTransport = landed.planets.find(planet => planet.id === 'halcyon')!.orbitUnits.find(unit => unit.id === transport.id)!;
    expect(dockedTransport).toMatchObject({ docked: true, orbitX: 0, orbitY: 0 });
    expect(dockedTransport.pendingLanding).toBeUndefined();
    expect(battle.attackers).toHaveLength(3);
    expect(battle.defenders.length).toBeGreaterThanOrEqual(1);
    expect(battle.defenders.length).toBeLessThanOrEqual(2);
    expect(battle.defenders.every(unit => unit.faction === 'neutral')).toBe(true);
    expect(landed.planets.find(p => p.id === 'halcyon')!.owner).toBeNull();
    expect(landed.messages.some(message => message.includes('LANDING CONTESTED'))).toBe(true);
  });

  it('merges every simultaneous transport landing into the same ground battle', () => {
    const state = createInitialState();
    state.enemyActionClock = 9999; state.enemyAttackClock = 9999;
    const target = state.planets.find(planet => planet.id === 'nyx')!;
    target.owner = 'enemy';
    target.buildings = [];
    target.orbitUnits = [];
    target.groundUnits = [makeUnit('landing-defender', 'infantry', 'enemy')];

    for (let transportIndex = 0; transportIndex < 10; transportIndex += 1) {
      const cargo = Array.from({ length: 4 }, (_, squadIndex) => makeUnit(`landing-${transportIndex}-${squadIndex}`, 'infantry', 'player'));
      target.orbitUnits.push({
        ...makeUnit(`landing-transport-${transportIndex}`, 'transport', 'player'),
        orbitX: 0, orbitY: 0, phaseArrival: true, pendingLanding: true,
        cargo, loadedUnitIds: cargo.map(unit => unit.id),
      });
    }

    const landed = tick(state, fullLandingApproachSeconds);
    const battle = landed.battles.find(candidate => candidate.planetId === target.id)!;
    const transports = landed.planets.find(planet => planet.id === target.id)!.orbitUnits;
    expect(battle.attackers).toHaveLength(40);
    expect(new Set(battle.attackers.map(unit => unit.id)).size).toBe(40);
    expect(battle.defenders).toHaveLength(1);
    expect(landed.planets.find(planet => planet.id === target.id)!.owner).toBe('enemy');
    expect(transports.every(transport => transport.cargo?.length === 0 && transport.loadedUnitIds?.length === 0)).toBe(true);

    let resolved = landed;
    for (let second = 0; second < 180 && resolved.battles.some(candidate => candidate.planetId === target.id); second += 1) resolved = tick(resolved, 1);
    const secured = resolved.planets.find(planet => planet.id === target.id)!;
    expect(resolved.battles.some(candidate => candidate.planetId === target.id)).toBe(false);
    expect(secured.owner).toBe('player');
    expect(secured.groundUnits.length).toBeGreaterThan(4);
  });

  it('lets one escort destroy a full-health loaded transport before it reaches the planet', () => {
    const state = createInitialState(); const terra = state.planets[0];
    state.enemyActionClock = 9999; state.enemyAttackClock = 9999;
    terra.orbitUnits.push({ ...makeUnit('interceptor', 'escortFrigate', 'player'), orbitX: 275, orbitY: 50 });
    terra.orbitUnits.push({
      ...makeUnit('doomed-transport', 'transport', 'enemy'),
      orbitX: MAX_SHIP_ORBIT_RADIUS, orbitY: 0, orbitTargetX: 0, orbitTargetY: 0,
      phaseArrival: true, pendingLanding: true, cargo: [makeUnit('embarked-enemy', 'infantry', 'enemy')], loadedUnitIds: ['embarked-enemy'],
    });
    expect(SPACE_COMBAT_DAMAGE_MULTIPLIER).toBe(4);
    let intercepted = state;
    for (let second = 0; second < fullLandingApproachSeconds && intercepted.planets[0].orbitUnits.some(unit => unit.id === 'doomed-transport'); second += 1) intercepted = tick(intercepted, 1);
    expect(intercepted.planets[0].orbitUnits.some(unit => unit.id === 'doomed-transport')).toBe(false);
    expect(intercepted.battles).toHaveLength(0);
    expect(intercepted.messages.some(message => message.includes('destroyed during landing approach'))).toBe(true);
  });

  it('starts a ground battle when troops land on an enemy colony', () => {
    let state = createInitialState(); seedPlayerForces(state); state.resources = { metal: 5000, crystal: 5000, gold: 5000 };
    const q = queueUnit(state, 'terra', 'lightTank'); expectOk(q); state = tick(q.state, 30);
    const terra = state.planets.find(p => p.id === 'terra')!, meridian = state.planets.find(p => p.id === 'meridian')!;
    const transport = terra.orbitUnits.find(u => u.kind === 'transport')!;
    meridian.owner = 'player'; meridian.orbitUnits.push(transport); meridian.groundUnits.push(...terra.groundUnits);
    terra.orbitUnits = terra.orbitUnits.filter(u => u.id !== transport.id); terra.groundUnits = [];
    const draven = state.planets.find(p => p.id === 'draven')!;
    draven.owner = 'enemy'; draven.groundUnits.push(makeUnit('draven-defender', 'infantry', 'enemy'));
    const moved = dispatchTransport(state, 'meridian', transport.id, 'draven'); expectOk(moved); state = advanceFleetToArrival(moved.state, transport.id);
    expect(state.battles).toHaveLength(0);
    state = tick(state, fullLandingApproachSeconds);
    expect(state.battles.some(b => b.planetId === 'draven')).toBe(true);
  });

  it('lets Ground Defenses stop an otherwise unopposed landing', () => {
    const state = createInitialState(); const terra = seedPlayerForces(state);
    state.enemyActionClock = 9999; state.enemyAttackClock = 9999;
    const nyx = state.planets.find(p => p.id === 'nyx')!;
    nyx.owner = 'enemy'; nyx.groundUnits = [];
    nyx.buildings.push({ id: 'nyx-ground-defense', kind: 'groundDefense' });
    const transport = terra.orbitUnits.find(unit => unit.kind === 'transport')!;
    const moved = dispatchTransport(state, terra.id, transport.id, nyx.id); expectOk(moved);
    const arrived = advanceFleetToArrival(moved.state, transport.id);
    expect(arrived.battles).toHaveLength(0);
    expect(arrived.planets.find(p => p.id === nyx.id)!.orbitUnits.find(unit => unit.id === transport.id)?.pendingLanding).toBe(true);
    const landed = tick(arrived, fullLandingApproachSeconds);
    const battle = landed.battles.find(candidate => candidate.planetId === nyx.id)!;
    const turret = battle.defenders.find(unit => unit.kind === 'defenseTurret')!;
    expect(landed.planets.find(p => p.id === nyx.id)!.owner).toBe('enemy');
    expect(turret).toMatchObject({ sourceBuildingId: 'nyx-ground-defense', battleX: 88, faction: 'enemy' });
    expect(battle.groundDefenseBuildingIds).toEqual(['nyx-ground-defense']);

    const closedDistance = tick(landed, 10);
    const underFire = tick(closedDistance, 1);
    expect(underFire.battles[0].attackers.some(unit => unit.shields < unit.maxShields)).toBe(true);
    expect(underFire.battles[0].defenders.find(unit => unit.kind === 'defenseTurret')?.battleX).toBe(88);
  });
});

describe('combat recovery rules', () => {
  const damaged = (): Unit => ({ id: 'x', kind: 'escortFrigate', faction: 'player', hp: 80, maxHp: 200, shields: 0, maxShields: 100 });

  it('fully restores ground units after battle', () => {
    const infantry: Unit = { ...damaged(), kind: 'infantry' };
    const [restored] = recoverGroundUnits([infantry]);
    expect(restored.hp).toBe(restored.maxHp); expect(restored.shields).toBe(restored.maxShields);
  });

  it('restores space shields anywhere but hull only at a friendly planet', () => {
    const away = recoverSpaceUnit(damaged(), false, 10);
    expect(away.shields).toBe(50); expect(away.hp).toBe(80);
    const home = recoverSpaceUnit(damaged(), true, 10);
    expect(home.shields).toBe(50); expect(home.hp).toBe(100);
  });

  it('continuously restores shields for ships traveling between systems', () => {
    const state = createInitialState(); const terra = state.planets[0];
    state.enemyActionClock = 9999; state.enemyAttackClock = 9999;
    terra.orbitUnits.push({ ...makeUnit('damaged-traveler', 'escortFrigate', 'player'), hp: 200, shields: 0 });
    const dispatched = dispatchSpaceUnit(state, terra.id, 'damaged-traveler', 'halcyon'); expectOk(dispatched);
    const recovered = tick(dispatched.state, 2);
    const traveler = recovered.fleets.find(fleet => fleet.unit.id === 'damaged-traveler')!.unit;
    expect(traveler.shields).toBe(10);
    expect(traveler.hp).toBe(200);
  });

  it('regenerates orbital platform shields much faster than hull without exceeding maximums', () => {
    const damagedPlatform = { id: 'recovering-platform', kind: 'spaceDefense' as const, hp: 300, maxHp: 420, shields: 100, maxShields: 220 };
    const recovered = recoverOrbitalDefense(damagedPlatform, 2);
    expect(recovered.hp).toBe(300 + ORBITAL_DEFENSE_HULL_REGEN * 2);
    expect(recovered.shields).toBe(100 + ORBITAL_DEFENSE_SHIELD_REGEN * 2);
    expect(ORBITAL_DEFENSE_SHIELD_REGEN).toBeGreaterThan(ORBITAL_DEFENSE_HULL_REGEN * 4);
    expect(recoverOrbitalDefense(recovered, 100)).toMatchObject({ hp: 420, shields: 220 });
    expect(damagedPlatform).toMatchObject({ hp: 300, shields: 100 });
  });

  it('lets orbital defense platforms fire on hostile ships', () => {
    const state = createInitialState(); const cygnus = addOrbitalDefense(state);
    cygnus.orbitUnits = [{ id: 'intruder', kind: 'escortFrigate', faction: 'player', hp: 260, maxHp: 260, shields: 130, maxShields: 130 }];
    const afterFire = tick(state, 10); const intruder = afterFire.planets.find(p => p.id === 'cygnus')!.orbitUnits[0];
    expect(intruder.shields).toBeLessThan(130);
  });

  it('lets escort frigates attack hostile ships in the same orbit', () => {
    const state = createInitialState(); const terra = seedPlayerForces(state);
    const escort = terra.orbitUnits.find(unit => unit.kind === 'escortFrigate')!;
    const hostile: Unit = { id: 'hostile-escort', kind: 'escortFrigate', faction: 'enemy', hp: 260, maxHp: 260, shields: 130, maxShields: 130 };
    terra.orbitUnits = [escort, hostile];

    const afterFire = tick(state, 1); const ships = afterFire.planets.find(p => p.id === 'terra')!.orbitUnits;
    expect(ships.find(unit => unit.id === hostile.id)!.shields).toBeLessThan(hostile.shields);
    expect(ships.find(unit => unit.id === escort.id)!.shields).toBeLessThan(escort.shields);
  });

  it('resolves rapid laser volleys separately from slow heavy missile salvos', () => {
    const duel = (kind: 'escortFrigate' | 'missileFrigate') => {
      const state = createInitialState(); const terra = state.planets[0];
      state.enemyActionClock = 9999; state.enemyAttackClock = 9999;
      terra.orbitUnits = [
        { ...makeUnit(`attacker-${kind}`, kind, 'player'), orbitX: 0, orbitY: 0 },
        { ...makeUnit(`target-${kind}`, 'dreadnought', 'enemy'), hp: 2000, maxHp: 2000, shields: 0, maxShields: 0, orbitX: 100, orbitY: 0 },
      ];
      return tick(state, .1);
    };
    const laserOpening = duel('escortFrigate');
    const missileOpening = duel('missileFrigate');
    const laserTarget = laserOpening.planets[0].orbitUnits.find(unit => unit.id === 'target-escortFrigate')!;
    const missileTarget = missileOpening.planets[0].orbitUnits.find(unit => unit.id === 'target-missileFrigate')!;
    expect(laserOpening.planets[0].orbitUnits.find(unit => unit.id === 'attacker-escortFrigate')!.weaponFlash).toBeGreaterThan(.3);
    expect(missileOpening.planets[0].orbitUnits.find(unit => unit.id === 'attacker-missileFrigate')!.weaponFlash).toBeGreaterThan(.7);
    expect(2000 - missileTarget.hp).toBeGreaterThan(2000 - laserTarget.hp);

    const laserFollowup = tick(laserOpening, .5).planets[0].orbitUnits.find(unit => unit.id === 'target-escortFrigate')!;
    const missileFollowup = tick(missileOpening, .5).planets[0].orbitUnits.find(unit => unit.id === 'target-missileFrigate')!;
    expect(laserFollowup.hp).toBeLessThan(laserTarget.hp);
    expect(missileFollowup.hp).toBe(missileTarget.hp);
  });

  it('requires ships to maneuver into weapon range before exchanging fire', () => {
    const state = createInitialState(); const terra = state.planets[0];
    state.enemyActionClock = 9999; state.enemyAttackClock = 9999;
    const player = { ...makeUnit('range-player', 'escortFrigate', 'player'), orbitX: -150, orbitY: 0 };
    const enemy = { ...makeUnit('range-enemy', 'escortFrigate', 'enemy'), orbitX: 150, orbitY: 0 };
    terra.orbitUnits = [player, enemy];

    const outOfRange = tick(state, 1);
    expect(outOfRange.planets[0].orbitUnits.map(unit => unit.shields)).toEqual([player.shields, enemy.shields]);
    expect(orbitalCombatShots(terra)).toHaveLength(0);

    const maneuvered = maneuverSpaceUnit(outOfRange, terra.id, player.id, -120, 0); expectOk(maneuvered);
    const inRange = tick(maneuvered.state, 2);
    const ships = inRange.planets[0].orbitUnits;
    expect(ships.find(unit => unit.id === enemy.id)!.shields).toBeLessThan(enemy.shields);
    expect(ships.find(unit => unit.id === player.id)!.shields).toBeLessThan(player.shields);
  });

  it('gives missile frigates a longer engagement range than escort frigates', () => {
    const state = createInitialState(); const terra = state.planets[0];
    const missile = { ...makeUnit('long-range', 'missileFrigate', 'player'), orbitX: 0, orbitY: 0 };
    const escort = { ...makeUnit('short-range', 'escortFrigate', 'enemy'), orbitX: 350, orbitY: 0 };
    terra.orbitUnits = [missile, escort];

    expect(UNITS.missileFrigate.range).toBeGreaterThan(UNITS.escortFrigate.range);
    expect(orbitalCombatShots(terra)).toEqual([expect.objectContaining({ attackerId: missile.id, targetId: escort.id })]);
  });

  it('gives legacy orbital defenses persistent shields and hull', () => {
    const state = createInitialState(); const defense = addOrbitalDefense(state).buildings.find(b => b.kind === 'spaceDefense')!;
    delete defense.hp; delete defense.maxHp; delete defense.shields; delete defense.maxShields;
    const migrated = migrateGameState(state);
    expect(migrated.planets.find(p => p.id === 'cygnus')!.buildings.find(b => b.kind === 'spaceDefense')).toMatchObject({
      hp: ORBITAL_DEFENSE_STATS.hp,
      maxHp: ORBITAL_DEFENSE_STATS.hp,
      shields: ORBITAL_DEFENSE_STATS.shields,
      maxShields: ORBITAL_DEFENSE_STATS.shields,
    });
  });

  it('lets opposing ships damage and destroy orbital defense platforms', () => {
    const state = createInitialState(); const cygnus = addOrbitalDefense(state);
    cygnus.orbitUnits = [{ id: 'cruiser', kind: 'lightCruiser', faction: 'player', hp: 480, maxHp: 480, shields: 240, maxShields: 240 }];
    const underFire = tick(state, 10);
    const damaged = underFire.planets.find(p => p.id === 'cygnus')!.buildings.find(b => b.kind === 'spaceDefense')!;
    expect(damaged.shields).toBeLessThan(ORBITAL_DEFENSE_STATS.shields);

    const destroyed = tick(state, 100);
    expect(destroyed.planets.find(p => p.id === 'cygnus')!.buildings.some(b => b.kind === 'spaceDefense')).toBe(false);
    expect(destroyed.messages).toContain('1 orbital defense platform destroyed at Cygnus Reach.');
  });

  it('supports locking an enemy orbital defense as the priority target', () => {
    const state = createInitialState(); const cygnus = addOrbitalDefense(state);
    cygnus.orbitUnits.push({ id: 'attacker', kind: 'escortFrigate', faction: 'player', hp: 260, maxHp: 260, shields: 130, maxShields: 130 });
    const defenseId = cygnus.buildings.find(b => b.kind === 'spaceDefense')!.id;
    const focused = setOrbitFocusTarget(state, cygnus.id, defenseId);
    expect(focused.planets.find(p => p.id === 'cygnus')!.orbitFocusTargetId).toBe(defenseId);
    expect(state.planets.find(p => p.id === 'cygnus')!.orbitFocusTargetId).toBeUndefined();
  });
});

describe('positional ground combat', () => {
  const combatUnit = (id: string, kind: GroundUnitKind, faction: 'player' | 'enemy', battleX: number): Unit => ({
    id, kind, faction, hp: UNITS[kind].hp, maxHp: UNITS[kind].hp, shields: UNITS[kind].shields, maxShields: UNITS[kind].shields, battleX, battleY: 50,
  });

  it('advances units without dealing damage until a target enters weapon range', () => {
    const state = createInitialState();
    state.battles = [{ planetId: 'draven', attackers: [combatUnit('a1', 'infantry', 'player', 12)], defenders: [combatUnit('d1', 'infantry', 'enemy', 88)] }];
    const advanced = tick(state, 1);
    const battle = advanced.battles[0];
    expect(battle.attackers[0].battleX).toBeGreaterThan(12);
    expect(battle.defenders[0].battleX).toBeLessThan(88);
    expect(battle.attackers[0].shields).toBe(UNITS.infantry.shields);
    expect(battle.defenders[0].shields).toBe(UNITS.infantry.shields);
  });

  it('lets artillery hold position and fire from its longer range', () => {
    const state = createInitialState();
    state.battles = [{ planetId: 'draven', attackers: [combatUnit('a1', 'artillery', 'player', 40)], defenders: [combatUnit('d1', 'infantry', 'enemy', 68)] }];
    const fired = tick(state, 1);
    const battle = fired.battles[0];
    expect(battle.attackers[0].battleX).toBe(40);
    expect(battle.defenders[0].shields).toBeLessThan(UNITS.infantry.shields);
    expect(UNITS.artillery.range).toBeGreaterThan(UNITS.infantry.range);
  });

  it('removes a Ground Defense building when its turret is destroyed', () => {
    const state = createInitialState(); const draven = state.planets.find(p => p.id === 'draven')!;
    draven.owner = 'enemy';
    draven.buildings.push({ id: 'ground-defense-doomed', kind: 'groundDefense' });
    const turret = { ...combatUnit('ground-defense-ground-defense-doomed', 'defenseTurret', 'enemy', 70), hp: 1, shields: 0, sourceBuildingId: 'ground-defense-doomed' };
    state.battles = [{ planetId: draven.id, attackerFaction: 'player', attackers: [combatUnit('siege', 'siegeWalker', 'player', 40)], defenders: [turret], groundDefenseBuildingIds: ['ground-defense-doomed'] }];
    const resolved = tick(state, 1);
    expect(resolved.battles).toHaveLength(0);
    expect(resolved.planets.find(p => p.id === draven.id)!.buildings.some(building => building.id === 'ground-defense-doomed')).toBe(false);
  });
});
