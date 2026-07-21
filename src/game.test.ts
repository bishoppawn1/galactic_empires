import { describe, expect, it } from 'vitest';
import {
  beginResearch, constructBuilding, createCompetitiveState, createInitialState, dispatchSpaceUnit, dispatchSpaceUnits, dispatchTransport, dockSpaceUnit, dockSpaceUnits, maneuverSpaceUnit, maneuverSpaceUnits,
  applyGameCommand, findPlanetPath, groundProductionMultiplier, isGameCommand, migrateGameState, queueUnit, recoverGroundUnits, recoverSpaceUnit, setOrbitFocusTarget, spaceYards, swapPlayerPerspective, tick,
  localPlanetConnections,
  GRAVITY_WELL_RADIUS, LANDING_APPROACH_SPEED, ORBIT_MANEUVER_SPEED, PHASE_GATE_CHARGE_SECONDS, ORBITAL_DEFENSE_STATS, RESEARCH, RESEARCH_UNLOCKS, SPACE_COMBAT_DAMAGE_MULTIPLIER, UNITS, type GroundUnitKind, type Unit, type UnitKind,
} from './game';

function expectOk<T extends { ok: boolean }>(result: T): asserts result is T & { ok: true } {
  expect(result.ok).toBe(true);
}

const makeUnit = (id: string, kind: UnitKind, faction: 'player' | 'enemy'): Unit => ({
  id, kind, faction, hp: UNITS[kind].hp, maxHp: UNITS[kind].hp, shields: UNITS[kind].shields, maxShields: UNITS[kind].shields,
});

const fullLandingApproachSeconds = Math.ceil((GRAVITY_WELL_RADIUS - 18) / LANDING_APPROACH_SPEED);

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
});

describe('campaign configuration', () => {
  it('creates the requested number of worlds for every map size', () => {
    expect(createInitialState({ mapSize: 'small', difficulty: 'commander' }).planets).toHaveLength(7);
    expect(createInitialState({ mapSize: 'medium', difficulty: 'commander' }).planets).toHaveLength(11);
    expect(createInitialState({ mapSize: 'large', difficulty: 'commander' }).planets).toHaveLength(15);
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
    expect(migrated.config).toEqual({ mapSize: 'small', difficulty: 'commander' });
    expect(migrated.enemyMissionCount).toBe(0);
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
  it('defines four tiers of research with nine visible unlock packages', () => {
    expect(Object.keys(RESEARCH)).toHaveLength(9);
    expect(RESEARCH.heavyArmor.requires).toBe('groundWarfare');
    expect(RESEARCH.carrierOperations.requires).toBe('fleetLogistics');
    expect(RESEARCH.titanEngineering.requires).toBe('capitalShips');
    expect(RESEARCH_UNLOCKS.titanEngineering).toContain('Titan Dreadnought');
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
    expect(Math.hypot(landingTransport.orbitX!, landingTransport.orbitY!)).toBeCloseTo(GRAVITY_WELL_RADIUS - 18);
    expect(landingTransport.pendingLanding).toBe(true);
    expect(arrived.battles).toHaveLength(0);
    const landed = tick(arrived, fullLandingApproachSeconds);
    const battle = landed.battles.find(candidate => candidate.planetId === 'terra');
    expect(battle?.attackerFaction).toBe('enemy');
    expect(battle?.attackers.every(unit => unit.faction === 'enemy')).toBe(true);
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

  it('holds arrived combat ships at the system edge ready for immediate orders', () => {
    const state = createInitialState();
    state.planets[0].orbitUnits.push({ id: 'frigate', kind: 'escortFrigate', faction: 'player', hp: 260, maxHp: 260, shields: 130, maxShields: 130 });
    const order = dispatchSpaceUnit(state, 'terra', 'frigate', 'halcyon'); expectOk(order);
    const arrived = advanceFleetToArrival(order.state, 'frigate');
    const frigate = arrived.planets.find(p => p.id === 'halcyon')!.orbitUnits.find(u => u.id === 'frigate')!;
    expect(Math.hypot(frigate.orbitX!, frigate.orbitY!)).toBeCloseTo(GRAVITY_WELL_RADIUS - 18, 1);
    expect(frigate.phaseArrival).toBeUndefined();
    expect(frigate.orbitTargetX).toBeUndefined();

    const holding = tick(arrived, 30).planets.find(p => p.id === 'halcyon')!.orbitUnits.find(u => u.id === 'frigate')!;
    expect(holding.orbitX).toBe(frigate.orbitX);
    expect(holding.orbitY).toBe(frigate.orbitY);

    const returnOrder = dispatchSpaceUnit(arrived, 'halcyon', 'frigate', 'terra'); expectOk(returnOrder);
    expect(returnOrder.state.fleets[0]).toMatchObject({ originId: 'halcyon', finalDestinationId: 'terra' });
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
    expect(moved.state.planets[0].orbitUnits[0].orbitY).toBe(-180);
    const underway = tick(moved.state, 1);
    expect(Math.hypot(underway.planets[0].orbitUnits[0].orbitX!, underway.planets[0].orbitUnits[0].orbitY! + 180)).toBeCloseTo(ORBIT_MANEUVER_SPEED);
    expect(underway.planets[0].orbitUnits[0].orbitY).toBeGreaterThan(-180);
    expect(underway.planets[0].orbitUnits[0].orbitY).toBeLessThan(25);
    const positioned = tick(underway, 20);
    expect(positioned.planets[0].orbitUnits[0]).toMatchObject({ orbitX: 40, orbitY: 25 });
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
    expect(GRAVITY_WELL_RADIUS).toBe(600);
    expect(Math.hypot(target.orbitTargetX!, target.orbitTargetY!)).toBeCloseTo(GRAVITY_WELL_RADIUS - 24);
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

  it('moves and phase-jumps a selected ship group in formation', () => {
    const state = createInitialState(); const terra = seedPlayerForces(state); const ids = terra.orbitUnits.map(u => u.id);
    const formation = maneuverSpaceUnits(state, 'terra', ids, 60, 30); expectOk(formation);
    const positions = formation.state.planets[0].orbitUnits.map(u => `${u.orbitX},${u.orbitY}`);
    expect(new Set(positions).size).toBe(ids.length);
    const jump = dispatchSpaceUnits(formation.state, 'terra', ids, 'halcyon'); expectOk(jump);
    expect(jump.state.fleets).toHaveLength(ids.length);
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
    expect(Math.hypot(approaching.orbitX!, approaching.orbitY!)).toBeCloseTo(GRAVITY_WELL_RADIUS - 18, 1);
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
    terra.orbitUnits.push(makeUnit('interceptor', 'escortFrigate', 'player'));
    terra.orbitUnits.push({
      ...makeUnit('doomed-transport', 'transport', 'enemy'),
      orbitX: GRAVITY_WELL_RADIUS - 18, orbitY: 0, orbitTargetX: 0, orbitTargetY: 0,
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
