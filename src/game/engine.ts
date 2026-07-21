import {
  DEFAULT_GAME_CONFIG,
  type Building,
  type BuildingKind,
  type Definition,
  type EnemyDifficulty,
  type Faction,
  type Fleet,
  type GameConfig,
  type GameState,
  type GroundBattle,
  type GroundUnitKind,
  type MapSize,
  type Planet,
  type PlanetConnection,
  type QueueItem,
  type ResearchId,
  type Resource,
  type ResourcePool,
  type SpaceUnitKind,
  type Unit,
  type UnitDefinition,
  type UnitFaction,
  type UnitKind,
} from './types';
import { findPlanetPath } from './navigation';
import {
  BUILDINGS, BUILDING_KINDS, GRAVITY_WELL_RADIUS, GROUND_KINDS, LANDING_APPROACH_SPEED,
  ORBITAL_DEFENSE_STATS, ORBIT_MANEUVER_SPEED, PHASE_GATE_CHARGE_SECONDS, RESEARCH,
  RESEARCH_UNLOCKS, RESOURCE_COLLECTION_MULTIPLIER, SPACE_COMBAT_DAMAGE_MULTIPLIER, SPACE_KINDS, SYSTEM_EXIT_SPEED, UNITS, pool,
} from './definitions';

export * from './types';
export * from './navigation';
export * from './definitions';

const unit = (id: string, kind: UnitKind, faction: UnitFaction): Unit => ({
  id, kind, faction, hp: UNITS[kind].hp, maxHp: UNITS[kind].hp,
  shields: UNITS[kind].shields, maxShields: UNITS[kind].shields,
  ...(UNITS[kind].capacity || kind === 'transport' ? { loadedUnitIds: [] } : {}),
});

const orbitSlot = (index: number) => {
  const slotsPerRing = 8;
  const ring = Math.floor(index / slotsPerRing);
  const slot = index % slotsPerRing;
  const radius = 180 + ring * 54;
  const angle = -Math.PI / 2 + slot * Math.PI * 2 / slotsPerRing + ring * Math.PI / slotsPerRing;
  return { orbitX: Math.cos(angle) * radius, orbitY: Math.sin(angle) * radius };
};

function nextOpenOrbitPosition(ships: Unit[]) {
  for (let slot = 0; slot < 64; slot += 1) {
    const candidate = orbitSlot(slot);
    if (ships.every(ship => {
      const x = ship.orbitTargetX ?? ship.orbitX, y = ship.orbitTargetY ?? ship.orbitY;
      return typeof x !== 'number' || typeof y !== 'number' || Math.hypot(x - candidate.orbitX, y - candidate.orbitY) >= 32;
    })) return candidate;
  }
  return orbitSlot(ships.length);
}

function placeInOpenOrbit(planet: Planet, ship: Unit, otherShips = planet.orbitUnits) {
  delete ship.docked;
  const position = nextOpenOrbitPosition(otherShips.filter(other => other.id !== ship.id));
  ship.orbitX = position.orbitX;
  ship.orbitY = position.orbitY;
}

function targetOpenOrbit(planet: Planet, ship: Unit, otherShips = planet.orbitUnits) {
  delete ship.docked;
  const position = nextOpenOrbitPosition(otherShips.filter(other => other.id !== ship.id));
  ship.orbitTargetX = position.orbitX;
  ship.orbitTargetY = position.orbitY;
}

function placeAtSystemEdge(origin: Planet, destination: Planet, ship: Unit) {
  delete ship.docked;
  const baseAngle = Math.atan2(origin.y - destination.y, origin.x - destination.x);
  const formationIndex = destination.orbitUnits.filter(unit => unit.phaseArrival).length;
  const formationOffset = formationIndex === 0 ? 0 : Math.ceil(formationIndex / 2) * (formationIndex % 2 ? .075 : -.075);
  const angle = baseAngle + formationOffset;
  const radius = GRAVITY_WELL_RADIUS - 18;
  ship.orbitX = Math.cos(angle) * radius;
  ship.orbitY = Math.sin(angle) * radius;
  ship.phaseArrival = true;
  if ((UNITS[ship.kind].capacity ?? 0) > 0 && (ship.cargo?.length ?? 0) > 0) {
    ship.pendingLanding = true;
    ship.orbitTargetX = 0;
    ship.orbitTargetY = 0;
  } else {
    targetOpenOrbit(destination, ship);
  }
}

function ensureOrbitPositions(planet: Planet) {
  const placed: Unit[] = [];
  for (const ship of planet.orbitUnits) {
    if (ship.docked) {
      ship.orbitX = 0;
      ship.orbitY = 0;
      delete ship.orbitTargetX;
      delete ship.orbitTargetY;
      continue;
    }
    const hasPosition = typeof ship.orbitX === 'number' && typeof ship.orbitY === 'number'
      && (ship.pendingLanding || Math.hypot(ship.orbitX, ship.orbitY) >= 24);
    const overlaps = hasPosition && placed.some(other => typeof other.orbitX === 'number' && typeof other.orbitY === 'number'
      && Math.hypot(other.orbitX - ship.orbitX!, other.orbitY - ship.orbitY!) < 8);
    if (!hasPosition || overlaps) placeInOpenOrbit(planet, ship, placed);
    placed.push(ship);
  }
}

function ensureOrbitalDefenseHealth(building: Building) {
  if (building.kind !== 'spaceDefense') return;
  building.maxHp ??= ORBITAL_DEFENSE_STATS.hp;
  building.hp ??= building.maxHp;
  building.maxShields ??= ORBITAL_DEFENSE_STATS.shields;
  building.shields ??= building.maxShields;
}

const limits = (mineMax: ResourcePool, industryMax = 3): Record<BuildingKind, number> => ({
  metalMine: mineMax.metal, crystalMine: mineMax.crystal, goldMine: mineMax.gold,
  groundFactory: industryMax, advancedGroundFactory: Math.max(1, industryMax - 1),
  spaceFactory: industryMax, advancedSpaceFactory: Math.max(1, industryMax - 1),
  groundDefense: 4, antiSpaceDefense: 3, spaceDefense: 3, researchLab: 2,
});

const planet = (id: string, name: string, x: number, y: number, color: string, owner: Faction, resourceYield: ResourcePool, mineMax: ResourcePool, industryMax = 3): Planet => ({
  id, name, x, y, color, owner, resourceYield, buildingLimits: limits(mineMax, industryMax),
  buildings: [], groundUnits: [], orbitUnits: [], groundQueue: [], spaceQueue: [],
});

const MAP_PLANETS: Record<MapSize, number> = { small: 7, medium: 11, large: 15 };

const seedNeutralGarrisons = (planets: Planet[]) => {
  const kinds: GroundUnitKind[] = ['infantry', 'recon', 'antiVehicle'];
  planets.filter(p => p.owner === null && !p.groundUnits.length).forEach((p, planetIndex) => {
    const count = 1 + planetIndex % 2;
    p.groundUnits = Array.from({ length: count }, (_, unitIndex) =>
      unit(`neutral-${p.id}-${unitIndex + 1}`, kinds[(planetIndex + unitIndex) % kinds.length], 'neutral'));
  });
};

export const mapPlanetCount = (size: MapSize) => MAP_PLANETS[size];
export const enemyDifficultyMultiplier = (difficulty: EnemyDifficulty) => difficulty === 'cadet' ? .78 : difficulty === 'admiral' ? 1.38 : 1;

