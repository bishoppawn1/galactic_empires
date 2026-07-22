import {
  DEFAULT_GAME_CONFIG,
  type Building,
  type BuildingKind,
  type Definition,
  type EnemyDifficulty,
  type EmpireEconomy,
  type EmpireFaction,
  type Faction,
  type Fleet,
  type GameConfig,
  type GameState,
  type GroundBattle,
  type GroundUnitKind,
  type MapSize,
  type MatchEmpireSlot,
  type Planet,
  type PlanetConnection,
  type PlayableFaction,
  type QueueItem,
  type ResearchId,
  type Resource,
  type ResourcePool,
  type SpaceUnitKind,
  type TitanUpgradeId,
  type Unit,
  type UnitDefinition,
  type UnitFaction,
  type UnitKind,
  type WeaponEffect,
} from './types';
import { findPlanetPath, headingForVector } from './navigation';
import { viewStateForFaction } from './perspective';
import { planEnemyFleetOperations } from './ai/fleetOperations';
import {
  GROUND_FORMATION_X_SPACING, GROUND_FORMATION_Y_SPACING, clampGroundPosition,
  nearestOpenGroundPosition, separateGroundUnits,
} from './ground/collision';
import {
  BROOD_BIOMASS_PER_PLANET, PLAYABLE_FACTIONS, biomassCost, empireCivilization,
  COVENANT_SALVAGE_ARRAY_MULTIPLIER, recoverableBiomass, recoverableMetalScrap, startingResources, usesBiomass, usesSalvage,
} from './factions';
import {
  ANTI_SPACE_BATTERY_RANGE, BUILDINGS, BUILDING_KINDS, GRAVITY_WELL_RADIUS, GROUND_KINDS, LANDING_APPROACH_SPEED, MAX_SHIP_ORBIT_RADIUS, MIN_SHIP_ORBIT_SEPARATION,
  ORBITAL_BOMBARDMENT_DAMAGE_PER_SHIP, ORBITAL_DEFENSE_HULL_REGEN, ORBITAL_DEFENSE_RANGE, ORBITAL_DEFENSE_SHIELD_REGEN, ORBITAL_DEFENSE_STATS, ORBIT_MANEUVER_SPEED, PHASE_GATE_CHARGE_SECONDS, RESEARCH,
  RESEARCH_UNLOCKS, RESOURCE_COLLECTION_MULTIPLIER, RESOURCE_TRADE_RECEIVE, RESOURCE_TRADE_SPEND, SPACE_COMBAT_DAMAGE_MULTIPLIER, SPACE_KINDS, SYSTEM_EXIT_SPEED,
  TITAN_UPGRADES, UNITS, pool,
  civilizationUnitKind, groundDefenseKindForCivilization, hasUnlimitedBuildingCapacity, isTitanKind, orbitalDefenseOffset, unitAvailableToCivilization, unitRange, unitWeaponDamage,
} from './definitions';

export * from './types';
export * from './navigation';
export * from './definitions';
export * from './factions';
export * from './ground/collision';

export const carrierFighterCount = (ship: Unit) => {
  const wing = UNITS[ship.kind].fighterWing;
  return wing ? Math.max(0, Math.min(wing.capacity, Math.floor(ship.fighterCount ?? wing.capacity))) : 0;
};

const unit = (id: string, kind: UnitKind, faction: UnitFaction): Unit => ({
  id, kind, faction, hp: UNITS[kind].hp, maxHp: UNITS[kind].hp,
  shields: UNITS[kind].shields, maxShields: UNITS[kind].shields,
  ...(UNITS[kind].capacity || kind === 'transport' ? { loadedUnitIds: [] } : {}),
  ...(UNITS[kind].fighterWing ? { fighterCount: UNITS[kind].fighterWing.capacity, fighterBuildProgress: 0, fighterLossProgress: 0 } : {}),
  ...(isTitanKind(kind) ? { titanUpgrades: [] } : {}),
});

const orbitSlot = (index: number) => {
  const innerRadius = 190, ringSpacing = 84, slotSeparation = MIN_SHIP_ORBIT_SEPARATION + 2;
  const ringCount = Math.floor((MAX_SHIP_ORBIT_RADIUS - innerRadius) / ringSpacing) + 1;
  let remaining = Math.max(0, index);
  for (let ring = 0; ring < ringCount; ring += 1) {
    const radius = Math.min(MAX_SHIP_ORBIT_RADIUS, innerRadius + ring * ringSpacing);
    const slots = Math.max(8, Math.floor(Math.PI * 2 * radius / slotSeparation));
    if (remaining < slots || ring === ringCount - 1) {
      const slot = remaining % slots;
      const angle = -Math.PI / 2 + slot * Math.PI * 2 / slots + (ring % 2 ? Math.PI / slots : 0);
      return { orbitX: Math.cos(angle) * radius, orbitY: Math.sin(angle) * radius };
    }
    remaining -= slots;
  }
  return { orbitX: 0, orbitY: -MAX_SHIP_ORBIT_RADIUS };
};

function nextOpenOrbitPosition(ships: Array<Pick<Unit, 'orbitX' | 'orbitY' | 'orbitTargetX' | 'orbitTargetY'>>) {
  for (let slot = 0; slot < 512; slot += 1) {
    const candidate = orbitSlot(slot);
    if (ships.every(ship => {
      const x = ship.orbitTargetX ?? ship.orbitX, y = ship.orbitTargetY ?? ship.orbitY;
      return typeof x !== 'number' || typeof y !== 'number' || Math.hypot(x - candidate.orbitX, y - candidate.orbitY) >= MIN_SHIP_ORBIT_SEPARATION;
    })) return candidate;
  }
  return orbitSlot(ships.length);
}

function nearestOpenOrbitPosition(x: number, y: number, occupied: Array<{ orbitX: number; orbitY: number }>) {
  const preferred = clampOrbitPoint(x, y);
  const open = (candidate: { x: number; y: number }) => occupied.every(point => Math.hypot(point.orbitX - candidate.x, point.orbitY - candidate.y) >= MIN_SHIP_ORBIT_SEPARATION);
  if (open(preferred)) return preferred;
  for (let ring = 1; ring <= 12; ring += 1) {
    const slots = ring * 8;
    for (let slot = 0; slot < slots; slot += 1) {
      const angle = -Math.PI / 2 + slot * Math.PI * 2 / slots;
      const candidate = clampOrbitPoint(
        preferred.x + Math.cos(angle) * ring * MIN_SHIP_ORBIT_SEPARATION,
        preferred.y + Math.sin(angle) * ring * MIN_SHIP_ORBIT_SEPARATION,
      );
      if (open(candidate)) return candidate;
    }
  }
  const fallback = nextOpenOrbitPosition(occupied);
  return { x: fallback.orbitX, y: fallback.orbitY };
}

const clampOrbitPoint = (x: number, y: number) => {
  const radius = Math.hypot(x, y);
  if (radius <= MAX_SHIP_ORBIT_RADIUS || radius === 0) return { x, y };
  const scale = MAX_SHIP_ORBIT_RADIUS / radius;
  return { x: x * scale, y: y * scale };
};

function keepShipInsideGravityWell(ship: Unit) {
  if (Number.isFinite(ship.orbitX) && Number.isFinite(ship.orbitY)) {
    const position = clampOrbitPoint(ship.orbitX!, ship.orbitY!);
    ship.orbitX = position.x;
    ship.orbitY = position.y;
  }
  if (Number.isFinite(ship.orbitTargetX) && Number.isFinite(ship.orbitTargetY)) {
    const target = clampOrbitPoint(ship.orbitTargetX!, ship.orbitTargetY!);
    ship.orbitTargetX = target.x;
    ship.orbitTargetY = target.y;
  }
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
  ship.heading = headingForVector(position.orbitX - (ship.orbitX ?? 0), position.orbitY - (ship.orbitY ?? 0), ship.heading);
}