export function createInitialState(requestedConfig: GameConfig = DEFAULT_GAME_CONFIG): GameState {
  const config = { ...requestedConfig };
  const terra = planet('terra', 'Terra Nova', 22, 56, '#55d6be', 'player', pool(1, .9, .65), pool(5, 4, 3), 4);
  terra.buildings = [
    { id: 'b1', kind: 'metalMine' }, { id: 'b2', kind: 'crystalMine' },
    { id: 'b3', kind: 'goldMine' }, { id: 'b4', kind: 'groundFactory' },
    { id: 'b5', kind: 'spaceFactory', spaceQueue: [] },
  ];

  const cygnus = planet('cygnus', 'Cygnus Reach', 76, 30, '#e86a92', 'enemy', pool(.7, 1.2, .9), pool(3, 5, 4));
  cygnus.buildings = [
    { id: 'eb1', kind: 'metalMine' }, { id: 'eb2', kind: 'crystalMine' },
    { id: 'eb3', kind: 'goldMine' }, { id: 'eb4', kind: 'groundFactory' },
    { id: 'eb5', kind: 'spaceFactory', spaceQueue: [] },
  ];

  const draven = planet('draven', 'Draven', 62, 72, '#e86a92', null, pool(1.1, .6, 1), pool(5, 3, 4));

  const aegis = planet('aegis', 'Aegis Prime', 92, 18, '#ed6a9a', null, pool(.65, 1.15, .8), pool(3, 5, 4));
  const zenith = planet('zenith', 'Zenith', 95, 88, '#e06a8f', null, pool(.8, .7, 1.25), pool(4, 3, 6));

  const corePlanets = [
    terra,
    planet('nyx', 'Nyx', 42, 27, '#b7a4ff', null, pool(.65, 1.25, .5), pool(3, 6, 2)),
    planet('halcyon', 'Halcyon', 45, 78, '#ffc857', null, pool(1.2, .55, .9), pool(6, 2, 4)),
    planet('meridian', 'Meridian', 68, 52, '#70c1b3', null, pool(.55, .9, 1.3), pool(2, 4, 6)),
    cygnus,
    draven,
    planet('vesta', 'Vesta', 87, 68, '#ca7df9', null, pool(1.35, .7, .45), pool(6, 3, 2)),
  ];
  const mediumPlanets = [
    planet('orion', 'Orion Verge', 12, 28, '#8fd3ff', null, pool(.8, 1.05, .55), pool(4, 5, 3)),
    planet('kepler', 'Kepler', 28, 10, '#b89cff', null, pool(1.15, .6, .7), pool(5, 3, 4)),
    planet('solara', 'Solara', 58, 10, '#ffbd66', null, pool(.75, .8, 1.2), pool(3, 4, 6)),
    aegis,
  ];
  const largePlanets = [
    planet('talos', 'Talos', 14, 80, '#74c8b5', null, pool(1.25, .55, .7), pool(6, 3, 4)),
    planet('ember', 'Ember Crown', 34, 94, '#f58a68', null, pool(.9, .7, 1.1), pool(4, 3, 5)),
    planet('aurora', 'Aurora', 70, 92, '#75cfff', null, pool(.6, 1.3, .75), pool(3, 6, 4)),
    zenith,
  ];
  const planets = [...corePlanets, ...(config.mapSize === 'small' ? [] : mediumPlanets), ...(config.mapSize === 'large' ? largePlanets : [])];
  seedNeutralGarrisons(planets);
  return {
    config,
    resources: pool(520, 420, 280),
    enemyResources: pool(520, 420, 280),
    planets,
    fleets: [], battles: [], completedResearch: [], enemyCompletedResearch: [], researchQueue: [],
    enemyActionClock: 8, enemyAttackClock: config.difficulty === 'cadet' ? 180 : config.difficulty === 'admiral' ? 100 : 130, enemyMissionCount: 0,
    elapsed: 0, nextId: 100, neutralGarrisonsInitialized: true,
    messages: ['COMMAND ONLINE — Terra Nova awaits your orders.'],
  };
}

const clone = (state: GameState): GameState => structuredClone(state);

export function migrateGameState(input: GameState): GameState {
  const state = clone(input);
  state.config ??= { mapSize: state.planets.length <= 7 ? 'small' : state.planets.length <= 11 ? 'medium' : 'large', difficulty: 'commander' };
  state.enemyResources ??= pool(520, 420, 280);
  state.enemyCompletedResearch ??= [];
  state.enemyActionClock ??= 8;
  state.enemyAttackClock ??= state.config.difficulty === 'cadet' ? 180 : state.config.difficulty === 'admiral' ? 100 : 130;
  state.enemyMissionCount ??= 0;
  if (!state.neutralGarrisonsInitialized) {
    seedNeutralGarrisons(state.planets.filter(p => !state.battles.some(battle => battle.planetId === p.id)));
    state.neutralGarrisonsInitialized = true;
  }
  for (const p of state.planets) {
    p.groundQueue ??= [];
    p.spaceQueue ??= [];
    const yards = spaceYards(p);
    for (const yard of yards) yard.spaceQueue ??= [];
    if (yards.length && p.spaceQueue.length) {
      p.spaceQueue.forEach((item, index) => yards[index % yards.length].spaceQueue!.push(item));
      p.spaceQueue = [];
    }
    p.buildings.forEach(ensureOrbitalDefenseHealth);
    if (p.orbitFocusTargetId && !p.buildings.some(building => building.id === p.orbitFocusTargetId && building.kind === 'spaceDefense')) delete p.orbitFocusTargetId;
    for (const ship of p.orbitUnits) {
      if (ship.pendingLanding) { ship.phaseArrival = true; ship.orbitTargetX ??= 0; ship.orbitTargetY ??= 0; }
    }
    ensureOrbitPositions(p);
  }
  for (const fleet of state.fleets) {
    fleet.route ??= [];
    fleet.finalDestinationId ??= fleet.destinationId;
    fleet.phase ??= 'tunnel';
  }
  for (const battle of state.battles) {
    const attackingUnitFaction = battle.attackers[0]?.faction;
    battle.attackerFaction ??= attackingUnitFaction === 'enemy' ? 'enemy' : 'player';
    ensureGroundDefenseBattleUnits(state, battle);
    ensureBattlePositions(battle);
  }
  return state;
}

const addMessage = (state: GameState, message: string) => { state.messages = [message, ...state.messages].slice(0, 8); };
const getPlanet = (state: GameState, id: string) => state.planets.find(p => p.id === id);
export const canAfford = (resources: ResourcePool, cost: ResourcePool) =>
  resources.metal >= cost.metal && resources.crystal >= cost.crystal && resources.gold >= cost.gold;
export const researchIncomeMultiplier = (completed: ResearchId[]) => completed.includes('quantumExtraction') ? 1.25 : 1;
export const groundProductionMultiplier = (planet: Planet) => Math.max(1, planet.buildings.filter(building =>
  building.kind === 'groundFactory' || building.kind === 'advancedGroundFactory').length);
export const isSpaceYard = (building: Building) => building.kind === 'spaceFactory' || building.kind === 'advancedSpaceFactory';
export const spaceYards = (planet: Planet) => planet.buildings.filter(isSpaceYard);
const spend = (resources: ResourcePool, cost: ResourcePool) => {
  resources.metal -= cost.metal; resources.crystal -= cost.crystal; resources.gold -= cost.gold;
};
const hasResearch = (state: GameState, id?: ResearchId) => !id || state.completedResearch.includes(id);

export type GameResult = { ok: true; state: GameState } | { ok: false; state: GameState; error: string };
const fail = (state: GameState, error: string): GameResult => ({ ok: false, state, error });
const pass = (state: GameState): GameResult => ({ ok: true, state });

export function constructBuilding(input: GameState, planetId: string, kind: BuildingKind): GameResult {
  const state = clone(input); const p = getPlanet(state, planetId); const def = BUILDINGS[kind];
  if (!p || p.owner !== 'player') return fail(input, 'Select one of your colonies.');
  const count = p.buildings.filter(b => b.kind === kind).length;
  if (count >= p.buildingLimits[kind]) return fail(input, `${p.name} has reached its ${def.label} limit.`);
  if (!hasResearch(state, def.requires)) return fail(input, `Requires ${RESEARCH[def.requires!].label}.`);
  if (!canAfford(state.resources, def.cost)) return fail(input, 'Insufficient resources.');
  spend(state.resources, def.cost);
  const building: Building = { id: `b${state.nextId++}`, kind };
  if (isSpaceYard(building)) building.spaceQueue = [];
  ensureOrbitalDefenseHealth(building);
  p.buildings.push(building);
  addMessage(state, `${def.label} ${count + 1}/${p.buildingLimits[kind]} constructed on ${p.name}.`);
  return pass(state);
}

export function queueUnit(input: GameState, planetId: string, kind: UnitKind, yardIds?: string[]): GameResult {
  const state = clone(input); const p = getPlanet(state, planetId); const def = UNITS[kind];
  if (kind === 'defenseTurret') return fail(input, 'Defense Turrets deploy automatically from Ground Defenses.');
  if (!p || p.owner !== 'player') return fail(input, 'Production requires a friendly colony.');
  const needed = def.factory === 'ground' ? 'groundFactory' : 'spaceFactory';
  if (!p.buildings.some(b => b.kind === needed || b.kind === `advanced${needed[0].toUpperCase()}${needed.slice(1)}`)) return fail(input, `Requires a ${def.factory === 'ground' ? 'Ground Factory' : 'Space Yard'}.`);
  if (!hasResearch(state, def.requires)) return fail(input, `Requires ${RESEARCH[def.requires!].label}.`);
  if (def.factory === 'ground') {
    if (def.advancedFactory && !p.buildings.some(building => building.kind === 'advancedGroundFactory')) return fail(input, 'Requires an Advanced Ground Factory.');
    if (!canAfford(state.resources, def.cost)) return fail(input, 'Insufficient resources.');
    spend(state.resources, def.cost);
    p.groundQueue.push({ id: `q${state.nextId++}`, kind, remaining: def.time!, total: def.time! });
    addMessage(state, `${def.label} added to ${p.name} production.`);
    return pass(state);
  }

  const yards = spaceYards(p);
  const eligibleYards = def.advancedFactory ? yards.filter(yard => yard.kind === 'advancedSpaceFactory') : yards;
  if (!eligibleYards.length) return fail(input, def.advancedFactory ? 'Advanced hulls require an Advanced Space Yard.' : 'Requires a Space Yard.');
  const automaticYard = eligibleYards.reduce((best, yard) => (yard.spaceQueue?.length ?? 0) < (best.spaceQueue?.length ?? 0) ? yard : best);
  const requestedIds = yardIds?.length ? [...new Set(yardIds)] : [automaticYard.id];
  const targets = requestedIds.map(id => yards.find(yard => yard.id === id));
  if (targets.some(yard => !yard)) return fail(input, 'Select a friendly Space Yard at this colony.');
  if (def.advancedFactory && targets.some(yard => yard?.kind !== 'advancedSpaceFactory')) return fail(input, 'Advanced hulls require an Advanced Space Yard.');
  const totalCost = pool(def.cost.metal * targets.length, def.cost.crystal * targets.length, def.cost.gold * targets.length);
  if (!canAfford(state.resources, totalCost)) return fail(input, `Insufficient resources to queue ${targets.length} ship${targets.length === 1 ? '' : 's'}.`);
  spend(state.resources, totalCost);
  for (const yard of targets as Building[]) {
    yard.spaceQueue ??= [];
    yard.spaceQueue.push({ id: `q${state.nextId++}`, kind, remaining: def.time!, total: def.time! });
  }
  if (yardIds?.length) addMessage(state, `${def.label} added to ${targets.length} Space Yard queue${targets.length === 1 ? '' : 's'} at ${p.name}.`);
  else addMessage(state, `${def.label} auto-routed to Space Yard ${yards.indexOf(automaticYard) + 1} at ${p.name}.`);
  return pass(state);
}

export function beginResearch(input: GameState, id: ResearchId): GameResult {
  const state = clone(input); const def = RESEARCH[id];
  if (!state.planets.some(p => p.owner === 'player' && p.buildings.some(b => b.kind === 'researchLab'))) return fail(input, 'Construct a Research Lab first.');
  if (state.completedResearch.includes(id) || state.researchQueue.some(r => r.id === id)) return fail(input, 'Research already acquired or active.');
  if (!hasResearch(state, def.requires)) return fail(input, `Requires ${RESEARCH[def.requires!].label}.`);
  if (!canAfford(state.resources, def.cost)) return fail(input, 'Insufficient resources.');
  spend(state.resources, def.cost);
  state.researchQueue.push({ id, remaining: def.time!, total: def.time! });
  addMessage(state, `${def.label} research initiated.`);
  return pass(state);
}

function embarkAvailableSquads(state: GameState, origin: Planet, ship: Unit, faction: 'player' | 'enemy' = 'player') {
  const capacity = (UNITS[ship.kind].capacity ?? 0) - (ship.cargo?.length ?? 0);
  if (!capacity || origin.owner !== faction) return 0;
  const boarding = origin.groundUnits.filter(u => u.faction === faction).slice(0, capacity);
  const boardingIds = new Set(boarding.map(u => u.id));
  origin.groundUnits = origin.groundUnits.filter(u => !boardingIds.has(u.id));
  ship.cargo = [...(ship.cargo ?? []), ...boarding];
  ship.loadedUnitIds = ship.cargo.map(u => u.id);
  if (boarding.length && faction === 'player') addMessage(state, `${boarding.length} squad${boarding.length === 1 ? '' : 's'} automatically embarked at ${origin.name}.`);
  return boarding.length;
}

export function dockSpaceUnits(input: GameState, planetId: string, unitIds: string[]): GameResult {
  const state = clone(input); const p = getPlanet(state, planetId);
  const ships = p?.orbitUnits.filter(u => unitIds.includes(u.id) && u.faction === 'player') ?? [];
  if (!p || !ships.length || ships.length !== unitIds.length) return fail(input, 'Selected ships are not inside this gravity well.');
  if (ships.some(ship => ship.phaseArrival)) return fail(input, 'Ships cannot receive new orders until their phase arrival is complete.');
  const selectedIds = new Set(unitIds);
  const occupied = p.orbitUnits.filter(ship => !selectedIds.has(ship.id));
  ships.forEach(ship => {
    targetOpenOrbit(p, ship, occupied);
    occupied.push(ship);
    embarkAvailableSquads(state, p, ship);
  });
  addMessage(state, `${ships.length} ship${ships.length === 1 ? '' : 's'} moving to dock over ${p.name}.`);
  return pass(state);
}