function placeAtSystemEdge(origin: Planet, destination: Planet, ship: Unit) {
  delete ship.docked;
  const baseAngle = Math.atan2(origin.y - destination.y, origin.x - destination.x);
  const formationIndex = destination.orbitUnits.filter(unit => Math.hypot(unit.orbitX ?? 0, unit.orbitY ?? 0) >= MAX_SHIP_ORBIT_RADIUS - 24).length;
  const formationStep = 2 * Math.asin(MIN_SHIP_ORBIT_SEPARATION / (2 * MAX_SHIP_ORBIT_RADIUS));
  const formationOffset = formationIndex === 0 ? 0 : Math.ceil(formationIndex / 2) * (formationIndex % 2 ? formationStep : -formationStep);
  const angle = baseAngle + formationOffset;
  const radius = MAX_SHIP_ORBIT_RADIUS;
  ship.orbitX = Math.cos(angle) * radius;
  ship.orbitY = Math.sin(angle) * radius;
  ship.heading = headingForVector(destination.x - origin.x, destination.y - origin.y, ship.heading);
  delete ship.phaseArrival;
  delete ship.orbitTargetX;
  delete ship.orbitTargetY;
  if ((UNITS[ship.kind].capacity ?? 0) > 0 && (ship.cargo?.length ?? 0) > 0) {
    ship.pendingLanding = true;
    ship.orbitTargetX = 0;
    ship.orbitTargetY = 0;
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
    keepShipInsideGravityWell(ship);
    const maneuvering = typeof ship.orbitTargetX === 'number' && typeof ship.orbitTargetY === 'number';
    const hasPosition = typeof ship.orbitX === 'number' && typeof ship.orbitY === 'number'
      && (maneuvering || ship.pendingLanding || ship.pendingEmbark || Math.hypot(ship.orbitX, ship.orbitY) >= 24);
    const overlapsIdleShip = hasPosition && !maneuvering && !ship.pendingLanding && !ship.pendingEmbark && placed.some(other => {
      const otherManeuvering = typeof other.orbitTargetX === 'number' && typeof other.orbitTargetY === 'number';
      return !other.docked && !otherManeuvering && !other.pendingLanding && !other.pendingEmbark
        && Math.hypot((other.orbitX ?? 0) - ship.orbitX!, (other.orbitY ?? 0) - ship.orbitY!) < MIN_SHIP_ORBIT_SEPARATION;
    });
    if (!hasPosition || overlapsIdleShip) placeInOpenOrbit(planet, ship, placed);
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

const MAP_PLANETS: Record<MapSize, number> = { small: 7, medium: 11, large: 15, huge: 21 };

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

const starterBuildings = (prefix: string, faction: PlayableFaction): Building[] => {
  const kinds: BuildingKind[] = faction === 'brood'
    ? ['groundFactory', 'spaceFactory']
    : ['metalMine', 'crystalMine', 'goldMine', 'groundFactory', 'spaceFactory'];
  return kinds.map((kind, index) => ({ id: `${prefix}${index + 1}`, kind, ...(kind === 'spaceFactory' ? { spaceQueue: [] } : {}) }));
};

export function createInitialState(requestedConfig: GameConfig = DEFAULT_GAME_CONFIG, mode: GameState['mode'] = 'solo'): GameState {
  const playerFaction = requestedConfig.playerFaction ?? 'human';
  const config = { ...requestedConfig, playerFaction };
  const terra = planet('terra', 'Terra Nova', 22, 56, '#55d6be', 'player', pool(1, .9, .65), pool(5, 4, 3), 4);
  terra.buildings = starterBuildings('b', playerFaction);

  const cygnus = planet('cygnus', 'Cygnus Reach', 76, 30, '#e86a92', 'enemy', pool(.7, 1.2, .9), pool(3, 5, 4));
  cygnus.buildings = starterBuildings('eb', 'human');

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
  const hugePlanets = [
    planet('bastion', 'Bastion', 5, 52, '#73e0c1', null, pool(1.15, .8, .7), pool(5, 4, 3)),
    planet('eclipse', 'Eclipse', 25, 35, '#d196ff', null, pool(.7, 1.2, .8), pool(3, 6, 4)),
    planet('nexus', 'Nexus', 50, 50, '#9de0ff', null, pool(1, 1, 1), pool(5, 5, 5)),
    planet('rhea', 'Rhea', 82, 47, '#ff9d76', null, pool(1.25, .65, .75), pool(6, 3, 4)),
    planet('umbra', 'Umbra', 53, 96, '#8c92ff', null, pool(.75, 1.25, .7), pool(3, 6, 4)),
    planet('crown', 'Crown Reach', 98, 55, '#ffd36e', null, pool(.8, .75, 1.3), pool(4, 3, 6)),
  ];
  const planets = [...corePlanets, ...(config.mapSize === 'small' ? [] : mediumPlanets), ...(['large', 'huge'].includes(config.mapSize) ? largePlanets : []), ...(config.mapSize === 'huge' ? hugePlanets : [])];
  seedNeutralGarrisons(planets);
  return {
    mode,
    config,
    resources: startingResources(playerFaction),
    enemyResources: pool(520, 420, 280),
    planets,
    fleets: [], battles: [], completedResearch: [], enemyCompletedResearch: [], researchQueue: [], enemyResearchQueue: [],
    enemyActionClock: 8, enemyAttackClock: config.difficulty === 'cadet' ? 180 : config.difficulty === 'admiral' ? 100 : 130, enemyMissionCount: 0,
    empireCivilizations: { player: playerFaction, enemy: 'human', rival2: 'human', rival3: 'human' },
    additionalEmpires: {}, aiFactions: mode === 'solo' ? ['enemy'] : [],
    elapsed: 0, nextId: 100, neutralGarrisonsInitialized: true,
    messages: [playerFaction === 'brood' ? 'THE BROOD AWAKENS — Terra Nova begins generating biomass.' : playerFaction === 'aegis' ? 'AEGIS COMMAND ONLINE — the Directorate shield wall is ready.' : playerFaction === 'covenant' ? 'IRON PROTOCOL ONLINE — the Covenant foundries await material.' : 'COMMAND ONLINE — Terra Nova awaits your orders.'],
  };
}

const clone = (state: GameState): GameState => structuredClone(state);

export function migrateGameState(input: GameState): GameState {
  const state = clone(input);
  if (!state || typeof state !== 'object' || !Array.isArray(state.planets) || !state.planets.length) throw new Error('Invalid saved campaign.');
  state.fleets = Array.isArray(state.fleets) ? state.fleets : [];
  state.battles = Array.isArray(state.battles) ? state.battles : [];
  state.completedResearch = (Array.isArray(state.completedResearch) ? state.completedResearch : []).filter(id => id in RESEARCH);
  state.enemyCompletedResearch = (Array.isArray(state.enemyCompletedResearch) ? state.enemyCompletedResearch : []).filter(id => id in RESEARCH);
  state.researchQueue = (Array.isArray(state.researchQueue) ? state.researchQueue : []).filter(project => project && project.id in RESEARCH);
  state.enemyResearchQueue = (Array.isArray(state.enemyResearchQueue) ? state.enemyResearchQueue : []).filter(project => project && project.id in RESEARCH);
  state.messages = Array.isArray(state.messages) && state.messages.length ? state.messages : ['SAVED CAMPAIGN RECOVERED — systems online.'];
  state.resources ??= pool(520, 420, 280);
  state.mode ??= 'solo';
  state.config ??= { mapSize: state.planets.length <= 7 ? 'small' : state.planets.length <= 11 ? 'medium' : state.planets.length <= 15 ? 'large' : 'huge', difficulty: 'commander', playerFaction: 'human' };
  state.config.playerFaction = PLAYABLE_FACTIONS.includes(state.config.playerFaction ?? 'human') ? state.config.playerFaction ?? 'human' : 'human';
  const savedCivilizations = state.empireCivilizations as Partial<Record<EmpireFaction, PlayableFaction>> | undefined;
  state.empireCivilizations = {
    player: state.config.playerFaction,
    enemy: 'human', rival2: 'human', rival3: 'human',
    ...savedCivilizations,
  };
  if (usesBiomass(state) && typeof state.resources.biomass !== 'number') state.resources = startingResources('brood');
  state.enemyResources ??= pool(520, 420, 280);
  state.enemyActionClock ??= 8;
  state.enemyAttackClock ??= state.config.difficulty === 'cadet' ? 180 : state.config.difficulty === 'admiral' ? 100 : 130;
  state.enemyMissionCount ??= 0;
  state.additionalEmpires ??= {};
  state.aiFactions ??= state.mode === 'solo' ? ['enemy'] : [];
  state.elapsed ??= 0;
  state.nextId ??= 100;
  const migrateUnitRoster = (savedUnit: Unit) => {
    if (savedUnit.faction !== 'neutral') {
      const migratedKind = civilizationUnitKind(empireCivilization(state, savedUnit.faction), savedUnit.kind);
      if (migratedKind !== savedUnit.kind) {
        const definition = UNITS[migratedKind];
        const hullRatio = savedUnit.maxHp > 0 ? savedUnit.hp / savedUnit.maxHp : 1;
        const shieldRatio = savedUnit.maxShields > 0 ? savedUnit.shields / savedUnit.maxShields : 1;
        savedUnit.kind = migratedKind;
        savedUnit.maxHp = definition.hp;
        savedUnit.hp = Math.max(0, Math.min(definition.hp, definition.hp * hullRatio));
        savedUnit.maxShields = definition.shields;
        savedUnit.shields = Math.max(0, Math.min(definition.shields, definition.shields * shieldRatio));
      }
    }
    const fighterWing = UNITS[savedUnit.kind].fighterWing;
    if (fighterWing) {
      savedUnit.fighterCount = carrierFighterCount(savedUnit);
      savedUnit.fighterBuildProgress = Math.max(0, Math.min(fighterWing.rebuildTime, savedUnit.fighterBuildProgress ?? 0));
      savedUnit.fighterLossProgress = Math.max(0, Math.min(fighterWing.attritionTime, savedUnit.fighterLossProgress ?? 0));
    }
    if (isTitanKind(savedUnit.kind)) {
      const savedTitanUpgrades = Array.isArray(savedUnit.titanUpgrades) ? savedUnit.titanUpgrades : [];
      savedUnit.titanUpgrades = [...new Set(savedTitanUpgrades.filter(id => id in TITAN_UPGRADES))];
      const legacyTitan = savedUnit as Unit & { titanTravel?: number; titanUpgradePoints?: number };
      delete legacyTitan.titanTravel;
      delete legacyTitan.titanUpgradePoints;
    }
    savedUnit.cargo?.forEach(migrateUnitRoster);
  };
  for (const p of state.planets) {
    p.buildings = Array.isArray(p.buildings) ? p.buildings : [];
    p.groundUnits = Array.isArray(p.groundUnits) ? p.groundUnits : [];
    p.orbitUnits = Array.isArray(p.orbitUnits) ? p.orbitUnits : [];
    p.groundQueue = Array.isArray(p.groundQueue) ? p.groundQueue : [];
    p.spaceQueue = Array.isArray(p.spaceQueue) ? p.spaceQueue : [];
    if (p.owner) {
      const civilization = empireCivilization(state, p.owner);
      p.groundQueue.forEach(item => { item.kind = civilizationUnitKind(civilization, item.kind); });
      p.spaceQueue.forEach(item => { item.kind = civilizationUnitKind(civilization, item.kind); });
      p.buildings.forEach(building => building.spaceQueue?.forEach(item => { item.kind = civilizationUnitKind(civilization, item.kind); }));
    }
    p.groundUnits.forEach(migrateUnitRoster);
    p.orbitUnits.forEach(migrateUnitRoster);
  }
  if (!state.neutralGarrisonsInitialized) {
    seedNeutralGarrisons(state.planets.filter(p => !state.battles.some(battle => battle.planetId === p.id)));
    state.neutralGarrisonsInitialized = true;
  }
  for (const p of state.planets) {
    const yards = spaceYards(p);
    for (const yard of yards) yard.spaceQueue ??= [];
    if (yards.length && p.spaceQueue.length) {
      p.spaceQueue.forEach((item, index) => yards[index % yards.length].spaceQueue!.push(item));
      p.spaceQueue = [];
    }
    p.buildings.forEach(ensureOrbitalDefenseHealth);
    if (p.orbitFocusTargetId && !p.buildings.some(building => building.id === p.orbitFocusTargetId && building.kind === 'spaceDefense')) delete p.orbitFocusTargetId;
    if (p.enemyOrbitFocusTargetId && !p.buildings.some(building => building.id === p.enemyOrbitFocusTargetId && building.kind === 'spaceDefense')) delete p.enemyOrbitFocusTargetId;
    for (const ship of p.orbitUnits) {
      delete ship.phaseArrival;
      if (ship.pendingLanding || ship.pendingEmbark) { ship.orbitTargetX ??= 0; ship.orbitTargetY ??= 0; }
    }
    ensureOrbitPositions(p);
  }
  for (const fleet of state.fleets) {
    migrateUnitRoster(fleet.unit);
    fleet.route ??= [];
    fleet.finalDestinationId ??= fleet.destinationId;
    fleet.phase ??= 'tunnel';
  }
  for (const battle of state.battles) {
    battle.attackers.forEach(migrateUnitRoster);
    battle.defenders.forEach(migrateUnitRoster);
    const attackingUnitFaction = battle.attackers[0]?.faction;
    battle.attackerFaction ??= attackingUnitFaction && attackingUnitFaction !== 'neutral' ? attackingUnitFaction : 'player';
    ensureGroundDefenseBattleUnits(state, battle);
    ensureBattlePositions(battle);
  }
  return state;
}

const addMessage = (state: GameState, message: string) => { state.messages = [message, ...state.messages].slice(0, 8); };
const getPlanet = (state: GameState, id: string) => state.planets.find(p => p.id === id);
export const canAfford = (resources: ResourcePool, cost: ResourcePool) =>
  resources.metal >= cost.metal && resources.crystal >= cost.crystal && resources.gold >= cost.gold;
const empireEconomy = (state: GameState, faction: EmpireFaction): EmpireEconomy => {
  if (faction === 'player') return { resources: state.resources, completedResearch: state.completedResearch, researchQueue: state.researchQueue, actionClock: 0, attackClock: 0, missionCount: 0 };
  if (faction === 'enemy') return { resources: state.enemyResources, completedResearch: state.enemyCompletedResearch, researchQueue: state.enemyResearchQueue, actionClock: state.enemyActionClock, attackClock: state.enemyAttackClock, missionCount: state.enemyMissionCount };
  state.additionalEmpires ??= {};
  return state.additionalEmpires[faction] ??= newEmpireEconomy(state.config.difficulty, empireCivilization(state, faction));
};
const battlefieldFactions = (units: Unit[]) => [...new Set(units.map(unit => unit.faction))]
  .filter((faction): faction is EmpireFaction => faction !== 'neutral');
const harvestBattlefieldBiomass = (state: GameState, destroyed: Unit[], participants: EmpireFaction[], location: string) => {
  const recovered = recoverableBiomass(destroyed);
  if (!recovered) return;
  participants.filter(faction => usesBiomass(state, faction)).forEach(faction => {
    const economy = empireEconomy(state, faction);
    economy.resources.biomass = (economy.resources.biomass ?? 0) + recovered;
    if (faction === 'player') addMessage(state, `BROOD HARVEST — ${recovered} biomass recovered ${location}.`);
  });
};
const harvestBattlefieldSalvage = (state: GameState, destroyed: Unit[], participants: EmpireFaction[], survivors: Unit[], location: string) => {
  const recovered = recoverableMetalScrap(destroyed);
  if (!recovered) return;
  participants.filter(faction => usesSalvage(state, faction)).forEach(faction => {
    const salvageArrayOnline = survivors.some(unit => unit.faction === faction && UNITS[unit.kind].ability?.kind === 'salvageArray');
    const metal = Math.floor(recovered * (salvageArrayOnline ? COVENANT_SALVAGE_ARRAY_MULTIPLIER : 1));
    empireEconomy(state, faction).resources.metal += metal;
    if (faction === 'player') addMessage(state, `COVENANT SALVAGE — ${metal} metal reclaimed ${location}.`);
  });
};
export const researchIncomeMultiplier = (completed: ResearchId[]) => completed.includes('deepCoreExtraction') ? 1.5 : completed.includes('quantumExtraction') ? 1.25 : 1;
export const researchProductionMultiplier = (completed: ResearchId[]) => completed.includes('rapidFabrication') ? 1.25 : 1;
export const phaseTravelMultiplier = (completed: ResearchId[]) => completed.includes('phaseMastery') ? .75 : 1;
export const shieldRecoveryMultiplier = (completed: ResearchId[]) => completed.includes('shieldHarmonics') ? 1.5 : 1;
export const orbitalDamageMultiplier = (completed: ResearchId[]) => completed.includes('weaponsCalibration') ? 1.15 : 1;
export const defenseDurabilityMultiplier = (completed: ResearchId[]) => completed.includes('planetaryFortifications') ? 1.25 : 1;
export const groundProductionMultiplier = (planet: Planet, completed: ResearchId[] = []) => Math.max(1, planet.buildings.filter(building =>
  building.kind === 'groundFactory' || building.kind === 'advancedGroundFactory').length) * researchProductionMultiplier(completed);
export const spaceProductionMultiplier = (completed: ResearchId[] = []) => researchProductionMultiplier(completed);
export const isSpaceYard = (building: Building) => building.kind === 'spaceFactory' || building.kind === 'advancedSpaceFactory';
export const spaceYards = (planet: Planet) => planet.buildings.filter(isSpaceYard);
const factionHasTitan = (state: GameState, faction: EmpireFaction) =>
  state.planets.some(planet => planet.orbitUnits.some(ship => ship.faction === faction && isTitanKind(ship.kind)))
  || state.fleets.some(fleet => fleet.faction === faction && isTitanKind(fleet.unit.kind))
  || state.planets.some(planet => planet.owner === faction && spaceYards(planet).some(yard => yard.spaceQueue?.some(item => isTitanKind(item.kind))));
const spend = (resources: ResourcePool, cost: ResourcePool) => {
  resources.metal -= cost.metal; resources.crystal -= cost.crystal; resources.gold -= cost.gold;
};
const canPlayerAfford = (state: GameState, cost: ResourcePool) => usesBiomass(state)
  ? (state.resources.biomass ?? 0) >= biomassCost(cost)
  : canAfford(state.resources, cost);
const spendPlayerResources = (state: GameState, cost: ResourcePool) => {
  if (usesBiomass(state)) state.resources.biomass = (state.resources.biomass ?? 0) - biomassCost(cost);
  else spend(state.resources, cost);
};
const insufficientPlayerResources = (state: GameState) => usesBiomass(state) ? 'Insufficient biomass.' : 'Insufficient resources.';
const hasResearch = (state: GameState, id?: ResearchId) => !id || state.completedResearch.includes(id);

export type GameResult = { ok: true; state: GameState } | { ok: false; state: GameState; error: string };
const fail = (state: GameState, error: string): GameResult => ({ ok: false, state, error });
const pass = (state: GameState): GameResult => ({ ok: true, state });

export function tradeResources(input: GameState, from: Resource, to: Resource): GameResult {
  if (usesBiomass(input)) return fail(input, 'The Brood cannot trade mineral resources.');
  if (from === to) return fail(input, 'Choose two different resources.');
  if (input.resources[from] < RESOURCE_TRADE_SPEND) return fail(input, `Requires ${RESOURCE_TRADE_SPEND} ${from}.`);
  const state = clone(input);
  state.resources[from] -= RESOURCE_TRADE_SPEND;
  state.resources[to] += RESOURCE_TRADE_RECEIVE;
  addMessage(state, `TRADE COMPLETE — ${RESOURCE_TRADE_SPEND} ${from.toUpperCase()} exchanged for ${RESOURCE_TRADE_RECEIVE} ${to.toUpperCase()}.`);
  return pass(state);
}

export function constructBuilding(input: GameState, planetId: string, kind: BuildingKind): GameResult {
  const state = clone(input); const p = getPlanet(state, planetId); const def = BUILDINGS[kind];
  if (!p || p.owner !== 'player') return fail(input, 'Select one of your colonies.');
  if (usesBiomass(state) && ['metalMine', 'crystalMine', 'goldMine'].includes(kind)) return fail(input, 'The Brood grows biomass naturally and cannot construct mineral mines.');
  const count = p.buildings.filter(b => b.kind === kind).length;
  const unlimited = hasUnlimitedBuildingCapacity(kind);
  if (!unlimited && count >= p.buildingLimits[kind]) return fail(input, `${p.name} has reached its ${def.label} limit.`);
  if (!hasResearch(state, def.requires)) return fail(input, `Requires ${RESEARCH[def.requires!].label}.`);
  if (!canPlayerAfford(state, def.cost)) return fail(input, insufficientPlayerResources(state));
  spendPlayerResources(state, def.cost);
  const building: Building = { id: `b${state.nextId++}`, kind };
  if (isSpaceYard(building)) building.spaceQueue = [];
  ensureOrbitalDefenseHealth(building);
  p.buildings.push(building);
  addMessage(state, `${def.label} ${count + 1}/${unlimited ? '∞' : p.buildingLimits[kind]} constructed on ${p.name}.`);
  return pass(state);
}

export function queueUnit(input: GameState, planetId: string, kind: UnitKind, yardIds?: string[]): GameResult {
  const state = clone(input); const p = getPlanet(state, planetId); const def = UNITS[kind];
  if (kind === 'defenseTurret' || kind === 'spineTower' || kind === 'covenantBulwark') return fail(input, 'Defensive emplacements deploy automatically from Ground Defenses.');
  if (!p || p.owner !== 'player') return fail(input, 'Production requires a friendly colony.');
  if (isTitanKind(kind) && factionHasTitan(state, 'player')) return fail(input, 'Your empire can field only one Titan at a time.');
  const civilization = empireCivilization(state);
  if (!unitAvailableToCivilization(kind, civilization)) return fail(input, civilization === 'brood'
    ? 'That organism is not part of the Brood genome.'
    : 'That unit is unavailable to this civilization.');
  const needed = def.factory === 'ground' ? 'groundFactory' : 'spaceFactory';
  if (!p.buildings.some(b => b.kind === needed || b.kind === `advanced${needed[0].toUpperCase()}${needed.slice(1)}`)) return fail(input, `Requires a ${def.factory === 'ground' ? 'Ground Factory' : 'Space Yard'}.`);
  if (!hasResearch(state, def.requires)) return fail(input, `Requires ${RESEARCH[def.requires!].label}.`);
  if (def.factory === 'ground') {
    if (def.advancedFactory && !p.buildings.some(building => building.kind === 'advancedGroundFactory')) return fail(input, 'Requires an Advanced Ground Factory.');
    if (!canPlayerAfford(state, def.cost)) return fail(input, insufficientPlayerResources(state));
    spendPlayerResources(state, def.cost);
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
  if (isTitanKind(kind) && targets.length > 1) return fail(input, 'A Titan must be commissioned at one Advanced Space Yard.');
  const totalCost = pool(def.cost.metal * targets.length, def.cost.crystal * targets.length, def.cost.gold * targets.length);
  if (!canPlayerAfford(state, totalCost)) return fail(input, usesBiomass(state) ? 'Insufficient biomass.' : `Insufficient resources to queue ${targets.length} ship${targets.length === 1 ? '' : 's'}.`);
  spendPlayerResources(state, totalCost);
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
  if (!canPlayerAfford(state, def.cost)) return fail(input, insufficientPlayerResources(state));
  spendPlayerResources(state, def.cost);
  state.researchQueue.push({ id, remaining: def.time!, total: def.time! });
  addMessage(state, `${def.label} research initiated.`);
  return pass(state);
}

function embarkAvailableSquads(state: GameState, origin: Planet, ship: Unit, faction: EmpireFaction = 'player') {
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
  const selectedIds = new Set(unitIds);
  const occupied = p.orbitUnits.filter(ship => !selectedIds.has(ship.id));
  let availableSquads = p.groundUnits.filter(unit => unit.faction === 'player').length;
  ships.forEach(ship => {
    delete ship.phaseArrival;
    const openCapacity = Math.max(0, (UNITS[ship.kind].capacity ?? 0) - (ship.cargo?.length ?? 0));
    if ((ship.cargo?.length ?? 0) > 0) {
      delete ship.docked;
      delete ship.pendingEmbark;
      ship.pendingLanding = true;
      ship.orbitTargetX = 0;
      ship.orbitTargetY = 0;
    } else if (openCapacity && availableSquads) {
      delete ship.docked;
      delete ship.pendingLanding;
      ship.pendingEmbark = true;
      ship.orbitTargetX = 0;
      ship.orbitTargetY = 0;
      availableSquads -= Math.min(openCapacity, availableSquads);
    } else {
      delete ship.pendingLanding;
      delete ship.pendingEmbark;
      targetOpenOrbit(p, ship, occupied);
    }
    occupied.push(ship);
  });
  const landing = ships.filter(ship => ship.pendingLanding).length;
  const embarking = ships.filter(ship => ship.pendingEmbark).length;
  addMessage(state, landing
    ? `${landing} loaded transport${landing === 1 ? '' : 's'} approaching ${p.name} to deploy ground forces.`
    : embarking
    ? `${embarking} transport${embarking === 1 ? '' : 's'} approaching ${p.name} to embark ground forces.`
    : `${ships.length} ship${ships.length === 1 ? '' : 's'} repositioning over ${p.name}.`);
  return pass(state);
}

export const dockSpaceUnit = (input: GameState, planetId: string, unitId: string) => dockSpaceUnits(input, planetId, [unitId]);

export function maneuverSpaceUnits(input: GameState, planetId: string, unitIds: string[], orbitX: number, orbitY: number): GameResult {
  const state = clone(input); const p = getPlanet(state, planetId);
  const requestedIds = new Set(unitIds);
  const orbitShips = p?.orbitUnits.filter(u => requestedIds.has(u.id) && u.faction === 'player') ?? [];
  const interruptedFleets = state.fleets.filter(fleet => requestedIds.has(fleet.unit.id) && fleet.faction === 'player' && fleet.originId === planetId && (fleet.phase === 'exiting' || fleet.phase === 'charging'));
  if (!p || !requestedIds.size || orbitShips.length + interruptedFleets.length !== requestedIds.size) return fail(input, 'Selected ships are not inside this gravity well or have already entered the phase tunnel.');
  const interruptedIds = new Set(interruptedFleets.map(fleet => fleet.id));
  for (const fleet of interruptedFleets) {
    const destination = getPlanet(state, fleet.destinationId)!;
    const border = systemBorderOffset(p, destination);
    const progress = fleet.phase === 'charging' || fleet.travelTime <= 0 ? 1 : Math.min(1, fleet.progress / fleet.travelTime);
    fleet.unit.orbitX = (fleet.departureX ?? 0) + (border.x - (fleet.departureX ?? 0)) * progress;
    fleet.unit.orbitY = (fleet.departureY ?? 0) + (border.y - (fleet.departureY ?? 0)) * progress;
    p.orbitUnits.push(fleet.unit);
  }
  if (interruptedIds.size) state.fleets = state.fleets.filter(fleet => !interruptedIds.has(fleet.id));
  const ships = unitIds.map(id => p.orbitUnits.find(unit => unit.id === id)!).filter(Boolean);
  const selectedIds = new Set(ships.map(ship => ship.id));
  const occupied = p.orbitUnits.filter(ship => !selectedIds.has(ship.id) && !ship.docked).flatMap(ship => {
    const x = ship.orbitTargetX ?? ship.orbitX, y = ship.orbitTargetY ?? ship.orbitY;
    return typeof x === 'number' && typeof y === 'number' ? [{ orbitX: x, orbitY: y }] : [];
  });
  ships.forEach((ship, index) => {
    delete ship.docked;
    delete ship.phaseArrival;
    delete ship.pendingLanding;
    delete ship.pendingEmbark;
    const column = index % 4, row = Math.floor(index / 4);
    const targetX = orbitX + (column - Math.min(ships.length - 1, 3) / 2) * MIN_SHIP_ORBIT_SEPARATION;
    const targetY = orbitY + row * MIN_SHIP_ORBIT_SEPARATION;
    const target = nearestOpenOrbitPosition(targetX, targetY, occupied);
    ship.orbitTargetX = target.x; ship.orbitTargetY = target.y;
    occupied.push({ orbitX: target.x, orbitY: target.y });
    ship.heading = headingForVector(ship.orbitTargetX - (ship.orbitX ?? 0), ship.orbitTargetY - (ship.orbitY ?? 0), ship.heading);
  });
  addMessage(state, `${interruptedFleets.length ? 'Jump canceled — ' : ''}${ships.length} ship${ships.length === 1 ? '' : 's'} maneuvering inside ${p.name} gravity well.`);
  return pass(state);
}

export const maneuverSpaceUnit = (input: GameState, planetId: string, unitId: string, orbitX: number, orbitY: number) => maneuverSpaceUnits(input, planetId, [unitId], orbitX, orbitY);

export function upgradeTitan(input: GameState, planetId: string, unitId: string, upgradeId: TitanUpgradeId): GameResult {
  const state = clone(input); const p = getPlanet(state, planetId);
  const titan = p?.orbitUnits.find(ship => ship.id === unitId && ship.faction === 'player' && isTitanKind(ship.kind))
    ?? state.fleets.find(fleet => fleet.unit.id === unitId && fleet.faction === 'player' && isTitanKind(fleet.unit.kind))?.unit;
  if (!titan) return fail(input, 'That Titan is not available for an upgrade.');
  if (!(upgradeId in TITAN_UPGRADES)) return fail(input, 'Unknown Titan refit.');
  if (titan.titanUpgrades?.includes(upgradeId)) return fail(input, 'That Titan refit is already installed.');
  const upgrade = TITAN_UPGRADES[upgradeId];
  if (!canPlayerAfford(state, upgrade.cost)) return fail(input, insufficientPlayerResources(state));
  spendPlayerResources(state, upgrade.cost);
  titan.titanUpgrades = [...(titan.titanUpgrades ?? []), upgradeId];
  if (upgradeId === 'shieldMatrix') {
    const oldMaximum = titan.maxShields;
    titan.maxShields = Math.round(oldMaximum * 1.4);
    titan.shields = Math.min(titan.maxShields, titan.shields + titan.maxShields - oldMaximum);
  }
  addMessage(state, `${upgrade.label} installed aboard ${UNITS[titan.kind].label}.`);
  return pass(state);
}

const phaseTravelTime = (from: Planet, to: Planet) => Math.max(12, Math.hypot(to.x - from.x, to.y - from.y) * .85);

const systemBorderOffset = (from: Planet, to: Planet) => {
  const dx = to.x - from.x, dy = to.y - from.y;
  const distance = Math.hypot(dx, dy) || 1;
  const radius = MAX_SHIP_ORBIT_RADIUS;
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

function dispatchFactionUnits(state: GameState, origin: Planet, ships: Unit[], destination: Planet, faction: EmpireFaction) {
  const path = findPlanetPath(state.planets, origin.id, destination.id);
  if (!path || path.length < 2) return false;
  const firstDestination = getPlanet(state, path[1])!;
  const selected = new Set(ships.map(ship => ship.id));
  origin.orbitUnits = origin.orbitUnits.filter(unit => !selected.has(unit.id));
  for (const ship of ships) {
    embarkAvailableSquads(state, origin, ship, faction);
    const departureX = ship.orbitX ?? 0, departureY = ship.orbitY ?? 0;
    delete ship.docked;
    delete ship.phaseArrival;
    delete ship.pendingLanding;
    delete ship.pendingEmbark;
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
  if (ships.some(ship => ship.pendingEmbark)) return fail(input, 'Transports must complete embarkation before jumping.');
  const path = findPlanetPath(state.planets, originId, destinationId);
  if (!path || path.length < 2) return fail(input, 'No phase-lane route reaches that gravity well.');
  dispatchFactionUnits(state, origin, ships, destination, 'player');
  addMessage(state, `${ships.length} ship${ships.length === 1 ? '' : 's'} routed across ${path.length - 1} phase lane${path.length === 2 ? '' : 's'} to ${destination.name}.`);
  return pass(state);
}

export const dispatchSpaceUnit = (input: GameState, originId: string, unitId: string, destinationId: string) => dispatchSpaceUnits(input, originId, [unitId], destinationId);

export const dispatchTransport = dispatchSpaceUnit;

function groundDefenseUnit(state: GameState, building: Building, faction: Exclude<Faction, null>): Unit {
  const power = (state.aiFactions?.includes(faction) ? enemyDifficultyMultiplier(state.config.difficulty) : 1)
    * defenseDurabilityMultiplier(empireEconomy(state, faction).completedResearch);
  const turret = unit(`ground-defense-${building.id}`, groundDefenseKindForCivilization(empireCivilization(state, faction)), faction);
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
  const activeBattle = state.battles.find(battle => battle.planetId === p.id);
  if (activeBattle) {
    const attackerFaction = activeBattle.attackerFaction ?? activeBattle.attackers[0]?.faction;
    const reinforcements = faction === attackerFaction ? activeBattle.attackers : activeBattle.defenders;
    reinforcements.push(...cargo);
    ensureBattlePositions(activeBattle);
    addMessage(state, `${cargo.length} ${faction === attackerFaction ? 'attacking' : 'defending'} squad${cargo.length === 1 ? '' : 's'} reinforced the ground battle on ${p.name}.`);
    transport.cargo = [];
    transport.loadedUnitIds = [];
    return;
  }
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
  if (p && target && p.owner && p.owner !== 'player' && hasAttackers) {
    p.orbitFocusTargetId = p.orbitFocusTargetId === targetId ? undefined : targetId;
    addMessage(state, `${p.orbitFocusTargetId ? 'Priority target locked' : 'Priority target released'}: orbital defense at ${p.name}.`);
  }
  return state;
}

export const EMPIRE_FACTIONS: EmpireFaction[] = ['player', 'enemy', 'rival2', 'rival3'];

const newEmpireEconomy = (difficulty: EnemyDifficulty, civilization: PlayableFaction = 'human'): EmpireEconomy => ({
  resources: startingResources(civilization), completedResearch: [], researchQueue: [], actionClock: 8,
  attackClock: difficulty === 'cadet' ? 180 : difficulty === 'admiral' ? 100 : 130, missionCount: 0,
});

export function createCompetitiveState(config: GameConfig = DEFAULT_GAME_CONFIG, requestedSlots?: MatchEmpireSlot[]) {
  const slots = requestedSlots?.length ? requestedSlots.slice(0, 4) : [
    { faction: 'player', controller: 'human' }, { faction: 'enemy', controller: 'human' },
  ] satisfies MatchEmpireSlot[];
  const playerCivilization = slots.find(slot => slot.faction === 'player')?.civilization ?? config.playerFaction ?? 'human';
  const effectiveConfig = { ...config, playerFaction: playerCivilization, ...(slots.length > 2 && config.mapSize !== 'huge' ? { mapSize: 'huge' as const } : {}) };
  const state = createInitialState(effectiveConfig, 'competitive');
  const homeIds = ['terra', 'cygnus', 'halcyon', 'vesta'];
  const firstEmpire = state.planets.find(planet => planet.id === homeIds[0])!;
  slots.forEach(slot => {
    const civilization = slot.civilization ?? (slot.faction === 'player' ? playerCivilization : 'human');
    const home = state.planets.find(planet => planet.id === homeIds[EMPIRE_FACTIONS.indexOf(slot.faction)])!;
    state.empireCivilizations[slot.faction] = civilization;
    home.owner = slot.faction;
    home.groundUnits = [];
    home.orbitUnits = [];
    home.buildings = starterBuildings(`${slot.faction}-start-`, civilization);
    home.resourceYield = { ...firstEmpire.resourceYield };
    home.buildingLimits = { ...firstEmpire.buildingLimits };
    if (slot.faction === 'player') state.resources = startingResources(civilization);
    else if (slot.faction === 'enemy') state.enemyResources = startingResources(civilization);
    else state.additionalEmpires![slot.faction] = newEmpireEconomy(config.difficulty, civilization);
  });
  state.aiFactions = slots.filter(slot => slot.controller === 'ai').map(slot => slot.faction);
  state.messages = [`FREE-FOR-ALL LINK ONLINE — ${slots.length} empires await command.`];
  return state;
}

export function recoverGroundUnits(units: Unit[]): Unit[] {
  return units.map(unit => {
    const restored = { ...unit, hp: unit.maxHp, shields: unit.maxShields };
    delete restored.battleX; delete restored.battleY;
    delete restored.weaponCooldown; delete restored.weaponFlash;
    delete restored.battleTargetX; delete restored.battleTargetY;
    delete restored.battleRetaliationTargetId;
    delete restored.corrodedFor;
    return restored;
  });
}

export const AEGIS_SHIELD_REGEN_BONUS = 3;
export const AEGIS_GROUND_SHIELD_REGEN = 1.5;
export const AEGIS_SHIELD_PROJECTION_RANGE = 220;
export const AEGIS_WARD_INTERCEPTION_RANGE = 180;
export const AEGIS_REPAIR_DRONE_RANGE = 240;
export const COVENANT_GROUND_HULL_REGEN = .5;
export const COVENANT_FIELD_REPAIR_PER_SECOND = 1;
export const COVENANT_FIELD_REPAIR_RANGE = 18;
export const COVENANT_ASSEMBLY_REPAIR_RANGE = 220;
export const COVENANT_FOUNDRY_REPAIR_RANGE = 280;

export function recoverSpaceUnit(u: Unit, friendlyOrbit: boolean, seconds: number, civilization: PlayableFaction = 'human', recoveryMultiplier = 1): Unit {
  const shieldRecovery = (5 + (civilization === 'aegis' ? AEGIS_SHIELD_REGEN_BONUS : 0)) * recoveryMultiplier;
  const livingHold = UNITS[u.kind].ability?.kind === 'livingHold';
  const hullRecovery = livingHold ? 4 : civilization === 'covenant' ? (friendlyOrbit ? 4 : 2) : friendlyOrbit ? 2 : 0;
  return { ...u, shields: Math.min(u.maxShields, u.shields + seconds * shieldRecovery), hp: Math.min(u.maxHp, u.hp + seconds * hullRecovery) };
}

export function recoverCarrierFighters(input: Unit, seconds: number): Unit {
  const wing = UNITS[input.kind].fighterWing;
  if (!wing) return input;
  const fighterCount = carrierFighterCount(input);
  if (seconds <= 0) return { ...input, fighterCount, fighterBuildProgress: input.fighterBuildProgress ?? 0, fighterLossProgress: input.fighterLossProgress ?? 0 };
  if (fighterCount >= wing.capacity) return { ...input, fighterCount, fighterBuildProgress: 0, fighterLossProgress: input.fighterLossProgress ?? 0 };
  const progress = (input.fighterBuildProgress ?? 0) + seconds;
  const completed = Math.min(wing.capacity - fighterCount, Math.floor(progress / wing.rebuildTime));
  return {
    ...input,
    fighterCount: fighterCount + completed,
    fighterBuildProgress: completed ? progress - completed * wing.rebuildTime : progress,
    fighterLossProgress: input.fighterLossProgress ?? 0,
  };
}

function applyCarrierFighterAttrition(ship: Unit, seconds: number) {
  const wing = UNITS[ship.kind].fighterWing;
  const fighterCount = carrierFighterCount(ship);
  if (!wing || !fighterCount || seconds <= 0) return;
  const progress = (ship.fighterLossProgress ?? 0) + seconds;
  const losses = Math.min(fighterCount, Math.floor(progress / wing.attritionTime));
  ship.fighterCount = fighterCount - losses;
  ship.fighterLossProgress = losses ? progress - losses * wing.attritionTime : progress;
}

export function recoverOrbitalDefense(input: Building, seconds: number): Building {
  const building = { ...input };
  if (building.kind !== 'spaceDefense') return building;
  ensureOrbitalDefenseHealth(building);
  if (building.hp! <= 0) return building;
  building.hp = Math.min(building.maxHp!, building.hp! + seconds * ORBITAL_DEFENSE_HULL_REGEN);
  building.shields = Math.min(building.maxShields!, building.shields! + seconds * ORBITAL_DEFENSE_SHIELD_REGEN);
  return building;
}

function damageUnit(target: Unit, damage: number): Unit {
  const ability = UNITS[target.kind].ability?.kind;
  const reducedDamage = damage * (ability === 'evasiveChitin' ? .7 : ability === 'phaseCarapace' ? .65 : ability === 'ironcladArmor' ? .75 : ability === 'ablativePlating' && target.hp > target.maxHp / 2 ? .7 : 1);
  const shieldDamage = Math.min(target.shields, reducedDamage);
  return { ...target, shields: target.shields - shieldDamage, hp: target.hp - (reducedDamage - shieldDamage) };
}

function damageUnitPiercing(target: Unit, damage: number, piercingFraction = 0): Unit {
  const ability = UNITS[target.kind].ability?.kind;
  const reducedDamage = damage * (ability === 'evasiveChitin' ? .7 : ability === 'phaseCarapace' ? .65 : ability === 'ironcladArmor' ? .75 : ability === 'ablativePlating' && target.hp > target.maxHp / 2 ? .7 : 1);
  const directHullDamage = reducedDamage * piercingFraction;
  const shieldedDamage = reducedDamage - directHullDamage;
  const shieldDamage = Math.min(target.shields, shieldedDamage);
  return { ...target, shields: target.shields - shieldDamage, hp: target.hp - directHullDamage - (shieldedDamage - shieldDamage) };
}

function damageBuilding(target: Building, damage: number): Building {
  ensureOrbitalDefenseHealth(target);
  const shieldDamage = Math.min(target.shields!, damage);
  return { ...target, shields: target.shields! - shieldDamage, hp: target.hp! - (damage - shieldDamage) };
}

function ensureBattlePositions(battle: GroundBattle) {
  const deploy = (units: Unit[], x: number, direction: 1 | -1) => units.forEach((unit, index) => {
    if (typeof unit.battleX === 'number' && typeof unit.battleY === 'number') return;
    const rowsPerColumn = 13;
    const column = Math.floor(index / rowsPerColumn), row = index % rowsPerColumn;
    const rowCount = Math.min(rowsPerColumn, units.length - column * rowsPerColumn);
    const position = clampGroundPosition(
      x + column * GROUND_FORMATION_X_SPACING * direction,
      50 + (row - (rowCount - 1) / 2) * GROUND_FORMATION_Y_SPACING,
    );
    unit.battleX = position.battleX;
    unit.battleY = position.battleY;
  });
  deploy(battle.attackers, 12, 1);
  deploy(battle.defenders, 88, -1);
  separateGroundUnits([...battle.attackers, ...battle.defenders]);
}

const battleDistance = (a: Unit, b: Unit) => Math.hypot((b.battleX ?? 0) - (a.battleX ?? 0), (b.battleY ?? 0) - (a.battleY ?? 0));

function nearestBattleTarget(unit: Unit, enemies: Unit[], preferredId?: string) {
  const preferred = preferredId && enemies.find(enemy => enemy.id === preferredId);
  return preferred ?? enemies.reduce<Unit | undefined>((nearest, enemy) => !nearest || battleDistance(unit, enemy) < battleDistance(unit, nearest) ? enemy : nearest, undefined);
}

function tickUnitWeapon(unit: Unit, seconds: number, firing: boolean) {
  const weapon = UNITS[unit.kind].weapon;
  unit.weaponFlash = Math.max(0, (unit.weaponFlash ?? 0) - seconds);
  const cooldown = Math.max(0, unit.weaponCooldown ?? 0);
  if (!firing || seconds <= 0) {
    unit.weaponCooldown = Math.max(0, cooldown - seconds);
    return 0;
  }
  if (cooldown > seconds) {
    unit.weaponCooldown = cooldown - seconds;
    return 0;
  }
  const activeTime = seconds - cooldown;
  const followupVolleys = Math.floor((activeTime + 1e-9) / weapon.cooldown);
  const timeSinceLastVolley = Math.max(0, activeTime - followupVolleys * weapon.cooldown);
  unit.weaponCooldown = Math.max(0, weapon.cooldown - timeSinceLastVolley);
  const flashDuration = Math.max(.45, Math.min(.9, weapon.cooldown * .5));
  unit.weaponFlash = Math.max(0, flashDuration - timeSinceLastVolley);
  return (followupVolleys + 1) * weapon.damage * weapon.projectiles;
}

const moveBattleUnitToward = (unit: Unit, x: number, y: number, seconds: number) => {
  const dx = x - (unit.battleX ?? 0), dy = y - (unit.battleY ?? 0);
  const distance = Math.hypot(dx, dy), travel = Math.min(UNITS[unit.kind].moveSpeed * seconds, distance);
  if (!distance || !travel) return;
  unit.battleX = (unit.battleX ?? 0) + dx / distance * travel;
  unit.battleY = (unit.battleY ?? 0) + dy / distance * travel;
};

interface GroundHit {
  damage: number;
  retaliationTargetId?: string;
  strongestRetaliationHit: number;
  corrosionSeconds?: number;
}

function addGroundDamage(hits: Map<string, GroundHit>, targetId: string, damage: number) {
  const current = hits.get(targetId);
  if (!current) hits.set(targetId, { damage, strongestRetaliationHit: 0 });
  else current.damage += damage;
}

function recordOrbitalBombardment(p: Planet, battle: GroundBattle, seconds: number, hits: Map<string, GroundHit>) {
  if (seconds <= 0) return;
  const combatants = [...battle.attackers, ...battle.defenders];
  for (const faction of EMPIRE_FACTIONS) {
    if (!combatants.some(unit => unit.faction === faction)) continue;
    const supportingShips = p.orbitUnits.filter(unit => unit.faction === faction);
    const orbitContested = p.orbitUnits.some(unit => unit.faction !== 'neutral' && unit.faction !== faction);
    const targets = combatants.filter(unit => unit.faction !== faction);
    if (!supportingShips.length || orbitContested || !targets.length) continue;
    const damagePerTarget = supportingShips.length * ORBITAL_BOMBARDMENT_DAMAGE_PER_SHIP * seconds / targets.length;
    targets.forEach(target => addGroundDamage(hits, target.id, damagePerTarget));
  }
}

function recordGroundHit(hits: Map<string, GroundHit>, attacker: Unit, target: Unit, damage: number) {
  const amplifiedDamage = damage * ((target.corrodedFor ?? 0) > 0 ? 1.35 : 1);
  const current = hits.get(target.id);
  if (!current) {
    hits.set(target.id, { damage: amplifiedDamage, strongestRetaliationHit: 0 });
  } else {
    current.damage += amplifiedDamage;
  }
  const hit = hits.get(target.id)!;
  if (UNITS[attacker.kind].ability?.kind === 'corrosiveBile') hit.corrosionSeconds = 5;
  if (UNITS[target.kind].ability?.kind === 'thornedCarapace') addGroundDamage(hits, attacker.id, amplifiedDamage * .2);
  if (battleDistance(target, attacker) <= UNITS[target.kind].range) return;
  if (amplifiedDamage > hit.strongestRetaliationHit || (amplifiedDamage === hit.strongestRetaliationHit && (!hit.retaliationTargetId || attacker.id < hit.retaliationTargetId))) {
    hit.retaliationTargetId = attacker.id;
    hit.strongestRetaliationHit = amplifiedDamage;
  }
}

function groundAbilityDamageMultiplier(unit: Unit, allies: Unit[], target: Unit) {
  let multiplier = 1;
  const ability = UNITS[unit.kind].ability?.kind;
  if (ability === 'swarmInstinct') {
    const nearbyPacks = allies.filter(ally => ally.id !== unit.id && ally.kind === 'broodling' && battleDistance(unit, ally) <= 14).length;
    multiplier *= 1 + Math.min(3, nearbyPacks) * .2;
  }
  if (allies.some(ally => UNITS[ally.kind].ability?.kind === 'synapseAura' && battleDistance(unit, ally) <= 22)) multiplier *= 1.25;
  if (ability === 'siegeCharge' && target.sourceBuildingId) multiplier *= 2;
  if (ability === 'modularTargeting' && allies.some(ally => ally.id !== unit.id && ally.kind !== unit.kind && battleDistance(unit, ally) <= 18)) multiplier *= 1.25;
  if (ability === 'shieldBreaker' && target.shields > 0) multiplier *= 1.5;
  const targetIsMoving = typeof target.battleTargetX === 'number' && typeof target.battleTargetY === 'number'
    && Math.hypot(target.battleTargetX - (target.battleX ?? 0), target.battleTargetY - (target.battleY ?? 0)) > .5;
  if (ability === 'movingTargetBarrage' && targetIsMoving) multiplier *= 1.75;
  return multiplier;
}

function fireGroundWeapon(unit: Unit, allies: Unit[], enemies: Unit[], target: Unit, seconds: number, hits: Map<string, GroundHit>, power: number) {
  const salvoDamage = tickUnitWeapon(unit, seconds, true);
  if (!salvoDamage) return;
  const damage = salvoDamage * power * groundAbilityDamageMultiplier(unit, allies, target);
  recordGroundHit(hits, unit, target, damage);
  const ability = UNITS[unit.kind].ability?.kind;
  const splash = ability === 'burstSpores' ? .35 : ability === 'judgmentShockwave' ? .45 : ability === 'forgeShockwave' ? .4 : 0;
  if (!splash) return;
  enemies.filter(enemy => enemy.id !== target.id && battleDistance(target, enemy) <= 10)
    .forEach(enemy => recordGroundHit(hits, unit, enemy, damage * splash));
}

function protectGroundFormation(hits: Map<string, GroundHit>, allies: Unit[]) {
  for (const target of allies) {
    const hit = hits.get(target.id);
    if (!hit || UNITS[target.kind].ability?.kind === 'paladinIntercept') continue;
    const guard = allies.find(ally => ally.id !== target.id && UNITS[ally.kind].ability?.kind === 'paladinIntercept' && battleDistance(target, ally) <= 16);
    if (!guard) continue;
    const intercepted = hit.damage * .4;
    hit.damage -= intercepted;
    addGroundDamage(hits, guard.id, intercepted);
  }
  for (const target of allies) {
    const hit = hits.get(target.id);
    if (!hit) continue;
    const behindShieldWall = allies.some(ally => ally.shields > 0 && UNITS[ally.kind].ability?.kind === 'shieldWall' && battleDistance(target, ally) <= 18);
    if (behindShieldWall) hit.damage *= .8;
    if (UNITS[target.kind].ability?.kind === 'bastionAnchor' && (target.weaponFlash ?? 0) > 0) hit.damage *= .65;
  }
}

function advanceOrFire(unit: Unit, allies: Unit[], enemies: Unit[], seconds: number, hits: Map<string, GroundHit>, preferredId?: string, power = 1) {
  const definition = UNITS[unit.kind];
  const retaliationTarget = unit.battleRetaliationTargetId && enemies.find(enemy => enemy.id === unit.battleRetaliationTargetId);
  if (unit.battleRetaliationTargetId && !retaliationTarget) delete unit.battleRetaliationTargetId;
  if (retaliationTarget) {
    if (battleDistance(unit, retaliationTarget) <= definition.range) {
      fireGroundWeapon(unit, allies, enemies, retaliationTarget, seconds, hits, power);
    } else {
      tickUnitWeapon(unit, seconds, false);
      moveBattleUnitToward(unit, retaliationTarget.battleX ?? 0, retaliationTarget.battleY ?? 0, seconds);
    }
    return;
  }
  const enemiesInRange = enemies.filter(enemy => battleDistance(unit, enemy) <= definition.range);
  const targetInRange = nearestBattleTarget(unit, enemiesInRange, preferredId);
  if (targetInRange) {
    fireGroundWeapon(unit, allies, enemies, targetInRange, seconds, hits, power);
    return;
  }
  tickUnitWeapon(unit, seconds, false);
  if (typeof unit.battleTargetX === 'number' && typeof unit.battleTargetY === 'number') {
    moveBattleUnitToward(unit, unit.battleTargetX, unit.battleTargetY, seconds);
    return;
  }
  const target = nearestBattleTarget(unit, enemies, preferredId);
  if (!target) return;
  const distance = battleDistance(unit, target);
  const travel = Math.min(definition.moveSpeed * seconds, Math.max(0, distance - definition.range * .92));
  if (!travel || !distance) return;
  unit.battleX = (unit.battleX ?? 0) + ((target.battleX ?? 0) - (unit.battleX ?? 0)) / distance * travel;
  unit.battleY = (unit.battleY ?? 0) + ((target.battleY ?? 0) - (unit.battleY ?? 0)) / distance * travel;
}

export function maneuverGroundUnits(input: GameState, planetId: string, unitIds: string[], battleX: number, battleY: number): GameResult {
  const state = clone(input);
  const battle = state.battles.find(candidate => candidate.planetId === planetId);
  const requested = new Set(unitIds);
  const units = battle ? [...battle.attackers, ...battle.defenders].filter(unit => requested.has(unit.id) && unit.faction === 'player' && !unit.sourceBuildingId) : [];
  if (!battle || !units.length || units.length !== requested.size) return fail(input, 'Select mobile ground units in the active battle.');
  const center = clampGroundPosition(battleX, battleY);
  const columns = Math.min(5, Math.ceil(Math.sqrt(units.length)));
  const selectedIds = new Set(units.map(unit => unit.id));
  const occupied = [...battle.attackers, ...battle.defenders]
    .filter(unit => !selectedIds.has(unit.id))
    .map(unit => ({
      id: unit.id,
      battleX: unit.battleTargetX ?? unit.battleX ?? 0,
      battleY: unit.battleTargetY ?? unit.battleY ?? 0,
    }));
  units.forEach((unit, index) => {
    const column = index % columns, row = Math.floor(index / columns);
    const rowCount = Math.min(columns, units.length - row * columns);
    const position = nearestOpenGroundPosition(
      center.battleX + (column - (rowCount - 1) / 2) * GROUND_FORMATION_X_SPACING,
      center.battleY + (row - (Math.ceil(units.length / columns) - 1) / 2) * GROUND_FORMATION_Y_SPACING,
      occupied,
    );
    unit.battleTargetX = position.battleX;
    unit.battleTargetY = position.battleY;
    occupied.push({ id: unit.id, ...position });
    delete unit.battleRetaliationTargetId;
  });
  return pass(state);
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
  const restoreFactionSystems = (units: Unit[]) => units.map(unit => {
    if (unit.faction === 'neutral') return unit;
    const civilization = empireCivilization(state, unit.faction);
    if (civilization === 'aegis') return { ...unit, shields: Math.min(unit.maxShields, unit.shields + seconds * AEGIS_GROUND_SHIELD_REGEN) };
    if (civilization !== 'covenant') return unit;
    const fieldRepair = units.some(ally => ally.id !== unit.id && UNITS[ally.kind].ability?.kind === 'fieldRepair' && battleDistance(unit, ally) <= COVENANT_FIELD_REPAIR_RANGE);
    const healing = seconds * (COVENANT_GROUND_HULL_REGEN + (fieldRepair ? COVENANT_FIELD_REPAIR_PER_SECOND : 0));
    return { ...unit, hp: Math.min(unit.maxHp, unit.hp + healing) };
  });
  battle.attackers = restoreFactionSystems(battle.attackers);
  battle.defenders = restoreFactionSystems(battle.defenders);
  const combatantsBefore = [...battle.attackers, ...battle.defenders];
  combatantsBefore.forEach(unit => { if (unit.corrodedFor) unit.corrodedFor = Math.max(0, unit.corrodedFor - seconds); });
  const participants = battlefieldFactions(combatantsBefore);
  const hits = new Map<string, GroundHit>();
  const power = (unit: Unit) => state.aiFactions?.includes(unit.faction as EmpireFaction) ? enemyDifficultyMultiplier(state.config.difficulty) : 1;
  const focus = (unit: Unit) => unit.faction === 'player' ? battle.focusTargetId : unit.faction === 'enemy' ? battle.enemyFocusTargetId : battle.focusTargetIds?.[unit.faction as EmpireFaction];
  battle.attackers.forEach(unit => advanceOrFire(unit, battle.attackers, battle.defenders, seconds, hits, focus(unit), power(unit)));
  battle.defenders.forEach(unit => advanceOrFire(unit, battle.defenders, battle.attackers, seconds, hits, focus(unit), power(unit)));
  protectGroundFormation(hits, battle.attackers);
  protectGroundFormation(hits, battle.defenders);
  const p = getPlanet(state, battle.planetId)!;
  recordOrbitalBombardment(p, battle, seconds, hits);
  separateGroundUnits([...battle.attackers, ...battle.defenders]);
  const applyHit = (unit: Unit) => {
    const hit = hits.get(unit.id);
    if (!hit) return unit;
    if (!hit.retaliationTargetId) return { ...damageUnit(unit, hit.damage), ...(hit.corrosionSeconds ? { corrodedFor: hit.corrosionSeconds } : {}) };
    const retaliating = { ...unit, battleRetaliationTargetId: hit.retaliationTargetId };
    delete retaliating.battleTargetX;
    delete retaliating.battleTargetY;
    return { ...damageUnit(retaliating, hit.damage), ...(hit.corrosionSeconds ? { corrodedFor: hit.corrosionSeconds } : {}) };
  };
  battle.attackers = battle.attackers.map(applyHit).filter(unit => unit.hp > 0);
  battle.defenders = battle.defenders.map(applyHit).filter(unit => unit.hp > 0);
  const survivors = new Set([...battle.attackers, ...battle.defenders].map(unit => unit.id));
  const destroyed = combatantsBefore.filter(unit => !survivors.has(unit.id));
  const survivingCombatants = [...battle.attackers, ...battle.defenders];
  harvestBattlefieldBiomass(state, destroyed, participants, `on ${p.name}`);
  harvestBattlefieldSalvage(state, destroyed, participants, survivingCombatants, `on ${p.name}`);
  if (!battle.defenders.length && battle.attackers.length) {
    const attackingUnitFaction = battle.attackers[0].faction;
    const winner = battle.attackerFaction ?? (attackingUnitFaction === 'neutral' ? 'player' : attackingUnitFaction);
    resolveGroundDefenseBuildings(p, battle, []);
    p.owner = winner; p.groundUnits = fieldArmy(battle.attackers);
    state.battles = state.battles.filter(b => b.planetId !== battle.planetId);
    addMessage(state, winner === 'player' ? `${p.name} secured. Ground forces fully restored.` : `${p.name} has fallen to enemy ground forces.`);
  } else if (!battle.attackers.length) {
    const winner = battle.defenders[0]?.faction ?? 'enemy';
    resolveGroundDefenseBuildings(p, battle, battle.defenders);
    p.owner = winner === 'neutral' ? null : winner;
    p.groundUnits = fieldArmy(battle.defenders);
    state.battles = state.battles.filter(b => b.planetId !== battle.planetId);
    addMessage(state, winner === 'player' ? `Enemy invasion of ${p.name} repelled.` : winner === 'neutral' ? `Landing on ${p.name} repelled by neutral defenders.` : `Invasion of ${p.name} repelled.`);
  }
}

export interface OrbitalCombatShot {
  attackerId: string;
  attackerType: 'ship' | 'defense' | 'battery';
  targetId: string;
  targetType: 'ship' | 'defense';
  faction: EmpireFaction;
  damage: number;
  weaponEffect: WeaponEffect;
  damageMultiplier?: number;
  piercingFraction?: number;
}

const orbitDistance = (fromX: number, fromY: number, toX: number, toY: number) => Math.hypot(toX - fromX, toY - fromY);

export function orbitalCombatShots(p: Planet): OrbitalCombatShot[] {
  const shots: OrbitalCombatShot[] = [];
  const defenses = p.buildings.filter(building => building.kind === 'spaceDefense');
  const batteries = p.buildings.filter(building => building.kind === 'antiSpaceDefense');
  const combatants = p.orbitUnits.filter(unit => unit.faction !== 'neutral');
  const factions = new Set(combatants.map(unit => unit.faction));
  const hasHostileInstallations = !!p.owner && combatants.some(unit => unit.faction !== p.owner) && (defenses.length > 0 || batteries.length > 0);
  if (factions.size < 2 && !hasHostileInstallations) return shots;
  const hostileShipsByFaction = new Map<UnitFaction, Unit[]>();
  for (const faction of factions) hostileShipsByFaction.set(faction, combatants.filter(unit => unit.faction !== faction));
  const defensePosition = (defense: Building) => orbitalDefenseOffset(defenses.findIndex(item => item.id === defense.id), defenses.length);
  const shipPosition = (ship: Unit) => ({ x: ship.orbitX ?? 0, y: ship.orbitY ?? 0 });
  const shipInRange = (attacker: Unit, target: Unit) => {
    const from = shipPosition(attacker), to = shipPosition(target);
    return orbitDistance(from.x, from.y, to.x, to.y) <= unitRange(attacker);
  };

  for (const attacker of combatants) {
    const faction = attacker.faction as EmpireFaction;
    const hostileShips = hostileShipsByFaction.get(faction) ?? [];
    const vulnerableTarget = hostileShips.find(target => (target.pendingLanding || target.pendingEmbark) && shipInRange(attacker, target));
    const hostileDefenses = p.owner && p.owner !== faction ? defenses : [];
    const focusId = faction === 'player' ? p.orbitFocusTargetId : faction === 'enemy' ? p.enemyOrbitFocusTargetId : p.orbitFocusTargetIds?.[faction];
    const preferredDefense = hostileDefenses.find(defense => defense.id === focusId);
    const attackerPosition = shipPosition(attacker);
    const defenseInRange = (defense: Building) => {
      const target = defensePosition(defense);
      return orbitDistance(attackerPosition.x, attackerPosition.y, target.x, target.y) <= unitRange(attacker);
    };
    const defenseTarget = preferredDefense && defenseInRange(preferredDefense)
      ? preferredDefense
      : hostileDefenses.find(defenseInRange);
    const initialShipTarget = vulnerableTarget ?? (defenseTarget ? undefined : hostileShips.find(target => shipInRange(attacker, target)));
    const ward = initialShipTarget && hostileShips.find(target => target.id !== initialShipTarget.id
      && target.faction === initialShipTarget.faction
      && UNITS[target.kind].ability?.kind === 'wardInterception'
      && orbitDistance(target.orbitX ?? 0, target.orbitY ?? 0, initialShipTarget.orbitX ?? 0, initialShipTarget.orbitY ?? 0) <= AEGIS_WARD_INTERCEPTION_RANGE
      && shipInRange(attacker, target));
    const shipTarget = ward ?? initialShipTarget;
    const weapon = UNITS[attacker.kind].weapon;
    const ability = UNITS[attacker.kind].ability?.kind;
    const fighterWing = UNITS[attacker.kind].fighterWing;
    const fighterScale = fighterWing ? carrierFighterCount(attacker) / fighterWing.capacity : 1;
    if (fighterWing && fighterScale <= 0) continue;
    const salvoDamage = unitWeaponDamage(attacker) * weapon.projectiles * fighterScale;
    if (shipTarget) {
      const transportMultiplier = ability === 'transportHunter' && (shipTarget.cargo?.length ?? 0) > 0 ? 1.5 : 1;
      const targetPosition = shipPosition(shipTarget);
      const distance = orbitDistance(attackerPosition.x, attackerPosition.y, targetPosition.x, targetPosition.y);
      const rangeMultiplier = ability === 'rangeCalibration' ? 1 + .7 * Math.min(1, distance / unitRange(attacker)) : 1;
      const focusMultiplier = ability === 'focusFire' && shipTarget.hp < shipTarget.maxHp ? 1.5 : 1;
      shots.push({ attackerId: attacker.id, attackerType: 'ship', targetId: shipTarget.id, targetType: 'ship', faction, damage: salvoDamage, weaponEffect: weapon.effect, damageMultiplier: transportMultiplier * rangeMultiplier * focusMultiplier, piercingFraction: ability === 'shieldPiercing' ? .5 : 0 });
      if (ability === 'spawnCloud' || ability === 'fabricatorSwarm') {
        const secondary = hostileShips.find(target => target.id !== shipTarget.id && shipInRange(attacker, target));
        if (secondary) shots.push({ attackerId: attacker.id, attackerType: 'ship', targetId: secondary.id, targetType: 'ship', faction, damage: salvoDamage, weaponEffect: weapon.effect, damageMultiplier: .5 });
      }
      if (ability === 'triCoreBarrage') {
        hostileShips.filter(target => target.id !== shipTarget.id && shipInRange(attacker, target)).slice(0, 2)
          .forEach(target => shots.push({ attackerId: attacker.id, attackerType: 'ship', targetId: target.id, targetType: 'ship', faction, damage: salvoDamage, weaponEffect: weapon.effect, damageMultiplier: .5 }));
      }
      if (ability === 'sovereignBarrage') {
        hostileShips.filter(target => target.id !== shipTarget.id && target.faction === shipTarget.faction && shipInRange(attacker, target)
          && orbitDistance(target.orbitX ?? 0, target.orbitY ?? 0, targetPosition.x, targetPosition.y) <= 140)
          .forEach(target => shots.push({ attackerId: attacker.id, attackerType: 'ship', targetId: target.id, targetType: 'ship', faction, damage: salvoDamage, weaponEffect: weapon.effect, damageMultiplier: .35 }));
      }
    } else if (defenseTarget) {
      shots.push({ attackerId: attacker.id, attackerType: 'ship', targetId: defenseTarget.id, targetType: 'defense', faction, damage: salvoDamage, weaponEffect: weapon.effect, damageMultiplier: ability === 'planetCracker' || ability === 'dismantlerBeam' ? 2 : 1 });
    }
  }

  if (!p.owner) return shots;
  const hostileShips = p.orbitUnits.filter(unit => unit.faction !== 'neutral' && unit.faction !== p.owner);
  defenses.forEach((defense, index) => {
    const from = orbitalDefenseOffset(index, defenses.length);
    const inRange = (target: Unit) => {
      const to = shipPosition(target);
      return orbitDistance(from.x, from.y, to.x, to.y) <= ORBITAL_DEFENSE_RANGE;
    };
    const target = hostileShips.find(unit => (unit.pendingLanding || unit.pendingEmbark) && inRange(unit)) ?? hostileShips.find(inRange);
    if (target) shots.push({ attackerId: defense.id, attackerType: 'defense', targetId: target.id, targetType: 'ship', faction: p.owner!, damage: ORBITAL_DEFENSE_STATS.damage, weaponEffect: 'pulse' });
  });
  batteries.forEach(battery => {
    const inRange = (target: Unit) => {
      const to = shipPosition(target);
      return orbitDistance(0, 0, to.x, to.y) <= ANTI_SPACE_BATTERY_RANGE;
    };
    const target = hostileShips.find(unit => (unit.pendingLanding || unit.pendingEmbark) && inRange(unit)) ?? hostileShips.find(inRange);
    if (target) shots.push({ attackerId: battery.id, attackerType: 'battery', targetId: target.id, targetType: 'ship', faction: p.owner!, damage: 12, weaponEffect: 'plasma' });
  });
  return shots;
}

function tickOrbitCombat(state: GameState, p: Planet, seconds: number) {
  const defenses = p.buildings.filter(b => b.kind === 'spaceDefense');
  defenses.forEach(ensureOrbitalDefenseHealth);
  const shots = orbitalCombatShots(p);
  if (!shots.length) {
    p.orbitUnits.forEach(unit => tickUnitWeapon(unit, seconds, false));
    return;
  }
  const combatantsBefore = [...p.orbitUnits];
  const participants = battlefieldFactions(combatantsBefore);
  const vulnerableShipsBeforeCombat = new Map(p.orbitUnits.filter(unit => unit.pendingLanding || unit.pendingEmbark).map(unit => [unit.id, unit]));
  const installationScale = seconds * 0.18 * SPACE_COMBAT_DAMAGE_MULTIPLIER;
  const enemyPower = enemyDifficultyMultiplier(state.config.difficulty);
  const shipDamage = new Map<string, { damage: number; piercingDamage: number }>();
  const defenseDamage = new Map<string, number>();
  const shipShots = new Map<string, OrbitalCombatShot[]>();
  shots.filter(shot => shot.attackerType === 'ship').forEach(shot => shipShots.set(shot.attackerId, [...(shipShots.get(shot.attackerId) ?? []), shot]));
  const devourHealing = new Map<string, number>();
  p.orbitUnits.forEach(unit => {
    const attackerShots = shipShots.get(unit.id) ?? [];
    const fighterWing = UNITS[unit.kind].fighterWing;
    const fighterScale = fighterWing ? carrierFighterCount(unit) / fighterWing.capacity : 1;
    const salvoDamage = tickUnitWeapon(unit, seconds, attackerShots.length > 0);
    if (fighterWing && attackerShots.length) applyCarrierFighterAttrition(unit, seconds);
    if (!attackerShots.length || !salvoDamage) return;
    const hasSynapse = p.orbitUnits.some(ally => ally.faction === unit.faction && UNITS[ally.kind].ability?.kind === 'orbitalSynapse'
      && orbitDistance(unit.orbitX ?? 0, unit.orbitY ?? 0, ally.orbitX ?? 0, ally.orbitY ?? 0) <= 240);
    const factionScale = (state.aiFactions?.includes(unit.faction as EmpireFaction) ? enemyPower : 1) * (hasSynapse ? 1.25 : 1)
      * orbitalDamageMultiplier(empireEconomy(state, unit.faction as EmpireFaction).completedResearch);
    attackerShots.forEach(shot => {
      const damage = salvoDamage * fighterScale * SPACE_COMBAT_DAMAGE_MULTIPLIER * factionScale * (shot.damageMultiplier ?? 1);
      if (shot.targetType === 'ship') {
        const current = shipDamage.get(shot.targetId) ?? { damage: 0, piercingDamage: 0 };
        current.damage += damage;
        current.piercingDamage += damage * (shot.piercingFraction ?? 0);
        shipDamage.set(shot.targetId, current);
      } else {
        defenseDamage.set(shot.targetId, (defenseDamage.get(shot.targetId) ?? 0) + damage);
      }
      const ability = UNITS[unit.kind].ability?.kind;
      const healingScale = ability === 'devour' ? .2 : ability === 'planetCracker' && shot.targetType === 'defense' ? .1 : 0;
      if (healingScale) devourHealing.set(unit.id, (devourHealing.get(unit.id) ?? 0) + damage * healingScale);
    });
  });
  shots.filter(shot => shot.attackerType !== 'ship').forEach(shot => {
    const damage = shot.damage * installationScale * (state.aiFactions?.includes(shot.faction) ? enemyPower : 1)
      * orbitalDamageMultiplier(empireEconomy(state, shot.faction).completedResearch);
    const current = shipDamage.get(shot.targetId) ?? { damage: 0, piercingDamage: 0 };
    current.damage += damage;
    shipDamage.set(shot.targetId, current);
  });
  p.orbitUnits = p.orbitUnits.map(unit => {
    const incoming = shipDamage.get(unit.id);
    const projected = p.orbitUnits.some(ally => ally.id !== unit.id && ally.faction === unit.faction
      && UNITS[ally.kind].ability?.kind === 'shieldProjection'
      && orbitDistance(unit.orbitX ?? 0, unit.orbitY ?? 0, ally.orbitX ?? 0, ally.orbitY ?? 0) <= AEGIS_SHIELD_PROJECTION_RANGE);
    const repaired = p.orbitUnits.some(ally => ally.id !== unit.id && ally.faction === unit.faction
      && UNITS[ally.kind].ability?.kind === 'repairDrones'
      && orbitDistance(unit.orbitX ?? 0, unit.orbitY ?? 0, ally.orbitX ?? 0, ally.orbitY ?? 0) <= AEGIS_REPAIR_DRONE_RANGE);
    const assemblyRepair = p.orbitUnits.some(ally => ally.id !== unit.id && ally.faction === unit.faction
      && UNITS[ally.kind].ability?.kind === 'assemblyLine'
      && orbitDistance(unit.orbitX ?? 0, unit.orbitY ?? 0, ally.orbitX ?? 0, ally.orbitY ?? 0) <= COVENANT_ASSEMBLY_REPAIR_RANGE);
    const foundryRepair = p.orbitUnits.some(ally => ally.id !== unit.id && ally.faction === unit.faction
      && UNITS[ally.kind].ability?.kind === 'foundryAura'
      && orbitDistance(unit.orbitX ?? 0, unit.orbitY ?? 0, ally.orbitX ?? 0, ally.orbitY ?? 0) <= COVENANT_FOUNDRY_REPAIR_RANGE);
    const regenerated = projected ? { ...unit, shields: Math.min(unit.maxShields, unit.shields + seconds * 10) } : unit;
    const approachScale = UNITS[unit.kind].ability?.kind === 'armoredApproach' && (unit.pendingLanding || unit.pendingEmbark) ? .55 : 1;
    const protectionScale = (projected ? .7 : 1) * approachScale;
    const damaged = incoming ? damageUnitPiercing(regenerated, incoming.damage * protectionScale, incoming.damage > 0 ? incoming.piercingDamage / incoming.damage : 0) : regenerated;
    const healing = (devourHealing.get(unit.id) ?? 0) + (repaired ? seconds * 6 : 0) + (assemblyRepair ? seconds * 4 : 0) + (foundryRepair ? seconds * 7 : 0);
    return healing && damaged.hp > 0 ? { ...damaged, hp: Math.min(damaged.maxHp, damaged.hp + healing) } : damaged;
  });
  const defenseProtection = p.owner ? 1 / defenseDurabilityMultiplier(empireEconomy(state, p.owner).completedResearch) : 1;
  p.buildings = p.buildings.map(building => defenseDamage.has(building.id) ? damageBuilding(building, defenseDamage.get(building.id)! * defenseProtection) : building);

  const destroyedDefenses = p.buildings.filter(building => building.kind === 'spaceDefense' && building.hp! <= 0);
  if (destroyedDefenses.length) {
    const destroyedIds = new Set(destroyedDefenses.map(building => building.id));
    p.buildings = p.buildings.filter(building => !destroyedIds.has(building.id));
    if (p.orbitFocusTargetId && destroyedIds.has(p.orbitFocusTargetId)) delete p.orbitFocusTargetId;
    addMessage(state, `${destroyedDefenses.length} orbital defense platform${destroyedDefenses.length === 1 ? '' : 's'} destroyed at ${p.name}.`);
  }
  p.orbitUnits = p.orbitUnits.filter(unit => unit.hp > 0);
  const survivingShipIds = new Set(p.orbitUnits.map(unit => unit.id));
  const destroyedShips = combatantsBefore.filter(unit => !survivingShipIds.has(unit.id));
  harvestBattlefieldBiomass(state, destroyedShips, participants, `in orbit of ${p.name}`);
  harvestBattlefieldSalvage(state, destroyedShips, participants, p.orbitUnits, `in orbit of ${p.name}`);
  for (const [id, ship] of vulnerableShipsBeforeCombat) {
    if (!p.orbitUnits.some(unit => unit.id === id)) addMessage(state, ship.pendingEmbark
      ? `${ship.faction === 'enemy' ? 'HOSTILE' : 'Friendly'} ${UNITS[ship.kind].label} destroyed while attempting to embark forces at ${p.name}; waiting ground squads survived, but any existing cargo was lost.`
      : `${ship.faction === 'enemy' ? 'HOSTILE' : 'Friendly'} ${UNITS[ship.kind].label} destroyed during landing approach at ${p.name}; all embarked forces lost.`);
  }
}

function tickOrbitUnitMovement(ship: Unit, seconds: number) {
  if (typeof ship.orbitTargetX !== 'number' || typeof ship.orbitTargetY !== 'number') return;
  const currentX = ship.orbitX ?? 0, currentY = ship.orbitY ?? 0;
  const dx = ship.orbitTargetX - currentX, dy = ship.orbitTargetY - currentY;
  ship.heading = headingForVector(dx, dy, ship.heading);
  const distance = Math.hypot(dx, dy), step = (ship.pendingLanding || ship.pendingEmbark ? LANDING_APPROACH_SPEED : ORBIT_MANEUVER_SPEED) * seconds;
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

function resolveEmbarkApproaches(state: GameState, p: Planet) {
  for (const ship of p.orbitUnits.filter(unit => unit.pendingEmbark && typeof unit.orbitTargetX !== 'number' && typeof unit.orbitTargetY !== 'number')) {
    delete ship.pendingEmbark;
    const boarded = ship.faction === 'neutral' ? 0 : embarkAvailableSquads(state, p, ship, ship.faction);
    ship.orbitX = 0;
    ship.orbitY = 0;
    ship.docked = true;
    if (!boarded) addMessage(state, `${UNITS[ship.kind].label} reached ${p.name}, but no squads were available to embark.`);
  }
}

function tickQueue(state: GameState, p: Planet, queue: QueueItem[], seconds: number, productionMultiplier: number, faction: EmpireFaction, source?: string) {
  if (!queue.length) return;
  queue[0].remaining -= seconds * productionMultiplier;
  if (queue[0].remaining <= 0) {
    const done = queue.shift()!; const created = unit(`u${state.nextId++}`, done.kind, faction);
    if (state.aiFactions?.includes(faction) && state.mode !== 'competitive') {
      const power = enemyDifficultyMultiplier(state.config.difficulty);
      created.maxHp = Math.round(created.maxHp * power); created.hp = created.maxHp;
      created.maxShields = Math.round(created.maxShields * power); created.shields = created.maxShields;
    }
    if (UNITS[done.kind].factory === 'space') placeInOpenOrbit(p, created);
    (UNITS[done.kind].factory === 'ground' ? p.groundUnits : p.orbitUnits).push(created);
    if (faction === 'player') addMessage(state, `${UNITS[done.kind].label} completed${source ? ` at ${source}` : ''} on ${p.name}.`);
  }
}

function tickAiFaction(state: GameState, faction: EmpireFaction, seconds: number) {
  const canonicalEnemyClocks = { actionClock: state.enemyActionClock, attackClock: state.enemyAttackClock, missionCount: state.enemyMissionCount };
  if (faction !== 'enemy') {
    const aiEconomy = empireEconomy(state, faction);
    state.enemyActionClock = aiEconomy.actionClock;
    state.enemyAttackClock = aiEconomy.attackClock;
    state.enemyMissionCount = aiEconomy.missionCount;
  }
  let view = faction === 'enemy' ? state : viewStateForFaction(viewStateForFaction(state, faction), 'enemy');
  const actionInterval = view.config.difficulty === 'cadet' ? 12 : view.config.difficulty === 'admiral' ? 6 : 8;
  const attackInterval = view.config.difficulty === 'cadet' ? 170 : view.config.difficulty === 'admiral' ? 85 : 120;
  view.enemyActionClock -= seconds;
  for (let actions = 0; view.enemyActionClock <= 0 && actions < 32; actions += 1) {
    runEnemyStrategicAction(view);
    view.enemyActionClock += actionInterval;
  }
  view.enemyAttackClock -= seconds;
  if (view.enemyAttackClock <= 0) {
    launchEnemyMission(view);
    launchEnemyCombatFleets(view);
    view.enemyAttackClock += attackInterval;
  }
  if (faction !== 'enemy') {
    const restored = viewStateForFaction(viewStateForFaction(view, 'enemy'), faction);
    const aiEconomy = empireEconomy(restored, faction);
    aiEconomy.actionClock = restored.enemyActionClock;
    aiEconomy.attackClock = restored.enemyAttackClock;
    aiEconomy.missionCount = restored.enemyMissionCount;
    restored.enemyActionClock = canonicalEnemyClocks.actionClock;
    restored.enemyAttackClock = canonicalEnemyClocks.attackClock;
    restored.enemyMissionCount = canonicalEnemyClocks.missionCount;
    Object.assign(state, restored);
  }
}

const enemyHasResearch = (state: GameState, id?: ResearchId) => !id || state.enemyCompletedResearch.includes(id);
const canEnemyAfford = (state: GameState, cost: ResourcePool) => usesBiomass(state, 'enemy')
  ? (state.enemyResources.biomass ?? 0) >= biomassCost(cost)
  : canAfford(state.enemyResources, cost);
const spendEnemyResources = (state: GameState, cost: ResourcePool) => {
  if (usesBiomass(state, 'enemy')) state.enemyResources.biomass = (state.enemyResources.biomass ?? 0) - biomassCost(cost);
  else spend(state.enemyResources, cost);
};

function enemyBuild(state: GameState, p: Planet, kind: BuildingKind, targetCount?: number) {
  const def = BUILDINGS[kind];
  const unlimited = hasUnlimitedBuildingCapacity(kind);
  const desiredCount = targetCount ?? (unlimited ? Number.POSITIVE_INFINITY : p.buildingLimits[kind]);
  const maximum = unlimited ? desiredCount : Math.min(desiredCount, p.buildingLimits[kind]);
  if (usesBiomass(state, 'enemy') && ['metalMine', 'crystalMine', 'goldMine'].includes(kind)) return false;
  if (p.buildings.filter(building => building.kind === kind).length >= maximum
    || !enemyHasResearch(state, def.requires) || !canEnemyAfford(state, def.cost)) return false;
  spendEnemyResources(state, def.cost);
  const building: Building = { id: `eb${state.nextId++}`, kind };
  if (isSpaceYard(building)) building.spaceQueue = [];
  ensureOrbitalDefenseHealth(building);
  p.buildings.push(building);
  return true;
}

function enemyQueueUnit(state: GameState, p: Planet, kind: UnitKind, yard?: Building) {
  const def = UNITS[kind];
  if (isTitanKind(kind) && factionHasTitan(state, 'enemy')) return false;
  if (!unitAvailableToCivilization(kind, empireCivilization(state, 'enemy')) || !enemyHasResearch(state, def.requires) || !canEnemyAfford(state, def.cost)) return false;
  if (def.factory === 'ground') {
    if (!p.buildings.some(building => building.kind === 'groundFactory' || building.kind === 'advancedGroundFactory')) return false;
    if (def.advancedFactory && !p.buildings.some(building => building.kind === 'advancedGroundFactory')) return false;
    spendEnemyResources(state, def.cost);
    p.groundQueue.push({ id: `eq${state.nextId++}`, kind, remaining: def.time!, total: def.time! });
    return true;
  }
  if (!yard || !isSpaceYard(yard) || (def.advancedFactory && yard.kind !== 'advancedSpaceFactory')) return false;
  spendEnemyResources(state, def.cost);
  yard.spaceQueue ??= [];
  yard.spaceQueue.push({ id: `eq${state.nextId++}`, kind, remaining: def.time!, total: def.time! });
  return true;
}

function advanceEnemyResearch(state: GameState) {
  if (!state.planets.some(p => p.owner === 'enemy' && p.buildings.some(building => building.kind === 'researchLab'))) return;
  const milestones: Array<[number, ResearchId]> = [
    [80, 'advancedIndustry'], [105, 'rapidFabrication'], [130, 'groundWarfare'], [145, 'fleetLogistics'], [160, 'orbitalEngineering'],
    [180, 'quantumExtraction'], [190, 'planetaryFortifications'], [205, 'phaseMastery'], [215, 'shieldHarmonics'],
    [220, 'heavyArmor'], [245, 'carrierOperations'], [250, 'deepCoreExtraction'], [270, 'capitalShips'],
    [315, 'weaponsCalibration'], [360, 'titanEngineering'],
  ];
  const next = milestones.find(([time, id]) => state.elapsed >= time && !state.enemyCompletedResearch.includes(id));
  if (!next) return;
  const [, id] = next; const def = RESEARCH[id];
  if (!enemyHasResearch(state, def.requires) || !canEnemyAfford(state, def.cost)) return;
  spendEnemyResources(state, def.cost);
  state.enemyCompletedResearch.push(id);
}

function runEnemyStrategicAction(state: GameState) {
  advanceEnemyResearch(state);
  const civilization = empireCivilization(state, 'enemy');
  const groundKind = (kind: GroundUnitKind) => civilizationUnitKind(civilization, kind) as GroundUnitKind;
  const spaceKind = (kind: SpaceUnitKind) => civilizationUnitKind(civilization, kind) as SpaceUnitKind;
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
        ? groundKind(state.nextId % 3 === 0 ? 'railgunTank' : state.nextId % 2 ? 'plasmaTank' : 'siegeWalker')
        : groundKind('shockTrooper');
      const basicKind: GroundUnitKind = groundKind(state.nextId % 3 === 0 ? 'artillery' : state.nextId % 2 ? 'lightTank' : 'infantry');
      if (!enemyQueueUnit(state, p, advancedKind)) enemyQueueUnit(state, p, basicKind);
    }

    const factionShips = [...p.orbitUnits, ...state.fleets.filter(fleet => fleet.faction === 'enemy').map(fleet => fleet.unit)];
    for (const yard of spaceYards(p)) {
      if (yard.spaceQueue?.length) continue;
      const queuedKinds = spaceYards(p).flatMap(other => other.spaceQueue ?? []).map(item => item.kind);
      const hasCarrier = [...factionShips.map(ship => ship.kind), ...queuedKinds].some(kind => (UNITS[kind].capacity ?? 0) > 0);
      let desired: SpaceUnitKind = !hasCarrier ? spaceKind('transport') : spaceKind(state.nextId % 2 ? 'missileFrigate' : 'escortFrigate');
      if (yard.kind === 'advancedSpaceFactory' && state.enemyCompletedResearch.includes('carrierOperations') && !hasCarrier) desired = spaceKind('assaultCarrier');
      else if (yard.kind === 'advancedSpaceFactory' && state.enemyCompletedResearch.includes('titanEngineering') && hasCarrier) desired = spaceKind('dreadnought');
      else if (yard.kind === 'advancedSpaceFactory' && state.enemyCompletedResearch.includes('capitalShips') && hasCarrier) desired = spaceKind('battlecruiser');
      else if (yard.kind === 'advancedSpaceFactory' && state.enemyCompletedResearch.includes('orbitalEngineering')) desired = spaceKind('destroyer');
      enemyQueueUnit(state, p, desired, yard);
    }
  }
}

function launchEnemyMission(state: GameState) {
  const hostilePlanets = state.planets.filter(p => p.owner !== null && p.owner !== 'enemy');
  const reservedTargets = new Set(state.fleets.filter(fleet => fleet.faction === 'enemy').map(fleet => fleet.finalDestinationId ?? fleet.destinationId));
  const neutralPlanets = state.planets.filter(p => p.owner === null && !reservedTargets.has(p.id) && !state.battles.some(battle => battle.planetId === p.id));
  if (!hostilePlanets.length && !neutralPlanets.length) return;
  const preferExpansion = neutralPlanets.length > 0 && (state.enemyMissionCount % 3 !== 2 || !hostilePlanets.length);
  const preferredTargets = preferExpansion ? neutralPlanets : hostilePlanets;
  const fallbackTargets = preferExpansion ? hostilePlanets : neutralPlanets;
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

function launchEnemyCombatFleets(state: GameState) {
  for (const operation of planEnemyFleetOperations(state)) {
    const origin = getPlanet(state, operation.originId), target = getPlanet(state, operation.targetId);
    const ships = origin?.orbitUnits.filter(ship => operation.shipIds.includes(ship.id) && ship.faction === 'enemy') ?? [];
    if (!origin || !target || ships.length !== operation.shipIds.length || !dispatchFactionUnits(state, origin, ships, target, 'enemy')) continue;
    addMessage(state, operation.kind === 'reinforce'
      ? `HOSTILE REINFORCEMENTS — ${ships.length} warships redeploying to ${target.name}.`
      : `HOSTILE STRIKE FLEET — ${ships.length} warships advancing on ${target.name}.`);
  }
}

export function tick(input: GameState, seconds: number): GameState {
  const state = migrateGameState(input); state.elapsed += seconds;
  state.fleets = state.fleets.map(fleet => ({ ...fleet, unit: recoverCarrierFighters(recoverSpaceUnit(fleet.unit, false, seconds, empireCivilization(state, fleet.faction), shieldRecoveryMultiplier(empireEconomy(state, fleet.faction).completedResearch)), seconds) }));
  for (const p of state.planets) {
    ensureOrbitPositions(p);
    if (p.owner) {
      const economy = empireEconomy(state, p.owner);
      const aiScale = state.aiFactions?.includes(p.owner) && state.mode !== 'competitive' ? enemyDifficultyMultiplier(state.config.difficulty) * .62 : .7;
      const incomeScale = aiScale * researchIncomeMultiplier(economy.completedResearch);
      if (usesBiomass(state, p.owner)) {
        economy.resources.biomass = (economy.resources.biomass ?? 0) + seconds * BROOD_BIOMASS_PER_PLANET * researchIncomeMultiplier(economy.completedResearch);
      } else {
        for (const resource of ['metal', 'crystal', 'gold'] as Resource[]) {
          const kind = `${resource}Mine` as BuildingKind;
          const mineCount = p.buildings.filter(b => b.kind === kind).length;
          economy.resources[resource] += seconds * mineCount * p.resourceYield[resource] * RESOURCE_COLLECTION_MULTIPLIER * incomeScale;
        }
      }
      tickQueue(state, p, p.groundQueue, seconds, groundProductionMultiplier(p, economy.completedResearch), p.owner);
      spaceYards(p).forEach((yard, index) => tickQueue(state, p, yard.spaceQueue!, seconds, spaceProductionMultiplier(economy.completedResearch), p.owner!, p.owner === 'player' ? `Space Yard ${index + 1}` : undefined));
    }
    tickOrbitMovement(p, seconds);
    p.orbitUnits = p.orbitUnits.map(u => recoverCarrierFighters(recoverSpaceUnit(u, p.owner === u.faction, seconds, u.faction === 'neutral' ? 'human' : empireCivilization(state, u.faction), u.faction === 'neutral' ? 1 : shieldRecoveryMultiplier(empireEconomy(state, u.faction).completedResearch)), seconds));
    p.buildings = p.buildings.map(building => recoverOrbitalDefense(building, seconds));
    tickOrbitCombat(state, p, seconds);
  }

  if (state.researchQueue.length) {
    state.researchQueue[0].remaining -= seconds;
    if (state.researchQueue[0].remaining <= 0) {
      const done = state.researchQueue.shift()!; state.completedResearch.push(done.id);
      addMessage(state, `${RESEARCH[done.id].label} research complete.`);
    }
  }

  for (const faction of EMPIRE_FACTIONS.filter(faction => faction !== 'player')) {
    const economy = empireEconomy(state, faction);
    if (economy.researchQueue.length) {
      economy.researchQueue[0].remaining -= seconds;
      if (economy.researchQueue[0].remaining <= 0) economy.completedResearch.push(economy.researchQueue.shift()!.id);
    }
  }

  (state.mode === 'competitive' ? state.aiFactions ?? [] : ['enemy'] as EmpireFaction[]).forEach(faction => tickAiFaction(state, faction, seconds));

  for (const battle of [...state.battles]) tickBattle(state, battle, seconds);
  for (const p of state.planets) { resolveEmbarkApproaches(state, p); resolveLandingApproaches(state, p); }
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
          fleet.travelTime = phaseTravelTime(origin, waypoint) * phaseTravelMultiplier(empireEconomy(state, fleet.faction).completedResearch);
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