export const dockSpaceUnit = (input: GameState, planetId: string, unitId: string) => dockSpaceUnits(input, planetId, [unitId]);

export function maneuverSpaceUnits(input: GameState, planetId: string, unitIds: string[], orbitX: number, orbitY: number): GameResult {
  const state = clone(input); const p = getPlanet(state, planetId);
  const ships = p?.orbitUnits.filter(u => unitIds.includes(u.id) && u.faction === 'player') ?? [];
  if (!p || !ships.length || ships.length !== unitIds.length) return fail(input, 'Selected ships are not inside this gravity well.');
  if (ships.some(ship => ship.phaseArrival)) return fail(input, 'Ships cannot receive new orders until their phase arrival is complete.');
  ships.forEach((ship, index) => {
    delete ship.docked;
    const column = index % 4, row = Math.floor(index / 4);
    const targetX = orbitX + (column - Math.min(ships.length - 1, 3) / 2) * 24;
    const targetY = orbitY + row * 24;
    const maximumRadius = GRAVITY_WELL_RADIUS - 24;
    const length = Math.hypot(targetX, targetY); const scale = length > maximumRadius ? maximumRadius / length : 1;
    ship.orbitTargetX = targetX * scale; ship.orbitTargetY = targetY * scale;
  });
  addMessage(state, `${ships.length} ship${ships.length === 1 ? '' : 's'} maneuvering inside ${p.name} gravity well.`);
  return pass(state);
}

export const maneuverSpaceUnit = (input: GameState, planetId: string, unitId: string, orbitX: number, orbitY: number) => maneuverSpaceUnits(input, planetId, [unitId], orbitX, orbitY);

const phaseTravelTime = (from: Planet, to: Planet) => Math.max(12, Math.hypot(to.x - from.x, to.y - from.y) * .85);

const systemBorderOffset = (from: Planet, to: Planet) => {
  const dx = to.x - from.x, dy = to.y - from.y;
  const distance = Math.hypot(dx, dy) || 1;
  const radius = GRAVITY_WELL_RADIUS - 18;
  return { x: dx / distance * radius, y: dy / distance * radius };
};

function beginSystemExit(fleet: Fleet, origin: Planet, destination: Planet, departureX: number, departureY: number) {
  const border = systemBorderOffset(origin, destination);
  fleet.phase = 'exiting';
  fleet.departureX = departureX;
  fleet.departureY = departureY;
  fleet.progress = 0;
  fleet.travelTime = Math.max(.1, Math.hypot(border.x - departureX, border.y - departureY) / SYSTEM_EXIT_SPEED);
}

function dispatchFactionUnits(state: GameState, origin: Planet, ships: Unit[], destination: Planet, faction: 'player' | 'enemy') {
  const path = findPlanetPath(state.planets, origin.id, destination.id);
  if (!path || path.length < 2) return false;
  const firstDestination = getPlanet(state, path[1])!;
  const selected = new Set(ships.map(ship => ship.id));
  origin.orbitUnits = origin.orbitUnits.filter(unit => !selected.has(unit.id));
  for (const ship of ships) {
    embarkAvailableSquads(state, origin, ship, faction);
    const departureX = ship.orbitX ?? 0, departureY = ship.orbitY ?? 0;
    delete ship.orbitTargetX; delete ship.orbitTargetY;
    const fleet: Fleet = { id: `f${state.nextId++}`, faction, originId: origin.id, destinationId: firstDestination.id, unit: ship, progress: 0, travelTime: 0, route: path.slice(2), finalDestinationId: destination.id };
    beginSystemExit(fleet, origin, firstDestination, departureX, departureY);
    state.fleets.push(fleet);
  }
  return true;
}

export function dispatchSpaceUnits(input: GameState, originId: string, unitIds: string[], destinationId: string): GameResult {
  const state = clone(input); const origin = getPlanet(state, originId); const destination = getPlanet(state, destinationId);
  const ships = origin?.orbitUnits.filter(u => unitIds.includes(u.id) && u.faction === 'player') ?? [];
  if (!origin || !destination || !ships.length || ships.length !== unitIds.length || origin.id === destination.id) return fail(input, 'Selected ships must share one gravity well.');
  if (ships.some(ship => ship.phaseArrival)) return fail(input, 'Ships cannot jump again until their phase arrival is complete.');
  const path = findPlanetPath(state.planets, originId, destinationId);
  if (!path || path.length < 2) return fail(input, 'No phase-lane route reaches that gravity well.');
  dispatchFactionUnits(state, origin, ships, destination, 'player');
  addMessage(state, `${ships.length} ship${ships.length === 1 ? '' : 's'} routed across ${path.length - 1} phase lane${path.length === 2 ? '' : 's'} to ${destination.name}.`);
  return pass(state);
}

export const dispatchSpaceUnit = (input: GameState, originId: string, unitId: string, destinationId: string) => dispatchSpaceUnits(input, originId, [unitId], destinationId);

export const dispatchTransport = dispatchSpaceUnit;

function groundDefenseUnit(state: GameState, building: Building, faction: Exclude<Faction, null>): Unit {
  const power = faction === 'enemy' ? enemyDifficultyMultiplier(state.config.difficulty) : 1;
  const turret = unit(`ground-defense-${building.id}`, 'defenseTurret', faction);
  turret.maxHp = Math.round(turret.maxHp * power);
  turret.hp = turret.maxHp;
  turret.maxShields = Math.round(turret.maxShields * power);
  turret.shields = turret.maxShields;
  turret.sourceBuildingId = building.id;
  return turret;
}

function ensureGroundDefenseBattleUnits(state: GameState, battle: GroundBattle) {
  if (battle.groundDefenseBuildingIds !== undefined) return;
  const p = getPlanet(state, battle.planetId);
  if (!p || !p.owner) { battle.groundDefenseBuildingIds = []; return; }
  const defenses = p.buildings.filter(building => building.kind === 'groundDefense');
  battle.groundDefenseBuildingIds = defenses.map(building => building.id);
  const existingSources = new Set(battle.defenders.map(defender => defender.sourceBuildingId));
  battle.defenders.push(...defenses.filter(building => !existingSources.has(building.id)).map(building => groundDefenseUnit(state, building, p.owner!)));
}

function unloadTransport(state: GameState, p: Planet, transport: Unit) {
  const cargo = transport.cargo ?? [];
  if (transport.faction === 'neutral') return;
  const faction = transport.faction;
  if (!UNITS[transport.kind].capacity || !cargo.length) return;
  if (p.owner === null && p.groundUnits.length) {
    const battle: GroundBattle = { planetId: p.id, attackers: cargo, defenders: [...p.groundUnits], attackerFaction: faction, groundDefenseBuildingIds: [] };
    ensureBattlePositions(battle);
    state.battles.push(battle);
    p.groundUnits = [];
    addMessage(state, faction === 'player' ? `LANDING CONTESTED — neutral defenders are resisting on ${p.name}.` : `Enemy forces engaged the neutral garrison on ${p.name}.`);
  } else if (p.owner === null) {
    p.owner = faction; p.groundUnits.push(...recoverGroundUnits(cargo));
    addMessage(state, faction === 'player' ? `${p.name} colonized by ${cargo.length} automatically deployed squad${cargo.length === 1 ? '' : 's'}.` : `Enemy forces established a new base on ${p.name}.`);
  } else if (p.owner !== faction) {
    const defenses = p.buildings.filter(building => building.kind === 'groundDefense');
    const fortifications = defenses.map(building => groundDefenseUnit(state, building, p.owner!));
    if (p.groundUnits.length || fortifications.length) {
      const battle: GroundBattle = { planetId: p.id, attackers: cargo, defenders: [...p.groundUnits, ...fortifications], attackerFaction: faction, groundDefenseBuildingIds: defenses.map(building => building.id) };
      ensureBattlePositions(battle);
      state.battles.push(battle);
      p.groundUnits = [];
      const defenseReport = defenses.length ? ` ${defenses.length} defense turret${defenses.length === 1 ? '' : 's'} online.` : '';
      addMessage(state, faction === 'player' ? `Automatic landing initiated a ground battle on ${p.name}.${defenseReport}` : `HOSTILE LANDING — enemy troops are attacking ${p.name}.${defenseReport}`);
    } else {
      p.owner = faction; p.groundUnits.push(...recoverGroundUnits(cargo));
      addMessage(state, faction === 'player' ? `${p.name} occupied without ground resistance.` : `${p.name} lost to an unopposed enemy landing.`);
    }
  } else {
    p.groundUnits.push(...recoverGroundUnits(cargo));
    if (faction === 'player') addMessage(state, `${cargo.length} squad${cargo.length === 1 ? '' : 's'} automatically deployed to ${p.name}.`);
  }
  transport.cargo = [];
  transport.loadedUnitIds = [];
}

export function setBattleFocus(input: GameState, planetId: string, targetId?: string): GameState {
  const state = clone(input); const battle = state.battles.find(b => b.planetId === planetId);
  if (battle) battle.focusTargetId = targetId;
  return state;
}

export function setOrbitFocusTarget(input: GameState, planetId: string, targetId?: string): GameState {
  const state = clone(input); const p = getPlanet(state, planetId);
  const target = p?.buildings.find(building => building.id === targetId && building.kind === 'spaceDefense');
  const hasAttackers = p?.orbitUnits.some(unit => unit.faction === 'player');
  if (p && target && p.owner === 'enemy' && hasAttackers) {
    p.orbitFocusTargetId = p.orbitFocusTargetId === targetId ? undefined : targetId;
    addMessage(state, `${p.orbitFocusTargetId ? 'Priority target locked' : 'Priority target released'}: orbital defense at ${p.name}.`);
  }
  return state;
}

export function recoverGroundUnits(units: Unit[]): Unit[] {
  return units.map(unit => {
    const restored = { ...unit, hp: unit.maxHp, shields: unit.maxShields };
    delete restored.battleX; delete restored.battleY;
    return restored;
  });
}

export function recoverSpaceUnit(u: Unit, friendlyOrbit: boolean, seconds: number): Unit {
  return { ...u, shields: Math.min(u.maxShields, u.shields + seconds * 5), hp: friendlyOrbit ? Math.min(u.maxHp, u.hp + seconds * 2) : u.hp };
}

function damageUnit(target: Unit, damage: number): Unit {
  const shieldDamage = Math.min(target.shields, damage);
  return { ...target, shields: target.shields - shieldDamage, hp: target.hp - (damage - shieldDamage) };
}

function damageBuilding(target: Building, damage: number): Building {
  ensureOrbitalDefenseHealth(target);
  const shieldDamage = Math.min(target.shields!, damage);
  return { ...target, shields: target.shields! - shieldDamage, hp: target.hp! - (damage - shieldDamage) };
}

function ensureBattlePositions(battle: GroundBattle) {
  const deploy = (units: Unit[], x: number) => units.forEach((unit, index) => {
    unit.battleX ??= x;
    unit.battleY ??= 24 + (index + 1) * 52 / (units.length + 1);
  });
  deploy(battle.attackers, 12);
  deploy(battle.defenders, 88);
}

const battleDistance = (a: Unit, b: Unit) => Math.hypot((b.battleX ?? 0) - (a.battleX ?? 0), (b.battleY ?? 0) - (a.battleY ?? 0));

function nearestBattleTarget(unit: Unit, enemies: Unit[], preferredId?: string) {
  const preferred = preferredId && enemies.find(enemy => enemy.id === preferredId);
  return preferred ?? enemies.reduce<Unit | undefined>((nearest, enemy) => !nearest || battleDistance(unit, enemy) < battleDistance(unit, nearest) ? enemy : nearest, undefined);
}

function advanceOrFire(unit: Unit, enemies: Unit[], seconds: number, damage: Map<string, number>, preferredId?: string, power = 1) {
  const target = nearestBattleTarget(unit, enemies, preferredId);
  if (!target) return;
  const distance = battleDistance(unit, target), definition = UNITS[unit.kind];
  if (distance <= definition.range) {
    damage.set(target.id, (damage.get(target.id) ?? 0) + definition.damage * seconds * .24 * power);
    return;
  }
  const travel = Math.min(definition.moveSpeed * seconds, Math.max(0, distance - definition.range * .92));
  if (!travel || !distance) return;
  unit.battleX = (unit.battleX ?? 0) + ((target.battleX ?? 0) - (unit.battleX ?? 0)) / distance * travel;
  unit.battleY = (unit.battleY ?? 0) + ((target.battleY ?? 0) - (unit.battleY ?? 0)) / distance * travel;
}

function resolveGroundDefenseBuildings(p: Planet, battle: GroundBattle, survivingDefenders: Unit[]) {
  const deployedIds = new Set(battle.groundDefenseBuildingIds ?? []);
  if (!deployedIds.size) return;
  const survivingIds = new Set(survivingDefenders.map(unit => unit.sourceBuildingId).filter((id): id is string => !!id));
  p.buildings = p.buildings.filter(building => !deployedIds.has(building.id) || survivingIds.has(building.id));
}

const fieldArmy = (units: Unit[]) => recoverGroundUnits(units.filter(unit => !unit.sourceBuildingId));

function tickBattle(state: GameState, battle: GroundBattle, seconds: number) {
  if (!battle.attackers.length || !battle.defenders.length) return;
  ensureBattlePositions(battle);
  const damage = new Map<string, number>();
  battle.attackers.forEach(unit => advanceOrFire(unit, battle.defenders, seconds, damage, unit.faction === 'player' ? battle.focusTargetId : undefined, unit.faction === 'enemy' ? enemyDifficultyMultiplier(state.config.difficulty) : 1));
  battle.defenders.forEach(unit => advanceOrFire(unit, battle.attackers, seconds, damage, unit.faction === 'player' ? battle.focusTargetId : undefined, unit.faction === 'enemy' ? enemyDifficultyMultiplier(state.config.difficulty) : 1));
  battle.attackers = battle.attackers.map(unit => damage.has(unit.id) ? damageUnit(unit, damage.get(unit.id)!) : unit).filter(unit => unit.hp > 0);
  battle.defenders = battle.defenders.map(unit => damage.has(unit.id) ? damageUnit(unit, damage.get(unit.id)!) : unit).filter(unit => unit.hp > 0);
  const p = getPlanet(state, battle.planetId)!;
  if (!battle.defenders.length && battle.attackers.length) {
    const attackingUnitFaction = battle.attackers[0].faction;
    const winner = battle.attackerFaction ?? (attackingUnitFaction === 'enemy' ? 'enemy' : 'player');
    resolveGroundDefenseBuildings(p, battle, []);
    p.owner = winner; p.groundUnits = fieldArmy(battle.attackers);
    state.battles = state.battles.filter(b => b.planetId !== battle.planetId);
    addMessage(state, winner === 'player' ? `${p.name} secured. Ground forces fully restored.` : `${p.name} has fallen to enemy ground forces.`);
  } else if (!battle.attackers.length) {
    const winner = battle.defenders[0]?.faction ?? (battle.attackerFaction === 'enemy' ? 'player' : 'enemy');
    resolveGroundDefenseBuildings(p, battle, battle.defenders);
    p.owner = winner === 'neutral' ? null : winner;
    p.groundUnits = fieldArmy(battle.defenders);
    state.battles = state.battles.filter(b => b.planetId !== battle.planetId);
    addMessage(state, winner === 'player' ? `Enemy invasion of ${p.name} repelled.` : winner === 'neutral' ? `Landing on ${p.name} repelled by neutral defenders.` : `Invasion of ${p.name} repelled.`);
  }
}

function tickOrbitCombat(state: GameState, p: Planet, seconds: number) {
  const players = p.orbitUnits.filter(u => u.faction === 'player');
  const enemies = p.orbitUnits.filter(u => u.faction === 'enemy');
  const playerTarget = players.find(unit => unit.pendingLanding) ?? players[0];
  const enemyTarget = enemies.find(unit => unit.pendingLanding) ?? enemies[0];
  const landingShipsBeforeCombat = new Map(p.orbitUnits.filter(unit => unit.pendingLanding).map(unit => [unit.id, unit]));
  const defenses = p.buildings.filter(b => b.kind === 'spaceDefense');
  defenses.forEach(ensureOrbitalDefenseHealth);
  const playerDefenses = p.owner === 'player' ? defenses : [];
  const enemyDefenses = p.owner === 'enemy' ? defenses : [];
  const batteryCount = p.buildings.filter(b => b.kind === 'antiSpaceDefense').length;
  const scale = seconds * 0.18 * SPACE_COMBAT_DAMAGE_MULTIPLIER;
  const enemyPower = enemyDifficultyMultiplier(state.config.difficulty);
  const playerShipDamage = players.reduce((sum, u) => sum + UNITS[u.kind].damage, 0) * scale;
  const enemyShipDamage = enemies.reduce((sum, u) => sum + UNITS[u.kind].damage, 0) * scale * enemyPower;
  const playerInstallationDamage = (playerDefenses.length * ORBITAL_DEFENSE_STATS.damage + (p.owner === 'player' ? batteryCount * 12 : 0)) * scale;
  const enemyInstallationDamage = (enemyDefenses.length * ORBITAL_DEFENSE_STATS.damage + (p.owner === 'enemy' ? batteryCount * 12 : 0)) * scale * enemyPower;

  if (players.length && (enemyDefenses.length || enemies.length)) {
    const preferred = enemyDefenses.find(defense => defense.id === p.orbitFocusTargetId);
    const defenseTarget = preferred ?? enemyDefenses[0];
    if (defenseTarget) p.buildings = p.buildings.map(building => building.id === defenseTarget.id ? damageBuilding(building, playerShipDamage) : building);
    else if (enemyTarget) p.orbitUnits = p.orbitUnits.map(unit => unit.id === enemyTarget.id ? damageUnit(unit, playerShipDamage) : unit);
  }
  if (enemies.length && (playerDefenses.length || players.length)) {
    const defenseTarget = playerDefenses[0];
    if (defenseTarget) p.buildings = p.buildings.map(building => building.id === defenseTarget.id ? damageBuilding(building, enemyShipDamage) : building);
    else if (playerTarget) p.orbitUnits = p.orbitUnits.map(unit => unit.id === playerTarget.id ? damageUnit(unit, enemyShipDamage) : unit);
  }
  if (enemyTarget && playerInstallationDamage) p.orbitUnits = p.orbitUnits.map(unit => unit.id === enemyTarget.id ? damageUnit(unit, playerInstallationDamage) : unit);
  if (playerTarget && enemyInstallationDamage) p.orbitUnits = p.orbitUnits.map(unit => unit.id === playerTarget.id ? damageUnit(unit, enemyInstallationDamage) : unit);

  const destroyedDefenses = p.buildings.filter(building => building.kind === 'spaceDefense' && building.hp! <= 0);
  if (destroyedDefenses.length) {
    const destroyedIds = new Set(destroyedDefenses.map(building => building.id));
    p.buildings = p.buildings.filter(building => !destroyedIds.has(building.id));
    if (p.orbitFocusTargetId && destroyedIds.has(p.orbitFocusTargetId)) delete p.orbitFocusTargetId;
    addMessage(state, `${destroyedDefenses.length} orbital defense platform${destroyedDefenses.length === 1 ? '' : 's'} destroyed at ${p.name}.`);
  }
  p.orbitUnits = p.orbitUnits.filter(unit => unit.hp > 0);
  for (const [id, ship] of landingShipsBeforeCombat) {
    if (!p.orbitUnits.some(unit => unit.id === id)) addMessage(state, `${ship.faction === 'enemy' ? 'HOSTILE' : 'Friendly'} ${UNITS[ship.kind].label} destroyed during landing approach at ${p.name}; all embarked forces lost.`);
  }
}

function tickOrbitUnitMovement(ship: Unit, seconds: number) {
  if (typeof ship.orbitTargetX !== 'number' || typeof ship.orbitTargetY !== 'number') return;
  const currentX = ship.orbitX ?? 0, currentY = ship.orbitY ?? 0;
  const dx = ship.orbitTargetX - currentX, dy = ship.orbitTargetY - currentY;
  const distance = Math.hypot(dx, dy), step = (ship.pendingLanding ? LANDING_APPROACH_SPEED : ORBIT_MANEUVER_SPEED) * seconds;
  if (distance <= step || distance === 0) {
    ship.orbitX = ship.orbitTargetX; ship.orbitY = ship.orbitTargetY;
    delete ship.orbitTargetX; delete ship.orbitTargetY;
    if (!ship.pendingLanding) delete ship.phaseArrival;
  } else {
    ship.orbitX = currentX + dx / distance * step;
    ship.orbitY = currentY + dy / distance * step;
  }
}

function tickOrbitMovement(p: Planet, seconds: number) {
  for (const ship of p.orbitUnits) tickOrbitUnitMovement(ship, seconds);
}

function resolveLandingApproaches(state: GameState, p: Planet) {
  for (const ship of p.orbitUnits.filter(unit => unit.pendingLanding && typeof unit.orbitTargetX !== 'number' && typeof unit.orbitTargetY !== 'number')) {
    delete ship.pendingLanding;
    delete ship.phaseArrival;
    unloadTransport(state, p, ship);
    ship.orbitX = 0;
    ship.orbitY = 0;
    ship.docked = true;
    addMessage(state, `${UNITS[ship.kind].label} docked after completing its landing approach at ${p.name}.`);
  }
}

function tickQueue(state: GameState, p: Planet, queue: QueueItem[], seconds: number, productionMultiplier: number, faction: 'player' | 'enemy', source?: string) {
  if (!queue.length) return;
  queue[0].remaining -= seconds * productionMultiplier;
  if (queue[0].remaining <= 0) {
    const done = queue.shift()!; const created = unit(`u${state.nextId++}`, done.kind, faction);
    if (faction === 'enemy') {
      const power = enemyDifficultyMultiplier(state.config.difficulty);
      created.maxHp = Math.round(created.maxHp * power); created.hp = created.maxHp;
      created.maxShields = Math.round(created.maxShields * power); created.shields = created.maxShields;
    }
    if (UNITS[done.kind].factory === 'space') placeInOpenOrbit(p, created);
    (UNITS[done.kind].factory === 'ground' ? p.groundUnits : p.orbitUnits).push(created);
    if (faction === 'player') addMessage(state, `${UNITS[done.kind].label} completed${source ? ` at ${source}` : ''} on ${p.name}.`);
  }
}

const enemyHasResearch = (state: GameState, id?: ResearchId) => !id || state.enemyCompletedResearch.includes(id);

function enemyBuild(state: GameState, p: Planet, kind: BuildingKind, targetCount = p.buildingLimits[kind]) {
  const def = BUILDINGS[kind];
  if (p.buildings.filter(building => building.kind === kind).length >= Math.min(targetCount, p.buildingLimits[kind])
    || !enemyHasResearch(state, def.requires) || !canAfford(state.enemyResources, def.cost)) return false;
  spend(state.enemyResources, def.cost);
  const building: Building = { id: `eb${state.nextId++}`, kind };
  if (isSpaceYard(building)) building.spaceQueue = [];
  ensureOrbitalDefenseHealth(building);
  p.buildings.push(building);
  return true;
}

function enemyQueueUnit(state: GameState, p: Planet, kind: UnitKind, yard?: Building) {
  const def = UNITS[kind];
  if (!enemyHasResearch(state, def.requires) || !canAfford(state.enemyResources, def.cost)) return false;
  if (def.factory === 'ground') {
    if (!p.buildings.some(building => building.kind === 'groundFactory' || building.kind === 'advancedGroundFactory')) return false;
    if (def.advancedFactory && !p.buildings.some(building => building.kind === 'advancedGroundFactory')) return false;
    spend(state.enemyResources, def.cost);
    p.groundQueue.push({ id: `eq${state.nextId++}`, kind, remaining: def.time!, total: def.time! });
    return true;
  }
  if (!yard || !isSpaceYard(yard) || (def.advancedFactory && yard.kind !== 'advancedSpaceFactory')) return false;
  spend(state.enemyResources, def.cost);
  yard.spaceQueue ??= [];
  yard.spaceQueue.push({ id: `eq${state.nextId++}`, kind, remaining: def.time!, total: def.time! });
  return true;
}

function advanceEnemyResearch(state: GameState) {
  if (!state.planets.some(p => p.owner === 'enemy' && p.buildings.some(building => building.kind === 'researchLab'))) return;
  const milestones: Array<[number, ResearchId]> = [
    [80, 'advancedIndustry'], [130, 'groundWarfare'], [145, 'fleetLogistics'], [160, 'orbitalEngineering'],
    [180, 'quantumExtraction'], [220, 'heavyArmor'], [245, 'carrierOperations'], [270, 'capitalShips'], [360, 'titanEngineering'],
  ];
  const next = milestones.find(([time, id]) => state.elapsed >= time && !state.enemyCompletedResearch.includes(id));
  if (!next) return;
  const [, id] = next; const def = RESEARCH[id];
  if (!enemyHasResearch(state, def.requires) || !canAfford(state.enemyResources, def.cost)) return;
  spend(state.enemyResources, def.cost);
  state.enemyCompletedResearch.push(id);
}

function runEnemyStrategicAction(state: GameState) {
  advanceEnemyResearch(state);
  const colonies = state.planets.filter(p => p.owner === 'enemy' && !state.battles.some(battle => battle.planetId === p.id));
  const forceTarget = state.config.difficulty === 'cadet' ? 4 : state.config.difficulty === 'admiral' ? 8 : 6;
  for (const p of colonies) {
    const priorities: Array<[BuildingKind, number]> = [
      ['metalMine', 2], ['crystalMine', 2], ['goldMine', 2], ['groundFactory', 2], ['spaceFactory', 2],
      ['groundDefense', 1], ['spaceDefense', 1], ['antiSpaceDefense', 1], ['researchLab', 1],
      ['advancedGroundFactory', 1], ['advancedSpaceFactory', 1],
      ['metalMine', p.buildingLimits.metalMine], ['crystalMine', p.buildingLimits.crystalMine], ['goldMine', p.buildingLimits.goldMine],
    ];
    priorities.some(([kind, target]) => enemyBuild(state, p, kind, target));

    if (p.groundUnits.length + p.groundQueue.length < forceTarget && p.groundQueue.length < 2) {
      const advancedKind: GroundUnitKind = state.enemyCompletedResearch.includes('heavyArmor')
        ? (state.nextId % 3 === 0 ? 'railgunTank' : state.nextId % 2 ? 'plasmaTank' : 'siegeWalker')
        : 'shockTrooper';
      const basicKind: GroundUnitKind = state.nextId % 3 === 0 ? 'artillery' : state.nextId % 2 ? 'lightTank' : 'infantry';
      if (!enemyQueueUnit(state, p, advancedKind)) enemyQueueUnit(state, p, basicKind);
    }

    const factionShips = [...p.orbitUnits, ...state.fleets.filter(fleet => fleet.faction === 'enemy').map(fleet => fleet.unit)];
    for (const yard of spaceYards(p)) {
      if (yard.spaceQueue?.length) continue;
      const queuedKinds = spaceYards(p).flatMap(other => other.spaceQueue ?? []).map(item => item.kind);
      const hasCarrier = [...factionShips.map(ship => ship.kind), ...queuedKinds].some(kind => (UNITS[kind].capacity ?? 0) > 0);
      let desired: SpaceUnitKind = !hasCarrier ? 'transport' : state.nextId % 2 ? 'missileFrigate' : 'escortFrigate';
      if (yard.kind === 'advancedSpaceFactory' && state.enemyCompletedResearch.includes('carrierOperations') && !hasCarrier) desired = 'assaultCarrier';
      else if (yard.kind === 'advancedSpaceFactory' && state.enemyCompletedResearch.includes('titanEngineering') && hasCarrier) desired = 'dreadnought';
      else if (yard.kind === 'advancedSpaceFactory' && state.enemyCompletedResearch.includes('capitalShips') && hasCarrier) desired = 'battlecruiser';
      else if (yard.kind === 'advancedSpaceFactory' && state.enemyCompletedResearch.includes('orbitalEngineering')) desired = 'destroyer';
      enemyQueueUnit(state, p, desired, yard);
    }
  }
}

function launchEnemyMission(state: GameState) {
  const playerPlanets = state.planets.filter(p => p.owner === 'player');
  const reservedTargets = new Set(state.fleets.filter(fleet => fleet.faction === 'enemy').map(fleet => fleet.finalDestinationId ?? fleet.destinationId));
  const neutralPlanets = state.planets.filter(p => p.owner === null && !reservedTargets.has(p.id) && !state.battles.some(battle => battle.planetId === p.id));
  if (!playerPlanets.length && !neutralPlanets.length) return;
  const preferExpansion = neutralPlanets.length > 0 && (state.enemyMissionCount % 3 !== 2 || !playerPlanets.length);
  const preferredTargets = preferExpansion ? neutralPlanets : playerPlanets;
  const fallbackTargets = preferExpansion ? playerPlanets : neutralPlanets;
  const candidatesFor = (targets: Planet[]) => state.planets.flatMap(origin => {
    if (origin.owner !== 'enemy' || origin.groundUnits.length < 2 || state.battles.some(battle => battle.planetId === origin.id)) return [];
    const carrier = origin.orbitUnits.find(ship => ship.faction === 'enemy' && (UNITS[ship.kind].capacity ?? 0) > 0);
    if (!carrier) return [];
    return targets.flatMap(target => {
      const path = findPlanetPath(state.planets, origin.id, target.id);
      return path ? [{ origin, target, carrier, distance: path.slice(1).reduce((sum, id, index) => {
        const from = getPlanet(state, path[index])!, to = getPlanet(state, id)!;
        return sum + Math.hypot(to.x - from.x, to.y - from.y);
      }, 0) }] : [];
    });
  }).sort((a, b) => a.distance - b.distance);
  const mission = candidatesFor(preferredTargets)[0] ?? candidatesFor(fallbackTargets)[0];
  if (!mission) return;
  const escortLimit = state.config.difficulty === 'cadet' ? 1 : state.config.difficulty === 'admiral' ? 4 : 3;
  const escorts = mission.origin.orbitUnits.filter(ship => ship.faction === 'enemy' && ship.id !== mission.carrier.id && !UNITS[ship.kind].capacity).slice(0, escortLimit);
  if (dispatchFactionUnits(state, mission.origin, [mission.carrier, ...escorts], mission.target, 'enemy')) {
    state.enemyMissionCount += 1;
    addMessage(state, mission.target.owner === null
      ? `HOSTILE EXPANSION FLEET — ${mission.target.name} targeted for colonization.`
      : `HOSTILE FLEET LAUNCHED — ${mission.target.name} is under attack.`);
  }
}

export function tick(input: GameState, seconds: number): GameState {
  const state = migrateGameState(input); state.elapsed += seconds;
  for (const p of state.planets) {
    ensureOrbitPositions(p);
    if (p.owner === 'player') {
      const incomeScale = researchIncomeMultiplier(state.completedResearch);
      for (const resource of ['metal', 'crystal', 'gold'] as Resource[]) {
        const kind = `${resource}Mine` as BuildingKind;
        const mineCount = p.buildings.filter(b => b.kind === kind).length;
        state.resources[resource] += seconds * mineCount * p.resourceYield[resource] * 0.7 * RESOURCE_COLLECTION_MULTIPLIER * incomeScale;
      }
      tickQueue(state, p, p.groundQueue, seconds, groundProductionMultiplier(p), 'player');
      spaceYards(p).forEach((yard, index) => tickQueue(state, p, yard.spaceQueue!, seconds, 1, 'player', `Space Yard ${index + 1}`));
    } else if (p.owner === 'enemy') {
      const incomeScale = enemyDifficultyMultiplier(state.config.difficulty) * .62 * researchIncomeMultiplier(state.enemyCompletedResearch);
      for (const resource of ['metal', 'crystal', 'gold'] as Resource[]) {
        const kind = `${resource}Mine` as BuildingKind;
        const mineCount = p.buildings.filter(b => b.kind === kind).length;
        state.enemyResources[resource] += seconds * mineCount * p.resourceYield[resource] * RESOURCE_COLLECTION_MULTIPLIER * incomeScale;
      }
      tickQueue(state, p, p.groundQueue, seconds, groundProductionMultiplier(p), 'enemy');
      spaceYards(p).forEach(yard => tickQueue(state, p, yard.spaceQueue!, seconds, 1, 'enemy'));
    }
    tickOrbitMovement(p, seconds);
    p.orbitUnits = p.orbitUnits.map(u => recoverSpaceUnit(u, p.owner === u.faction, seconds));
    tickOrbitCombat(state, p, seconds);
  }

  if (state.researchQueue.length) {
    state.researchQueue[0].remaining -= seconds;
    if (state.researchQueue[0].remaining <= 0) {
      const done = state.researchQueue.shift()!; state.completedResearch.push(done.id);
      addMessage(state, `${RESEARCH[done.id].label} research complete.`);
    }
  }

  const actionInterval = state.config.difficulty === 'cadet' ? 12 : state.config.difficulty === 'admiral' ? 6 : 8;
  const attackInterval = state.config.difficulty === 'cadet' ? 170 : state.config.difficulty === 'admiral' ? 85 : 120;
  state.enemyActionClock -= seconds;
  for (let actions = 0; state.enemyActionClock <= 0 && actions < 32; actions += 1) {
    runEnemyStrategicAction(state);
    state.enemyActionClock += actionInterval;
  }
  state.enemyAttackClock -= seconds;
  if (state.enemyAttackClock <= 0) {
    launchEnemyMission(state);
    state.enemyAttackClock += attackInterval;
  }

  for (const battle of [...state.battles]) tickBattle(state, battle, seconds);
  for (const p of state.planets) resolveLandingApproaches(state, p);
  const traveling: Fleet[] = [];
  const arrivals = new Map<string, Array<{ unit: Unit; seconds: number }>>();
  for (const fleet of state.fleets) {
    let timeLeft = seconds, arrived = false;
    while (timeLeft > 0 && !arrived) {
      const remainingPhaseTime = Math.max(0, fleet.travelTime - fleet.progress);
      if (timeLeft < remainingPhaseTime) {
        fleet.progress += timeLeft;
        timeLeft = 0;
      } else {
        timeLeft -= remainingPhaseTime;
        const origin = getPlanet(state, fleet.originId)!;
        const waypoint = getPlanet(state, fleet.destinationId)!;
        if (fleet.phase === 'exiting') {
          fleet.phase = 'charging';
          fleet.progress = 0;
          fleet.travelTime = PHASE_GATE_CHARGE_SECONDS;
        } else if (fleet.phase === 'charging') {
          fleet.phase = 'tunnel';
          fleet.progress = 0;
          fleet.travelTime = phaseTravelTime(origin, waypoint);
        } else if (fleet.route?.length) {
          const nextId = fleet.route.shift()!;
          const next = getPlanet(state, nextId)!;
          const inboundBorder = systemBorderOffset(waypoint, origin);
          fleet.originId = waypoint.id;
          fleet.destinationId = next.id;
          beginSystemExit(fleet, waypoint, next, inboundBorder.x, inboundBorder.y);
        } else {
          placeAtSystemEdge(origin, waypoint, fleet.unit);
          waypoint.orbitUnits.push(fleet.unit);
          addMessage(state, `${UNITS[fleet.unit.kind].label} emerged at the outer edge of ${waypoint.name}.`);
          const group = arrivals.get(waypoint.id) ?? [];
          group.push({ unit: fleet.unit, seconds: timeLeft });
          arrivals.set(waypoint.id, group);
          arrived = true;
        }
      }
    }
    if (!arrived) traveling.push(fleet);
  }
  state.fleets = traveling;
  for (const [planetId, landedFleets] of arrivals) {
    const p = getPlanet(state, planetId)!;
    for (const arrival of landedFleets) tickOrbitUnitMovement(arrival.unit, arrival.seconds);
    const combatSeconds = Math.max(0, ...landedFleets.map(arrival => arrival.seconds));
    if (combatSeconds) tickOrbitCombat(state, p, combatSeconds);
    resolveLandingApproaches(state, p);
  }
  return state;
}
