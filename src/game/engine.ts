import {
  DEFAULT_GAME_CONFIG,
  type Building,
  type BuildingKind,
  type DefenseBuildingKind,
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
  PRODUCTION_QUANTITIES,
  type ProductionQuantity,
  type QueueItem,
  type ResearchId,
  type Resource,
  type ResourcePool,
  type SpaceShipTier,
  type SpaceUnitKind,
  type SpaceYardKind,
  type SystemKind,
  type TitanUpgradeId,
  type Unit,
  type UnitDefinition,
  type UnitFaction,
  type UnitKind,
  type WeaponEffect,
} from './types';
import { findPlanetPath, headingForVector, shortestHeadingDelta, turnHeadingToward } from './navigation';
import { viewStateForFaction } from './perspective';
import { seedKnownEmpireHomeworldIntel, updatePlanetIntel } from './visibility';
import { enemyDefensiveReserve, enemyOrbitalBeachheads, planEnemyFleetOperations } from './ai/fleetOperations';
import {
  GROUND_FORMATION_X_SPACING, GROUND_FORMATION_Y_SPACING, clampGroundPosition,
  nearestOpenGroundPosition, separateGroundUnits,
} from './ground/collision';
import {
  GROUND_FOREST_DAMAGE_MULTIPLIER, groundForestAtPosition, groundTerrainMovementStep,
} from './ground/terrain';
import {
  BROOD_BIOMASS_PER_PLANET, PLAYABLE_FACTIONS, biomassCost, empireCivilization,
  COVENANT_SALVAGE_ARRAY_MULTIPLIER, recoverableBiomass, recoverableMetalScrap, startingResources, usesBiomass, usesSalvage,
} from './factions';
import {
  ADVANCED_GROUND_FACTORY_CAPACITY, ANTI_FIGHTER_DAMAGE_MULTIPLIER, ANTI_SPACE_BATTERY_RANGE, ANTI_SPACE_BATTERY_STATS, BUILDINGS, BUILDING_KINDS, DEFENSE_REBUILD_COOLDOWN_SECONDS, FIGHTER_HIT_POINTS, GRAVITY_WELL_RADIUS, GROUND_KINDS, LANDING_APPROACH_SPEED, MAX_SHIP_ORBIT_RADIUS, MIN_SHIP_ORBIT_SEPARATION, MIN_SYSTEM_CENTER_SEPARATION,
  ORBITAL_BOMBARDMENT_DAMAGE_PER_SHIP, ORBITAL_DEFENSE_BUILDING_CAP, ORBITAL_DEFENSE_HULL_REGEN, ORBITAL_DEFENSE_RANGE, ORBITAL_DEFENSE_SHIELD_REGEN, ORBITAL_DEFENSE_STATS, ORBIT_MANEUVER_SPEED, PHASE_GATE_CHARGE_SECONDS, RESEARCH, SHIP_TURN_RATE_DEGREES_PER_SECOND,
  RESEARCH_UNLOCKS, RESOURCE_COLLECTION_MULTIPLIER, RESOURCE_TRADE_MAX_SPEND, RESOURCE_TRADE_RATE, SPACE_COMBAT_DAMAGE_MULTIPLIER, SPACE_KINDS, SYSTEM_EXIT_SPEED, TITAN_UPGRADES, UNITS, pool,
  blocksPhaseGate, civilizationUnitKind, galaxyCanvasDimensions, groundDefenseKindForCivilization, hasUnlimitedBuildingCapacity, isBuildingOperational, isDefenseBuildingKind, isFlakFrigateKind, isPhaseControlShipKind, isRepeatableResearch, isTitanKind, orbitalDefenseOffset,
  groundUnitVisionRange, isFlyingGroundUnit,
  phaseControlRateMultiplier,
  requiredSpaceYardKind, SPACE_YARD_TIER,
  researchAvailableToCivilization, researchCost, researchDefinitionForCivilization, researchLevel,
  researchRequirementForCivilization, researchTime, researchTreeForCivilization, shipArmor, shipMovementSpeedMultiplier, shipWeaponBatteries, titanUpgradeLevel, titanWeaponDamageMultiplier, titanWeaponRangeMultiplier, unitAvailableToCivilization,
} from './definitions';

export * from './types';
export * from './navigation';
export * from './definitions';
export * from './factions';
export * from './ground/collision';
export * from './ground/terrain';

export const carrierFighterCount = (ship: Unit) => {
  const wing = UNITS[ship.kind].fighterWing;
  return wing ? Math.max(0, Math.min(wing.capacity, Math.floor(ship.fighterCount ?? wing.capacity))) : 0;
};

const unit = (id: string, kind: UnitKind, faction: UnitFaction): Unit => ({
  id, kind, faction, hp: UNITS[kind].hp, maxHp: UNITS[kind].hp,
  shields: UNITS[kind].shields, maxShields: UNITS[kind].shields,
  ...(UNITS[kind].capacity || kind === 'transport' ? { loadedUnitIds: [] } : {}),
  ...(UNITS[kind].fighterWing ? { fighterCount: UNITS[kind].fighterWing.capacity, fighterBuildProgress: 0, fighterLossProgress: 0, fighterDamage: 0 } : {}),
  ...(isTitanKind(kind) ? { titanUpgrades: [] } : {}),
});

const orbitSlot = (index: number) => {
  const innerRadius = 190, ringSpacing = 48, slotSeparation = MIN_SHIP_ORBIT_SEPARATION + 2;
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
  ship.heading ??= 0;
}

function targetOpenOrbit(planet: Planet, ship: Unit, otherShips = planet.orbitUnits) {
  delete ship.docked;
  const position = nextOpenOrbitPosition(otherShips.filter(other => other.id !== ship.id));
  ship.orbitTargetX = position.orbitX;
  ship.orbitTargetY = position.orbitY;
  ship.heading ??= 0;
}

const systemDirection = (from: Planet, to: Planet, mapSize: MapSize) => {
  const dimensions = galaxyCanvasDimensions(mapSize);
  const dx = dimensions.width * (to.x - from.x) / 100;
  const dy = dimensions.height * (to.y - from.y) / 100;
  const distance = Math.hypot(dx, dy) || 1;
  return { x: dx / distance, y: dy / distance };
};

function phaseEntryFormationPositions(origin: Planet, destination: Planet, mapSize: MapSize) {
  const inboundDirection = systemDirection(destination, origin, mapSize);
  const normalX = inboundDirection.x, normalY = inboundDirection.y;
  const tangentX = -normalY, tangentY = normalX;
  const spacing = MIN_SHIP_ORBIT_SEPARATION + 2;
  const positions: Array<{ x: number; y: number }> = [];
  const rows = Math.floor(2 * MAX_SHIP_ORBIT_RADIUS / spacing);
  for (let row = 0; row <= rows; row += 1) {
    const radial = MAX_SHIP_ORBIT_RADIUS - row * spacing;
    const tangentLimit = Math.sqrt(Math.max(0, MAX_SHIP_ORBIT_RADIUS ** 2 - radial ** 2));
    const columns = Math.floor(tangentLimit / spacing);
    const addColumn = (column: number) => {
      const tangent = column * spacing;
      positions.push({
        x: normalX * radial + tangentX * tangent,
        y: normalY * radial + tangentY * tangent,
      });
    };
    addColumn(0);
    for (let column = 1; column <= columns; column += 1) {
      addColumn(-column);
      addColumn(column);
    }
  }
  return positions;
}

function placeAtSystemEdge(origin: Planet, destination: Planet, ship: Unit, mapSize: MapSize) {
  delete ship.docked;
  const occupied = destination.orbitUnits.filter(unit => unit.id !== ship.id && Number.isFinite(unit.orbitX) && Number.isFinite(unit.orbitY))
    .map(unit => ({ orbitX: unit.orbitX!, orbitY: unit.orbitY! }));
  const open = (position: { x: number; y: number }) => occupied.every(point =>
    Math.hypot(point.orbitX - position.x, point.orbitY - position.y) >= MIN_SHIP_ORBIT_SEPARATION);
  const preferred = phaseEntryFormationPositions(origin, destination, mapSize).find(open);
  const inboundDirection = systemDirection(destination, origin, mapSize);
  const fallback = preferred ?? nearestOpenOrbitPosition(
    inboundDirection.x * MAX_SHIP_ORBIT_RADIUS,
    inboundDirection.y * MAX_SHIP_ORBIT_RADIUS,
    occupied,
  );
  ship.orbitX = fallback.x;
  ship.orbitY = fallback.y;
  const outboundDirection = systemDirection(origin, destination, mapSize);
  ship.heading ??= headingForVector(outboundDirection.x, outboundDirection.y);
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
  if (building.kind !== 'spaceDefense' && building.kind !== 'antiSpaceDefense') return;
  const stats = building.kind === 'spaceDefense' ? ORBITAL_DEFENSE_STATS : ANTI_SPACE_BATTERY_STATS;
  building.maxHp ??= stats.hp;
  building.hp ??= building.maxHp;
  building.maxShields ??= stats.shields;
  building.shields ??= building.maxShields;
}

function startDefenseRebuildCooldown(planet: Planet, kind: DefenseBuildingKind) {
  planet.defenseRebuildCooldowns ??= {};
  planet.defenseRebuildCooldowns[kind] = Math.max(planet.defenseRebuildCooldowns[kind] ?? 0, DEFENSE_REBUILD_COOLDOWN_SECONDS);
}

function advanceDefenseConstruction(state: GameState, planet: Planet, seconds: number) {
  if (planet.defenseRebuildCooldowns) {
    for (const kind of Object.keys(planet.defenseRebuildCooldowns) as DefenseBuildingKind[]) {
      const remaining = Math.max(0, (planet.defenseRebuildCooldowns[kind] ?? 0) - seconds);
      if (remaining > 0) planet.defenseRebuildCooldowns[kind] = remaining;
      else delete planet.defenseRebuildCooldowns[kind];
    }
  }
  planet.buildings.forEach(building => {
    if (!isDefenseBuildingKind(building.kind) || !building.constructionRemaining) return;
    const before = building.constructionRemaining;
    building.constructionRemaining = Math.max(0, before - seconds);
    if (building.constructionRemaining > 0) return;
    delete building.constructionRemaining;
    delete building.constructionTotal;
    ensureOrbitalDefenseHealth(building);
    if (planet.owner === 'player') addMessage(state, `${BUILDINGS[building.kind].label} construction complete on ${planet.name}.`);
  });
}

const limits = (mineMax: ResourcePool, industryMax = 3): Record<BuildingKind, number> => ({
  metalMine: mineMax.metal, crystalMine: mineMax.crystal, goldMine: mineMax.gold,
  groundFactory: industryMax, advancedGroundFactory: Math.max(1, industryMax - 1),
  spaceFactory: industryMax, advancedSpaceFactory: Math.max(1, industryMax - 1), experimentalSpaceFactory: 1,
  groundDefense: 4, antiSpaceDefense: 3, spaceDefense: ORBITAL_DEFENSE_BUILDING_CAP, researchLab: 2,
});

const planet = (id: string, name: string, x: number, y: number, color: string, owner: Faction, resourceYield: ResourcePool, mineMax: ResourcePool, industryMax = 3): Planet => ({
  id, name, systemKind: 'planet', x, y, color, owner, resourceYield, buildingLimits: limits(mineMax, industryMax),
  buildings: [], groundUnits: [], orbitUnits: [], groundQueue: [], spaceQueue: [],
});

const MAP_PLANETS: Record<MapSize, number> = { small: 7, medium: 11, large: 15, huge: 21, massive: 31, galactic: 45 };
const FRONTIER_PLANET_NAMES = [
  'Caldera', 'Praxus', 'Lumen', 'Arcadia', 'Tantalus', 'Oberon', 'Carina', 'Sable',
  'Ilyria', 'Madrigal', 'Perseus', 'Callisto', 'Erebus', 'Avalon', 'Titania', 'Argent',
  'Cerulea', 'Daedalus', 'Elysion', 'Fortuna', 'Hyperion', 'Ishtar', 'Janus', 'Kestrel',
] as const;
const FRONTIER_PLANET_COLORS = ['#69d5c1', '#f0a36f', '#98b9ff', '#d996ff', '#f2cf70', '#7bd6ef', '#d88198', '#9dd58a'] as const;
const SPECIAL_SYSTEM_NAMES: Record<Exclude<SystemKind, 'planet'>, string[]> = {
  nebula: ['The Blind Veil', 'Morrow Nebula', 'Ghostlight Cloud', 'The Violet Shroud', 'Wraithwake', 'Dusk Expanse'],
  star: ['Helios Pyre', 'The Cinder Star', 'Vulcan Furnace'],
  pirateBase: ['Blackwake', 'Corsair Hold', 'Red Jack', 'Skullhaven', 'Rogue Meridian', 'The Broken Crown'],
  ancientTemple: ['Temple of the First Dawn', 'The Silent Reliquary', 'Orison Vault', 'The Astral Sepulcher', 'Pilgrim Zero', 'The Last Archive'],
};
const SPECIAL_SYSTEM_COLORS: Record<Exclude<SystemKind, 'planet'>, string> = {
  nebula: '#7d6cff', star: '#ff884d', pirateBase: '#d8a24b', ancientTemple: '#79e4ff',
};
const RANDOM_SYSTEM_KINDS: Array<{ kind: Exclude<SystemKind, 'star'>; weight: number }> = [
  { kind: 'planet', weight: .68 },
  { kind: 'nebula', weight: .14 },
  { kind: 'pirateBase', weight: .12 },
  { kind: 'ancientTemple', weight: .06 },
];
const PIRATE_FLEET_PATTERN: SpaceUnitKind[] = [
  'escortFrigate', 'escortFrigate', 'missileFrigate', 'missileFrigate',
  'flakFrigate', 'lightCruiser', 'lightCruiser', 'destroyer',
  'destroyer', 'assaultCarrier', 'battlecruiser', 'dreadnought',
];
const PIRATE_ORBITAL_GARRISON: SpaceUnitKind[] = Array.from(
  { length: 48 },
  (_, index) => PIRATE_FLEET_PATTERN[index % PIRATE_FLEET_PATTERN.length],
);
const PIRATE_GROUND_GARRISON: GroundUnitKind[] = [
  'infantry', 'infantry', 'infantry', 'antiVehicle', 'antiVehicle', 'recon',
  'lightTank', 'lightTank', 'artillery', 'shockTrooper', 'railgunTank', 'defenseTurret',
];

export const STELLAR_HAZARD_DAMAGE_PER_SECOND = 10;
export const ANCIENT_RELIC_ECONOMY_MULTIPLIER = 1.5;
export const ANCIENT_RELIC_DAMAGE_MULTIPLIER = 1.25;

export const systemKind = (system: Planet): SystemKind => system.systemKind ?? 'planet';
export const isColonizableWorld = (system: Planet) => ['planet', 'pirateBase'].includes(systemKind(system));
export const controlsAncientRelic = (state: GameState, faction: EmpireFaction) =>
  state.planets.some(system => systemKind(system) === 'ancientTemple' && system.owner === faction);
export const visibleOrbitUnits = (system: Planet, viewer: EmpireFaction = 'player') => {
  if (systemKind(system) !== 'nebula' || system.orbitUnits.some(ship => ship.faction === viewer)) return system.orbitUnits;
  return system.orbitUnits.filter(ship => ship.faction === viewer);
};

const seededRandom = (seed: number) => {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ result >>> 15, result | 1);
    result ^= result + Math.imul(result ^ result >>> 7, result | 61);
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
};
const shuffle = <T,>(items: T[], random: () => number) => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
};
const randomizeSystemPositions = (systems: Planet[], random: () => number, mapSize: MapSize) => {
  const { width, height } = galaxyCanvasDimensions(mapSize);
  const edgePadding = GRAVITY_WELL_RADIUS;
  const branchReach = MIN_SYSTEM_CENTER_SEPARATION * 2;
  let positions: Array<{ x: number; y: number }> = [];
  for (let layoutAttempt = 0; layoutAttempt < 12 && positions.length < systems.length; layoutAttempt += 1) {
    positions = [{
      x: width / 2 + (random() - .5) * width * .12,
      y: height / 2 + (random() - .5) * height * .12,
    }];
    while (positions.length < systems.length) {
      let best: { x: number; y: number } | undefined;
      let bestSeparation = -1;
      for (let attempt = 0; attempt < 320; attempt += 1) {
        const anchor = positions[Math.floor(random() * positions.length)];
        const angle = random() * Math.PI * 2;
        const distance = MIN_SYSTEM_CENTER_SEPARATION
          + random() * (branchReach - MIN_SYSTEM_CENTER_SEPARATION);
        const candidate = {
          x: anchor.x + Math.cos(angle) * distance,
          y: anchor.y + Math.sin(angle) * distance,
        };
        const branchLaneDistance = Math.hypot(
          (candidate.x - anchor.x) / width * 100,
          (candidate.y - anchor.y) / height * 100,
        );
        if (branchLaneDistance > 30) continue;
        if (candidate.x < edgePadding || candidate.x > width - edgePadding
          || candidate.y < edgePadding || candidate.y > height - edgePadding) continue;
        const separation = Math.min(...positions.map(position =>
          Math.hypot(position.x - candidate.x, position.y - candidate.y)));
        if (separation < MIN_SYSTEM_CENTER_SEPARATION || separation <= bestSeparation) continue;
        best = candidate;
        bestSeparation = separation;
      }
      if (!best) break;
      positions.push(best);
    }
  }
  if (positions.length < systems.length) throw new Error(`Unable to scatter ${systems.length} systems on the ${mapSize} galaxy canvas`);

  shuffle(positions, random).forEach((position, index) => {
    const system = systems[index];
    system.x = position.x / width * 100;
    system.y = position.y / height * 100;
  });
};
const addFrontierPlanets = (systems: Planet[], count: number) => {
  const candidates = Array.from({ length: 7 }, (_, column) => 8 + column * 14)
    .flatMap(x => Array.from({ length: 7 }, (_, row) => ({ x, y: 8 + row * 14 })));
  for (let index = 0; index < count; index += 1) {
    const position = candidates
      .map(candidate => ({
        ...candidate,
        separation: Math.min(...systems.map(system => Math.hypot(system.x - candidate.x, system.y - candidate.y))),
      }))
      .sort((a, b) => b.separation - a.separation || a.y - b.y || a.x - b.x)[0];
    candidates.splice(candidates.findIndex(candidate => candidate.x === position.x && candidate.y === position.y), 1);
    const resourceYield = pool(
      .65 + (index * 3 % 7) * .1,
      .6 + (index * 5 % 7) * .1,
      .55 + (index * 2 % 8) * .1,
    );
    const mineMax = pool(3 + (index * 3 % 4), 3 + (index * 5 % 4), 3 + (index * 2 % 4));
    systems.push(planet(
      `frontier-${index + 1}`,
      FRONTIER_PLANET_NAMES[index],
      position.x,
      position.y,
      FRONTIER_PLANET_COLORS[index % FRONTIER_PLANET_COLORS.length],
      null,
      resourceYield,
      mineMax,
      3 + index % 3,
    ));
  }
};
const distantHomeSystems = (systems: Planet[], count: number, random: () => number) => {
  const available = [...systems];
  const widestPair = systems.flatMap((first, index) => systems.slice(index + 1).map(second => ({
    first,
    second,
    separation: Math.hypot(second.x - first.x, second.y - first.y),
  }))).sort((a, b) => b.separation - a.separation
    || a.first.id.localeCompare(b.first.id)
    || a.second.id.localeCompare(b.second.id))[0];
  const firstHome = widestPair
    ? (random() < .5 ? widestPair.first : widestPair.second)
    : available[Math.floor(random() * available.length)];
  const selected = [available.splice(available.indexOf(firstHome), 1)[0]];
  while (selected.length < count && available.length) {
    const ranked = available.map(system => ({
      system,
      separation: Math.min(...selected.map(home => Math.hypot(system.x - home.x, system.y - home.y))),
      tie: random(),
    })).sort((a, b) => b.separation - a.separation || b.tie - a.tie);
    selected.push(ranked[0].system);
    available.splice(available.indexOf(ranked[0].system), 1);
  }
  return selected;
};
const randomSystemKind = (random: () => number): Exclude<SystemKind, 'star'> => {
  const roll = random();
  let total = 0;
  for (const option of RANDOM_SYSTEM_KINDS) {
    total += option.weight;
    if (roll < total) return option.kind;
  }
  return 'planet';
};
const configureSpecialSystem = (system: Planet, kind: Exclude<SystemKind, 'planet'>, nameIndex: number) => {
  const names = SPECIAL_SYSTEM_NAMES[kind];
  const nameCycle = Math.floor(nameIndex / names.length);
  system.systemKind = kind;
  system.name = `${names[nameIndex % names.length]}${nameCycle ? ` ${nameCycle + 1}` : ''}`;
  system.color = SPECIAL_SYSTEM_COLORS[kind];
  system.owner = null;
  system.buildings = [];
  system.groundQueue = [];
  system.spaceQueue = [];
  if (kind === 'pirateBase') {
    system.groundUnits = PIRATE_GROUND_GARRISON.map((unitKind, index) =>
      unit(`pirate-ground-${system.id}-${index + 1}`, unitKind, 'neutral'));
    system.orbitUnits = PIRATE_ORBITAL_GARRISON.map((unitKind, index) =>
      unit(`pirate-orbit-${system.id}-${index + 1}`, unitKind, 'neutral'));
  } else {
    system.groundUnits = [];
    system.orbitUnits = [];
  }
};

const seedNeutralGarrisons = (planets: Planet[]) => {
  const kinds: GroundUnitKind[] = ['infantry', 'recon', 'antiVehicle'];
  planets.filter(p => isColonizableWorld(p) && p.owner === null && !p.groundUnits.length).forEach((p, planetIndex) => {
    const count = 1 + planetIndex % 2;
    p.groundUnits = Array.from({ length: count }, (_, unitIndex) =>
      unit(`neutral-${p.id}-${unitIndex + 1}`, kinds[(planetIndex + unitIndex) % kinds.length], 'neutral'));
  });
};

export const mapPlanetCount = (size: MapSize) => MAP_PLANETS[size];
export const enemyDifficultyMultiplier = (difficulty: EnemyDifficulty) => difficulty === 'cadet' ? .78 : difficulty === 'admiral' ? 1.38 : 1;
export const randomMapSeed = () => {
  const values = new Uint32Array(1);
  globalThis.crypto?.getRandomValues?.(values);
  return values[0] || Math.floor(Math.random() * 0xffffffff) || 1;
};

const starterBuildings = (prefix: string, faction: PlayableFaction): Building[] => {
  const kinds: BuildingKind[] = faction === 'brood'
    ? ['groundFactory', 'spaceFactory']
    : ['metalMine', 'crystalMine', 'goldMine', 'groundFactory', 'spaceFactory'];
  return kinds.map((kind, index) => ({ id: `${prefix}${index + 1}`, kind, ...(kind === 'spaceFactory' ? { spaceQueue: [] } : {}) }));
};

export function createInitialState(requestedConfig: GameConfig = DEFAULT_GAME_CONFIG, mode: GameState['mode'] = 'solo'): GameState {
  const playerFaction = requestedConfig.playerFaction ?? 'human';
  const config = { ...requestedConfig, playerFaction, mapSeed: requestedConfig.mapSeed ?? 0 };
  const terra = planet('terra', 'Terra Nova', 22, 56, '#55d6be', null, pool(1, .9, .65), pool(5, 4, 3), 4);
  const cygnus = planet('cygnus', 'Cygnus Reach', 76, 30, '#e86a92', null, pool(.7, 1.2, .9), pool(3, 5, 4));

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
  const includesLarge = ['large', 'huge', 'massive', 'galactic'].includes(config.mapSize);
  const includesHuge = ['huge', 'massive', 'galactic'].includes(config.mapSize);
  const planets = [...corePlanets, ...(config.mapSize === 'small' ? [] : mediumPlanets), ...(includesLarge ? largePlanets : []), ...(includesHuge ? hugePlanets : [])];
  addFrontierPlanets(planets, MAP_PLANETS[config.mapSize] - planets.length);
  const random = seededRandom(config.mapSeed);
  if (config.mapSeed) {
    randomizeSystemPositions(planets, seededRandom(config.mapSeed ^ 0x9e3779b9), config.mapSize);
    // Preserve the established homeworld and special-system rolls for existing serialized seeds.
    for (let index = 0; index < planets.length * 2 + 2; index += 1) random();
  }
  const requestedHomes = mode === 'competitive' ? Math.min(4, planets.length) : 2;
  const homeSystems = config.mapSeed
    ? distantHomeSystems(planets, requestedHomes, random)
    : ['terra', 'cygnus', 'halcyon', 'vesta'].slice(0, requestedHomes).map(id => planets.find(system => system.id === id)!).filter(Boolean);
  const [playerHome, enemyHome] = homeSystems;
  playerHome.owner = 'player';
  playerHome.buildings = starterBuildings('b', playerFaction);
  enemyHome.owner = 'enemy';
  enemyHome.buildings = starterBuildings('eb', 'human');
  if (config.mapSeed) {
    const candidates = shuffle(planets.filter(system => !homeSystems.includes(system)), random);
    const namesUsed: Partial<Record<Exclude<SystemKind, 'planet'>, number>> = {};
    const configure = (system: Planet, kind: Exclude<SystemKind, 'planet'>) => {
      const nameIndex = namesUsed[kind] ?? 0;
      configureSpecialSystem(system, kind, nameIndex);
      namesUsed[kind] = nameIndex + 1;
    };
    const centralStar = candidates.reduce((closest, system) =>
      Math.hypot(system.x - 50, system.y - 50) < Math.hypot(closest.x - 50, closest.y - 50) ? system : closest);
    configure(centralStar, 'star');
    candidates.filter(system => system !== centralStar).forEach(system => {
      const kind = randomSystemKind(random);
      if (kind !== 'planet') configure(system, kind);
    });
  }
  seedNeutralGarrisons(planets);
  const state: GameState = {
    mode,
    config,
    resources: startingResources(playerFaction),
    enemyResources: pool(520, 420, 280),
    planets,
    fleets: [], battles: [], completedResearch: [], enemyCompletedResearch: [], researchQueue: [], enemyResearchQueue: [],
    enemyActionClock: 8, enemyAttackClock: config.difficulty === 'cadet' ? 180 : config.difficulty === 'admiral' ? 100 : 130, enemyMissionCount: 0,
    empireCivilizations: { player: playerFaction, enemy: 'human', rival2: 'human', rival3: 'human' },
    startingPlanetIds: { player: playerHome.id, enemy: enemyHome.id },
    additionalEmpires: {}, aiFactions: mode === 'solo' ? ['enemy'] : [],
    elapsed: 0, nextId: 100, neutralGarrisonsInitialized: true, homeSystemIds: homeSystems.map(system => system.id),
    messages: [playerFaction === 'brood' ? `THE BROOD AWAKENS — ${playerHome.name} begins generating biomass.` : playerFaction === 'aegis' ? `AEGIS COMMAND ONLINE — ${playerHome.name} is ready.` : playerFaction === 'covenant' ? `IRON PROTOCOL ONLINE — ${playerHome.name} awaits material.` : `COMMAND ONLINE — ${playerHome.name} awaits your orders.`],
  };
  updatePlanetIntel(state);
  seedKnownEmpireHomeworldIntel(state);
  return state;
}

const clone = (state: GameState): GameState => structuredClone(state);

const LEGACY_FLAK_KINDS: Record<string, SpaceUnitKind> = {
  commandFlagship: 'flakFrigate',
  broodRazorQueen: 'broodSporeguard',
  aegisArbiterFlagship: 'aegisSentinelFrigate',
  covenantNullFlagship: 'covenantInterdictor',
};
const migrateLegacyFlakKind = (kind: UnitKind) => LEGACY_FLAK_KINDS[kind] ?? kind;

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
  state.config ??= {
    mapSize: state.planets.length <= 7 ? 'small'
      : state.planets.length <= 11 ? 'medium'
        : state.planets.length <= 15 ? 'large'
          : state.planets.length <= 21 ? 'huge'
            : state.planets.length <= 31 ? 'massive' : 'galactic',
    difficulty: 'commander',
    playerFaction: 'human',
  };
  state.config.playerFaction = PLAYABLE_FACTIONS.includes(state.config.playerFaction ?? 'human') ? state.config.playerFaction ?? 'human' : 'human';
  state.config.mapSeed = Number.isFinite(state.config.mapSeed) ? state.config.mapSeed : 0;
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
  if (!state.startingPlanetIds) {
    const recordedHomes = state.homeSystemIds ?? [];
    const ownedHome = (faction: EmpireFaction, fallbackId: string, index: number) =>
      recordedHomes[index]
      ?? state.planets.find(planet => planet.owner === faction && isColonizableWorld(planet))?.id
      ?? fallbackId;
    state.startingPlanetIds = state.mode === 'competitive'
      ? {
          player: ownedHome('player', 'terra', 0),
          enemy: ownedHome('enemy', 'cygnus', 1),
          ...(('rival2' in state.additionalEmpires || state.planets.some(planet => planet.owner === 'rival2')) ? { rival2: ownedHome('rival2', 'halcyon', 2) } : {}),
          ...(('rival3' in state.additionalEmpires || state.planets.some(planet => planet.owner === 'rival3')) ? { rival3: ownedHome('rival3', 'vesta', 3) } : {}),
        }
      : { player: ownedHome('player', 'terra', 0), enemy: ownedHome('enemy', 'cygnus', 1) };
  }
  state.elapsed ??= 0;
  state.nextId ??= 100;
  if (!state.planetIntel || typeof state.planetIntel !== 'object' || Array.isArray(state.planetIntel)) state.planetIntel = {};
  for (const faction of ['player', 'enemy', 'rival2', 'rival3'] as EmpireFaction[]) {
    const records = state.planetIntel[faction];
    if (!records || typeof records !== 'object' || Array.isArray(records)) state.planetIntel[faction] = {};
  }
  const migrateUnitRoster = (savedUnit: Unit) => {
    const originalKind = savedUnit.kind;
    savedUnit.kind = migrateLegacyFlakKind(savedUnit.kind);
    const convertedLegacyFlak = savedUnit.kind !== originalKind;
    if (savedUnit.faction !== 'neutral') {
      const migratedKind = civilizationUnitKind(empireCivilization(state, savedUnit.faction), savedUnit.kind);
      if (convertedLegacyFlak || migratedKind !== savedUnit.kind) {
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
      savedUnit.fighterDamage = Math.max(0, Math.min(FIGHTER_HIT_POINTS - Number.EPSILON, savedUnit.fighterDamage ?? 0));
    }
    if (isTitanKind(savedUnit.kind)) {
      const installed: unknown[] = Array.isArray(savedUnit.titanUpgrades) ? savedUnit.titanUpgrades : [];
      savedUnit.titanUpgrades = installed.filter((id): id is TitanUpgradeId => typeof id === 'string' && id in TITAN_UPGRADES);
      const shieldMatrixLevel = titanUpgradeLevel(savedUnit, 'shieldMatrix');
      if (shieldMatrixLevel) {
        const upgradedMaximum = Math.round(UNITS[savedUnit.kind].shields * (1 + shieldMatrixLevel * .4));
        if (savedUnit.maxShields < upgradedMaximum) {
          savedUnit.shields = Math.min(upgradedMaximum, savedUnit.shields + upgradedMaximum - savedUnit.maxShields);
          savedUnit.maxShields = upgradedMaximum;
        }
      }
    } else {
      delete savedUnit.titanUpgrades;
    }
    savedUnit.cargo?.forEach(migrateUnitRoster);
  };
  for (const p of state.planets) {
    p.systemKind ??= 'planet';
    p.buildingLimits.experimentalSpaceFactory ??= 1;
    p.buildingLimits.groundDefense = 4;
    p.buildingLimits.antiSpaceDefense = 3;
    p.buildingLimits.spaceDefense = ORBITAL_DEFENSE_BUILDING_CAP;
    p.buildings = Array.isArray(p.buildings) ? p.buildings : [];
    p.defenseRebuildCooldowns ??= {};
    for (const kind of Object.keys(p.defenseRebuildCooldowns) as DefenseBuildingKind[]) {
      const remaining = p.defenseRebuildCooldowns[kind];
      if (!isDefenseBuildingKind(kind) || typeof remaining !== 'number' || !Number.isFinite(remaining) || remaining <= 0) delete p.defenseRebuildCooldowns[kind];
    }
    p.groundUnits = Array.isArray(p.groundUnits) ? p.groundUnits : [];
    p.orbitUnits = Array.isArray(p.orbitUnits) ? p.orbitUnits : [];
    p.groundQueue = Array.isArray(p.groundQueue) ? p.groundQueue : [];
    p.spaceQueue = Array.isArray(p.spaceQueue) ? p.spaceQueue : [];
    if (p.owner) {
      const civilization = empireCivilization(state, p.owner);
      const migrateQueueItem = (item: QueueItem) => {
        const originalKind = item.kind;
        const migratedKind = civilizationUnitKind(civilization, migrateLegacyFlakKind(item.kind));
        item.kind = migratedKind;
        if (migratedKind === originalKind) return;
        const progressRatio = item.total > 0 ? item.remaining / item.total : 1;
        item.total = UNITS[migratedKind].time ?? item.total;
        item.remaining = Math.max(0, item.total * progressRatio);
      };
      p.groundQueue.forEach(migrateQueueItem);
      p.spaceQueue.forEach(migrateQueueItem);
      p.buildings.forEach(building => building.spaceQueue?.forEach(migrateQueueItem));
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
  updatePlanetIntel(state);
  seedKnownEmpireHomeworldIntel(state);
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
    const reclamationScale = empireEconomy(state, faction).completedResearch.includes('covenantSalvageAlgorithms') ? 1.5 : 1;
    const metal = Math.floor(recovered * (salvageArrayOnline ? COVENANT_SALVAGE_ARRAY_MULTIPLIER : 1) * reclamationScale);
    empireEconomy(state, faction).resources.metal += metal;
    if (faction === 'player') addMessage(state, `COVENANT SALVAGE — ${metal} metal reclaimed ${location}.`);
  });
};
export const researchIncomeMultiplier = (completed: ResearchId[]) => (completed.includes('deepCoreExtraction') ? 1.5 : completed.includes('quantumExtraction') ? 1.25 : 1)
  * (1 + researchLevel(completed, 'resourceSynthesis') * .05)
  * (completed.includes('humanColonialCharters') ? 1.1 : 1)
  * (completed.includes('broodHypermetabolism') ? 1.15 : 1);
export const researchProductionMultiplier = (completed: ResearchId[]) => (completed.includes('rapidFabrication') ? 1.25 : 1)
  * (1 + researchLevel(completed, 'industrialIteration') * .05)
  * (completed.includes('humanStandardization') ? 1.1 : 1)
  * (completed.includes('broodSpawningPools') ? 1.2 : 1)
  * (completed.includes('aegisPatientAssembly') ? 1.1 : 1)
  * (completed.includes('covenantOverclockedForges') ? 1.2 : 1);
export const researchLabCount = (state: GameState, faction: EmpireFaction = 'player') => state.planets.reduce((total, planet) =>
  total + (planet.owner === faction ? planet.buildings.filter(building => building.kind === 'researchLab').length : 0), 0);
export const researchSpeedMultiplier = (state: GameState, faction: EmpireFaction = 'player') => {
  const labs = researchLabCount(state, faction);
  return labs ? 1.5 ** (labs - 1) : 0;
};
export const phaseTravelMultiplier = (completed: ResearchId[]) => (completed.includes('phaseMastery') ? .75 : 1)
  * (completed.includes('humanPhaseCouriers') ? .9 : 1)
  * (completed.includes('broodVoidSenses') ? .85 : 1)
  * (completed.includes('aegisFarcastBeacons') ? .85 : 1)
  * (completed.includes('covenantPhaseCalculation') ? .9 : 1);
export const shieldRecoveryMultiplier = (completed: ResearchId[]) => (completed.includes('shieldHarmonics') ? 1.5 : 1)
  * (completed.includes('aegisSanctuaryField') ? 1.75 : 1);
export const hullRecoveryMultiplier = (completed: ResearchId[]) =>
  completed.includes('broodApexInstinct') || completed.includes('covenantSelfRepairMatrices') ? 2 : 1;
export const orbitalDamageMultiplier = (completed: ResearchId[]) => (completed.includes('weaponsCalibration') ? 1.15 : 1)
  * (1 + researchLevel(completed, 'combatSimulation') * .03)
  * (completed.includes('humanJointOperations') ? 1.08 : 1)
  * (completed.includes('humanTargetingGrid') ? 1.1 : 1)
  * (completed.includes('broodSynapticDominion') ? 1.1 : 1)
  * (completed.includes('aegisLanceResonance') ? 1.1 : 1);
export const defenseDurabilityMultiplier = (completed: ResearchId[]) => (completed.includes('planetaryFortifications') ? 1.25 : 1)
  * (completed.includes('humanFieldEngineering') ? 1.15 : 1)
  * (completed.includes('broodWorldCarapace') ? 1.2 : 1)
  * (completed.includes('aegisBastionLattice') ? 1.4 : 1)
  * (completed.includes('covenantRedundantCores') ? 1.2 : 1);
export const groundProductionMultiplier = (planet: Planet, completed: ResearchId[] = []) => Math.max(1, planet.buildings.reduce((capacity, building) =>
  capacity + (building.kind === 'groundFactory' ? 1 : building.kind === 'advancedGroundFactory' ? ADVANCED_GROUND_FACTORY_CAPACITY : 0), 0))
  * researchProductionMultiplier(completed);
export const spaceProductionMultiplier = (completed: ResearchId[] = []) => researchProductionMultiplier(completed);
export const isSpaceYard = (building: Building): building is Building & { kind: SpaceYardKind } =>
  building.kind === 'spaceFactory' || building.kind === 'advancedSpaceFactory' || building.kind === 'experimentalSpaceFactory';
export const spaceYards = (planet: Planet) => planet.buildings.filter(isSpaceYard);
export const spaceYardTier = (yard: Building): SpaceShipTier | undefined => isSpaceYard(yard) ? SPACE_YARD_TIER[yard.kind] : undefined;
export const spaceYardCanProduce = (yard: Building, kind: UnitKind) => isSpaceYard(yard) && yard.kind === requiredSpaceYardKind(kind);
export type TitanStatus = 'deployed' | 'under-construction';
export const factionTitanStatus = (state: GameState, faction: EmpireFaction): TitanStatus | undefined => {
  const deployed = state.planets.some(planet =>
    planet.orbitUnits.some(unit => unit.faction === faction && isTitanKind(unit.kind)))
    || state.fleets.some(fleet => fleet.faction === faction && isTitanKind(fleet.unit.kind));
  if (deployed) return 'deployed';
  return state.planets.some(planet =>
    planet.owner === faction && spaceYards(planet).some(yard => (yard.spaceQueue ?? []).some(item => isTitanKind(item.kind))))
    ? 'under-construction'
    : undefined;
};
export const factionHasTitan = (state: GameState, faction: EmpireFaction) => factionTitanStatus(state, faction) !== undefined;
export function rebalanceSpaceYardQueues(planet: Planet) {
  const yards = spaceYards(planet);
  if (yards.length < 2) return 0;
  const waiting: Array<{ item: QueueItem; sourceId: string }> = [];
  for (const yard of yards) {
    yard.spaceQueue ??= [];
    const [active, ...queued] = yard.spaceQueue;
    yard.spaceQueue = active ? [active] : [];
    waiting.push(...queued.map(item => ({ item, sourceId: yard.id })));
  }
  let moved = 0;
  for (const queued of waiting) {
    const compatible = yards.filter(yard => spaceYardCanProduce(yard, queued.item.kind));
    const eligible = compatible.length ? compatible : yards.filter(yard => yard.id === queued.sourceId);
    const target = eligible.reduce((best, yard) => yard.spaceQueue!.length < best.spaceQueue!.length ? yard : best);
    target.spaceQueue!.push(queued.item);
    if (target.id !== queued.sourceId) moved += 1;
  }
  return moved;
}
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

export function tradeResources(input: GameState, from: Resource, to: Resource, amount: number): GameResult {
  if (usesBiomass(input)) return fail(input, 'The Brood cannot trade mineral resources.');
  if (from === to) return fail(input, 'Choose two different resources.');
  if (!Number.isSafeInteger(amount) || amount < RESOURCE_TRADE_RATE || amount > RESOURCE_TRADE_MAX_SPEND) return fail(input, `Enter a whole trade amount from ${RESOURCE_TRADE_RATE} to ${RESOURCE_TRADE_MAX_SPEND.toLocaleString('en-US')}.`);
  if (input.resources[from] < amount) return fail(input, `Requires ${amount.toLocaleString('en-US')} ${from}.`);
  const received = amount / RESOURCE_TRADE_RATE;
  const state = clone(input);
  state.resources[from] -= amount;
  state.resources[to] += received;
  addMessage(state, `TRADE COMPLETE — ${amount.toLocaleString('en-US')} ${from.toUpperCase()} exchanged for ${received.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${to.toUpperCase()}.`);
  return pass(state);
}

export function constructBuilding(input: GameState, planetId: string, kind: BuildingKind): GameResult {
  const state = clone(input); const p = getPlanet(state, planetId); const def = BUILDINGS[kind];
  if (!p || !isColonizableWorld(p) || p.owner !== 'player') return fail(input, 'Select one of your colonies.');
  if (usesBiomass(state) && ['metalMine', 'crystalMine', 'goldMine'].includes(kind)) return fail(input, 'The Brood grows biomass naturally and cannot construct mineral mines.');
  const count = p.buildings.filter(b => b.kind === kind).length;
  const unlimited = hasUnlimitedBuildingCapacity(kind);
  if (!unlimited && count >= p.buildingLimits[kind]) return fail(input, `${p.name} has reached its ${def.label} limit.`);
  const rebuildCooldown = isDefenseBuildingKind(kind) ? p.defenseRebuildCooldowns?.[kind] ?? 0 : 0;
  if (rebuildCooldown > 0) return fail(input, `${def.label} rebuild locked for ${Number(rebuildCooldown.toFixed(1))}s.`);
  if (!hasResearch(state, def.requires)) return fail(input, `Requires ${RESEARCH[def.requires!].label}.`);
  if (!canPlayerAfford(state, def.cost)) return fail(input, insufficientPlayerResources(state));
  spendPlayerResources(state, def.cost);
  const building: Building = {
    id: `b${state.nextId++}`, kind,
    ...(isDefenseBuildingKind(kind) ? { constructionRemaining: def.time!, constructionTotal: def.time! } : {}),
  };
  if (isSpaceYard(building)) building.spaceQueue = [];
  ensureOrbitalDefenseHealth(building);
  p.buildings.push(building);
  const rebalanced = isSpaceYard(building) ? rebalanceSpaceYardQueues(p) : 0;
  addMessage(state, isDefenseBuildingKind(kind)
    ? `${def.label} construction started on ${p.name} — ${def.time}s.`
    : `${def.label} ${count + 1}/${unlimited ? '∞' : p.buildingLimits[kind]} constructed on ${p.name}.`);
  if (rebalanced) addMessage(state, `SPACE YARD NETWORK — ${rebalanced} waiting hull${rebalanced === 1 ? '' : 's'} reassigned across ${spaceYards(p).length} yards.`);
  return pass(state);
}

export function queueUnit(input: GameState, planetId: string, kind: UnitKind, yardIds?: string[], quantity: ProductionQuantity = 1): GameResult {
  const state = clone(input); const p = getPlanet(state, planetId); const def = UNITS[kind];
  if (!PRODUCTION_QUANTITIES.some(option => option === quantity)) return fail(input, 'Production quantity must be 1, 5, or 25.');
  if (kind === 'defenseTurret' || kind === 'spineTower' || kind === 'covenantBulwark') return fail(input, 'Defensive emplacements deploy automatically from Ground Defenses.');
  if (!p || !isColonizableWorld(p) || p.owner !== 'player') return fail(input, 'Production requires a friendly colony.');
  const civilization = empireCivilization(state);
  if (!unitAvailableToCivilization(kind, civilization)) return fail(input, civilization === 'brood'
    ? 'That organism is not part of the Brood genome.'
    : 'That unit is unavailable to this civilization.');
  if (def.factory === 'ground' && !p.buildings.some(b => b.kind === 'groundFactory' || b.kind === 'advancedGroundFactory')) return fail(input, 'Requires a Ground Factory.');
  if (!hasResearch(state, def.requires)) return fail(input, `Requires ${RESEARCH[def.requires!].label}.`);
  if (def.factory === 'ground') {
    if (def.advancedFactory && !p.buildings.some(building => building.kind === 'advancedGroundFactory')) return fail(input, 'Requires an Advanced Ground Factory.');
    const totalCost = pool(def.cost.metal * quantity, def.cost.crystal * quantity, def.cost.gold * quantity);
    if (!canPlayerAfford(state, totalCost)) return fail(input, insufficientPlayerResources(state));
    spendPlayerResources(state, totalCost);
    for (let index = 0; index < quantity; index += 1) {
      p.groundQueue.push({ id: `q${state.nextId++}`, kind, remaining: def.time!, total: def.time! });
    }
    addMessage(state, quantity === 1
      ? `${def.label} added to ${p.name} production.`
      : `${quantity} ${def.label} units added to ${p.name} production.`);
    return pass(state);
  }

  const yards = spaceYards(p);
  const requiredYard = requiredSpaceYardKind(kind)!;
  const tier = def.spaceTier!;
  const eligibleYards = yards.filter(yard => yard.kind === requiredYard);
  const yardLabel = tier === 1 ? 'Space Yard' : tier === 2 ? 'Advanced Space Yard' : 'Experimental Space Yard';
  if (!eligibleYards.length) return fail(input, `Tier ${tier} hulls require a ${yardLabel}.`);
  const automaticYard = eligibleYards.reduce((best, yard) => (yard.spaceQueue?.length ?? 0) < (best.spaceQueue?.length ?? 0) ? yard : best);
  const requestedIds = yardIds?.length ? [...new Set(yardIds)] : [automaticYard.id];
  const targets = requestedIds.map(id => yards.find(yard => yard.id === id));
  if (targets.some(yard => !yard)) return fail(input, 'Select a friendly Space Yard at this colony.');
  if (targets.some(yard => yard?.kind !== requiredYard)) return fail(input, `Tier ${tier} hulls require a ${yardLabel}.`);
  if (isTitanKind(kind) && targets.length > 1) return fail(input, 'A Titan may only be commissioned at one Experimental Space Yard.');
  if (isTitanKind(kind) && quantity > 1) return fail(input, 'A unique Titan must be commissioned with a 1× production order.');
  const titanStatus = isTitanKind(kind) ? factionTitanStatus(input, 'player') : undefined;
  if (titanStatus) return fail(input, `This faction already has a Titan ${titanStatus === 'deployed' ? 'deployed' : 'under construction'}.`);
  const orderCount = quantity * (yardIds?.length ? targets.length : 1);
  const totalCost = pool(def.cost.metal * orderCount, def.cost.crystal * orderCount, def.cost.gold * orderCount);
  if (!canPlayerAfford(state, totalCost)) return fail(input, usesBiomass(state) ? 'Insufficient biomass.' : `Insufficient resources to queue ${orderCount} ship${orderCount === 1 ? '' : 's'}.`);
  spendPlayerResources(state, totalCost);
  if (yardIds?.length) {
    for (const yard of targets as Building[]) {
      yard.spaceQueue ??= [];
      for (let index = 0; index < quantity; index += 1) {
        yard.spaceQueue.push({ id: `q${state.nextId++}`, kind, remaining: def.time!, total: def.time! });
      }
    }
  } else {
    for (let index = 0; index < quantity; index += 1) {
      const target = eligibleYards.reduce((best, yard) => (yard.spaceQueue?.length ?? 0) < (best.spaceQueue?.length ?? 0) ? yard : best);
      target.spaceQueue ??= [];
      target.spaceQueue.push({ id: `q${state.nextId++}`, kind, remaining: def.time!, total: def.time! });
    }
  }
  if (yardIds?.length) addMessage(state, quantity === 1
    ? `${def.label} added to ${targets.length} Space Yard queue${targets.length === 1 ? '' : 's'} at ${p.name}.`
    : `${orderCount} ${def.label} units added across ${targets.length} Space Yard queue${targets.length === 1 ? '' : 's'} at ${p.name} — ${quantity} per yard.`);
  else addMessage(state, quantity === 1
    ? `${def.label} auto-routed to Space Yard ${yards.indexOf(automaticYard) + 1} at ${p.name}.`
    : `${quantity} ${def.label} units auto-distributed across matching Space Yards at ${p.name}.`);
  return pass(state);
}

export function beginResearch(input: GameState, id: ResearchId): GameResult {
  const state = clone(input); const def = RESEARCH[id];
  if (!state.planets.some(p => p.owner === 'player' && p.buildings.some(b => b.kind === 'researchLab'))) return fail(input, 'Construct a Research Lab first.');
  if ((!isRepeatableResearch(id) && state.completedResearch.includes(id)) || state.researchQueue.some(r => r.id === id)) return fail(input, 'Research already acquired or active.');
  const civilization = empireCivilization(state);
  if (!researchAvailableToCivilization(id, civilization)) return fail(input, 'That research belongs to another civilization.');
  const requirement = researchRequirementForCivilization(id, civilization);
  if (!hasResearch(state, requirement)) return fail(input, `Requires ${researchDefinitionForCivilization(requirement!, civilization).label}.`);
  const cost = researchCost(id, state.completedResearch);
  const time = researchTime(id, state.completedResearch);
  if (!canPlayerAfford(state, cost)) return fail(input, insufficientPlayerResources(state));
  spendPlayerResources(state, cost);
  state.researchQueue.push({ id, remaining: time, total: time });
  const level = researchLevel(state.completedResearch, id) + 1;
  addMessage(state, `${researchDefinitionForCivilization(id, civilization).label}${isRepeatableResearch(id) ? ` level ${level}` : ''} research initiated.`);
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
  if (!isColonizableWorld(p)) return fail(input, `${p.name} has no planetary surface. Right-click inside the system to maneuver.`);
  const selectedIds = new Set(unitIds);
  const occupied = p.orbitUnits.filter(ship => !selectedIds.has(ship.id));
  let availableSquads = p.groundUnits.filter(unit => unit.faction === 'player').length;
  ships.forEach(ship => {
    ship.heading ??= 0;
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
    const border = systemBorderOffset(p, destination, state.config.mapSize);
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
    ship.heading ??= 0;
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
  });
  addMessage(state, `${interruptedFleets.length ? 'Jump canceled — ' : ''}${ships.length} ship${ships.length === 1 ? '' : 's'} maneuvering inside ${p.name} gravity well.`);
  return pass(state);
}

export const maneuverSpaceUnit = (input: GameState, planetId: string, unitId: string, orbitX: number, orbitY: number) => maneuverSpaceUnits(input, planetId, [unitId], orbitX, orbitY);

export function upgradeTitan(input: GameState, planetId: string, unitId: string, upgradeId: TitanUpgradeId): GameResult {
  const state = clone(input); const p = getPlanet(state, planetId);
  const titan = p?.orbitUnits.find(ship => ship.id === unitId && ship.faction === 'player' && isTitanKind(ship.kind))
    ?? state.fleets.find(fleet => fleet.originId === planetId && fleet.unit.id === unitId && fleet.faction === 'player' && isTitanKind(fleet.unit.kind))?.unit;
  if (!titan) return fail(input, 'That Titan is not available for an upgrade.');
  if (!(upgradeId in TITAN_UPGRADES)) return fail(input, 'Unknown Titan upgrade.');
  const upgrade = TITAN_UPGRADES[upgradeId];
  if (!canPlayerAfford(state, upgrade.cost)) return fail(input, insufficientPlayerResources(state));
  spendPlayerResources(state, upgrade.cost);
  const nextLevel = titanUpgradeLevel(titan, upgradeId) + 1;
  titan.titanUpgrades = [...(titan.titanUpgrades ?? []), upgradeId];
  if (upgradeId === 'shieldMatrix') {
    const oldMaximum = titan.maxShields;
    titan.maxShields = Math.round(UNITS[titan.kind].shields * (1 + nextLevel * .4));
    titan.shields = Math.min(titan.maxShields, titan.shields + titan.maxShields - oldMaximum);
  }
  addMessage(state, `${upgrade.label} level ${nextLevel} installed aboard ${UNITS[titan.kind].label}.`);
  return pass(state);
}

export const PHASE_TUNNEL_MIN_SECONDS = 4;
export const PHASE_TUNNEL_SECONDS_PER_MAP_UNIT = .28;
export const phaseTravelTime = (from: Planet, to: Planet) =>
  Math.max(PHASE_TUNNEL_MIN_SECONDS, Math.hypot(to.x - from.x, to.y - from.y) * PHASE_TUNNEL_SECONDS_PER_MAP_UNIT);

const systemBorderOffset = (from: Planet, to: Planet, mapSize: MapSize) => {
  const direction = systemDirection(from, to, mapSize);
  return { x: direction.x * MAX_SHIP_ORBIT_RADIUS, y: direction.y * MAX_SHIP_ORBIT_RADIUS };
};

function beginSystemExit(fleet: Fleet, origin: Planet, destination: Planet, departureX: number, departureY: number, mapSize: MapSize) {
  const border = systemBorderOffset(origin, destination, mapSize);
  fleet.phase = 'exiting';
  fleet.departureX = departureX;
  fleet.departureY = departureY;
  fleet.progress = 0;
  fleet.travelTime = Math.max(.1, Math.hypot(border.x - departureX, border.y - departureY) / SYSTEM_EXIT_SPEED);
  fleet.unit.heading ??= 0;
}

function syncDepartingFleetPosition(state: GameState, fleet: Fleet) {
  if (fleet.phase !== 'exiting' && fleet.phase !== 'charging') return;
  const origin = getPlanet(state, fleet.originId), destination = getPlanet(state, fleet.destinationId);
  if (!origin || !destination) return;
  const border = systemBorderOffset(origin, destination, state.config.mapSize);
  const progress = fleet.phase === 'charging' || fleet.travelTime <= 0 ? 1 : Math.min(1, fleet.progress / fleet.travelTime);
  fleet.unit.orbitX = (fleet.departureX ?? 0) + (border.x - (fleet.departureX ?? 0)) * progress;
  fleet.unit.orbitY = (fleet.departureY ?? 0) + (border.y - (fleet.departureY ?? 0)) * progress;
}

function stageDepartingFleetsForCombat(state: GameState, planet: Planet) {
  const staged = state.fleets.filter(fleet => fleet.originId === planet.id && (fleet.phase === 'exiting' || fleet.phase === 'charging'));
  staged.forEach(fleet => {
    syncDepartingFleetPosition(state, fleet);
    planet.orbitUnits.push(fleet.unit);
  });
  return new Set(staged.map(fleet => fleet.unit.id));
}

function restoreDepartingFleetsAfterCombat(state: GameState, planet: Planet, stagedIds: Set<string>) {
  if (!stagedIds.size) return;
  const surviving = new Map(planet.orbitUnits.filter(unit => stagedIds.has(unit.id)).map(unit => [unit.id, unit]));
  state.fleets.forEach(fleet => {
    const unit = surviving.get(fleet.unit.id);
    if (unit) fleet.unit = unit;
  });
  state.fleets = state.fleets.filter(fleet => !stagedIds.has(fleet.unit.id) || surviving.has(fleet.unit.id));
  planet.orbitUnits = planet.orbitUnits.filter(unit => !stagedIds.has(unit.id));
}

function dispatchFactionUnits(state: GameState, origin: Planet, ships: Unit[], destination: Planet, faction: EmpireFaction) {
  const path = findPlanetPath(state.planets, origin.id, destination.id);
  if (!path || path.length < 2) return false;
  const firstDestination = getPlanet(state, path[1])!;
  const phaseLockedIds = new Set(ships.filter(ship => hasTierTwoPhaseLock(origin.orbitUnits, ship)).map(ship => ship.id));
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
    const fleet: Fleet = { id: `f${state.nextId++}`, faction, originId: origin.id, destinationId: firstDestination.id, unit: ship, progress: 0, travelTime: 0, route: path.slice(2), finalDestinationId: destination.id, phaseGateLocked: phaseLockedIds.has(ship.id) };
    beginSystemExit(fleet, origin, firstDestination, departureX, departureY, state.config.mapSize);
    state.fleets.push(fleet);
  }
  return true;
}

export function dispatchSpaceUnits(input: GameState, originId: string, unitIds: string[], destinationId: string): GameResult {
  const state = clone(input); const origin = getPlanet(state, originId); const destination = getPlanet(state, destinationId);
  const requestedIds = new Set(unitIds);
  const orbitShips = origin?.orbitUnits.filter(unit => requestedIds.has(unit.id) && unit.faction === 'player') ?? [];
  const interruptibleFleets = state.fleets.filter(fleet => requestedIds.has(fleet.unit.id) && fleet.faction === 'player' && fleet.originId === originId && (fleet.phase === 'exiting' || fleet.phase === 'charging'));
  if (!origin || !destination || !requestedIds.size || orbitShips.length + interruptibleFleets.length !== requestedIds.size || origin.id === destination.id) return fail(input, 'Selected ships must share one gravity well.');
  const reroutedFleets = interruptibleFleets.filter(fleet => (fleet.finalDestinationId ?? fleet.destinationId) !== destinationId);
  const ships = [...orbitShips, ...reroutedFleets.map(fleet => fleet.unit)];
  if (ships.some(ship => ship.pendingEmbark)) return fail(input, 'Transports must complete embarkation before jumping.');
  const path = findPlanetPath(state.planets, originId, destinationId);
  if (!path || path.length < 2) return fail(input, 'No phase-lane route reaches that gravity well.');
  if (reroutedFleets.length) {
    const reroutedIds = new Set(reroutedFleets.map(fleet => fleet.id));
    reroutedFleets.forEach(fleet => {
      syncDepartingFleetPosition(state, fleet);
      origin.orbitUnits.push(fleet.unit);
    });
    state.fleets = state.fleets.filter(fleet => !reroutedIds.has(fleet.id));
  }
  if (ships.length) dispatchFactionUnits(state, origin, ships, destination, 'player');
  addMessage(state, `${requestedIds.size} ship${requestedIds.size === 1 ? '' : 's'} routed across ${path.length - 1} phase lane${path.length === 2 ? '' : 's'} to ${destination.name}.`);
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
  const defenses = p.buildings.filter(building => building.kind === 'groundDefense' && isBuildingOperational(building));
  battle.groundDefenseBuildingIds = defenses.map(building => building.id);
  const existingSources = new Set(battle.defenders.map(defender => defender.sourceBuildingId));
  battle.defenders.push(...defenses.filter(building => !existingSources.has(building.id)).map(building => groundDefenseUnit(state, building, p.owner!)));
}

export function groundDeploymentForPlanet(state: GameState, planetId: string): GroundBattle | undefined {
  const p = getPlanet(state, planetId);
  if (!p || !isColonizableWorld(p)) return undefined;
  const defenses = p.owner
    ? p.buildings.filter(building => building.kind === 'groundDefense' && isBuildingOperational(building))
      .map(building => groundDefenseUnit(state, building, p.owner!))
    : [];
  const deployment: GroundBattle = {
    planetId,
    attackers: [],
    defenders: [...p.groundUnits.map(unit => structuredClone(unit)), ...defenses],
    groundDefenseBuildingIds: defenses.map(unit => unit.sourceBuildingId!),
  };
  ensureBattlePositions(deployment);
  return deployment;
}

function groundTransport(p: Planet, transport: Unit) {
  transport.cargo = [];
  transport.loadedUnitIds = [];
  transport.landedTransport = true;
  delete transport.orbitX;
  delete transport.orbitY;
  delete transport.orbitTargetX;
  delete transport.orbitTargetY;
  delete transport.heading;
  delete transport.phaseArrival;
  delete transport.pendingLanding;
  delete transport.pendingEmbark;
  delete transport.docked;
  p.orbitUnits = p.orbitUnits.filter(unit => unit.id !== transport.id);
  return transport;
}

function unloadTransport(state: GameState, p: Planet, transport: Unit) {
  const cargo = transport.cargo ?? [];
  if (transport.faction === 'neutral') return false;
  const faction = transport.faction;
  const deployedCargo = cargo.map(unit => {
    const deployed = { ...unit };
    delete deployed.battleHoldPosition;
    return deployed;
  });
  if (!isColonizableWorld(p) || !UNITS[transport.kind].capacity || !cargo.length) return false;
  const activeBattle = state.battles.find(battle => battle.planetId === p.id);
  if (activeBattle) {
    const attackerFaction = activeBattle.attackerFaction ?? activeBattle.attackers[0]?.faction;
    const reinforcements = faction === attackerFaction ? activeBattle.attackers : activeBattle.defenders;
    reinforcements.push(...deployedCargo, groundTransport(p, transport));
    ensureBattlePositions(activeBattle);
    addMessage(state, `${cargo.length} ${faction === attackerFaction ? 'attacking' : 'defending'} squad${cargo.length === 1 ? '' : 's'} and their transport reinforced the ground battle on ${p.name}.`);
    return true;
  }
  if (p.owner === null && p.groundUnits.length) {
    const battle: GroundBattle = { planetId: p.id, attackers: [...deployedCargo, groundTransport(p, transport)], defenders: [...p.groundUnits], attackerFaction: faction, groundDefenseBuildingIds: [] };
    ensureBattlePositions(battle);
    state.battles.push(battle);
    p.groundUnits = [];
    addMessage(state, faction === 'player' ? `LANDING CONTESTED — neutral defenders are resisting on ${p.name}.` : `Enemy forces engaged the neutral garrison on ${p.name}.`);
    return true;
  } else if (p.owner === null) {
    p.owner = faction; p.groundUnits.push(...recoverGroundUnits(cargo));
    addMessage(state, faction === 'player' ? `${p.name} colonized by ${cargo.length} automatically deployed squad${cargo.length === 1 ? '' : 's'}.` : `Enemy forces established a new base on ${p.name}.`);
  } else if (p.owner !== faction) {
    const defenses = p.buildings.filter(building => building.kind === 'groundDefense' && isBuildingOperational(building));
    const fortifications = defenses.map(building => groundDefenseUnit(state, building, p.owner!));
    if (p.groundUnits.length || fortifications.length) {
      const battle: GroundBattle = { planetId: p.id, attackers: [...deployedCargo, groundTransport(p, transport)], defenders: [...p.groundUnits, ...fortifications], attackerFaction: faction, groundDefenseBuildingIds: defenses.map(building => building.id) };
      ensureBattlePositions(battle);
      state.battles.push(battle);
      p.groundUnits = [];
      const defenseReport = defenses.length ? ` ${defenses.length} defense turret${defenses.length === 1 ? '' : 's'} online.` : '';
      addMessage(state, faction === 'player' ? `Automatic landing initiated a ground battle on ${p.name}.${defenseReport}` : `HOSTILE LANDING — enemy troops are attacking ${p.name}.${defenseReport}`);
      return true;
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
  return false;
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
  const effectiveConfig = {
    ...config,
    playerFaction: playerCivilization,
    ...(slots.length > 2 && ['small', 'medium', 'large'].includes(config.mapSize) ? { mapSize: 'huge' as const } : {}),
  };
  const state = createInitialState(effectiveConfig, 'competitive');
  const homeIds = state.homeSystemIds?.length ? state.homeSystemIds : ['terra', 'cygnus', 'halcyon', 'vesta'];
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
  state.startingPlanetIds = Object.fromEntries(slots.map(slot => [slot.faction, homeIds[EMPIRE_FACTIONS.indexOf(slot.faction)]]));
  state.messages = [`FREE-FOR-ALL LINK ONLINE — ${slots.length} empires await command.`];
  state.planetIntel = {};
  updatePlanetIntel(state);
  seedKnownEmpireHomeworldIntel(state);
  return state;
}

export function recoverGroundUnits(units: Unit[]): Unit[] {
  return units.map(unit => {
    const restored = { ...unit, hp: unit.maxHp, shields: unit.maxShields };
    delete restored.battleX; delete restored.battleY;
    delete restored.weaponCooldown; delete restored.weaponFlash;
    delete restored.weaponCooldowns; delete restored.weaponFlashes;
    delete restored.battleTargetX; delete restored.battleTargetY;
    delete restored.battleRetaliationTargetId;
    delete restored.battleHoldPosition;
    delete restored.battleForceMove;
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

export function recoverSpaceUnit(u: Unit, friendlyOrbit: boolean, seconds: number, civilization: PlayableFaction = 'human', recoveryMultiplier = 1, hullMultiplier = 1): Unit {
  const shieldRecovery = (5 + (civilization === 'aegis' ? AEGIS_SHIELD_REGEN_BONUS : 0)) * recoveryMultiplier;
  const livingHold = UNITS[u.kind].ability?.kind === 'livingHold';
  const hullRecovery = (livingHold ? 4 : civilization === 'covenant' ? (friendlyOrbit ? 4 : 2) : friendlyOrbit ? 2 : 0) * hullMultiplier;
  return { ...u, shields: Math.min(u.maxShields, u.shields + seconds * shieldRecovery), hp: Math.min(u.maxHp, u.hp + seconds * hullRecovery) };
}

export function recoverCarrierFighters(input: Unit, seconds: number): Unit {
  const wing = UNITS[input.kind].fighterWing;
  if (!wing) return input;
  const fighterCount = carrierFighterCount(input);
  if (seconds <= 0) return { ...input, fighterCount, fighterBuildProgress: input.fighterBuildProgress ?? 0, fighterLossProgress: input.fighterLossProgress ?? 0, fighterDamage: input.fighterDamage ?? 0 };
  if (fighterCount >= wing.capacity) return { ...input, fighterCount, fighterBuildProgress: 0, fighterLossProgress: input.fighterLossProgress ?? 0, fighterDamage: input.fighterDamage ?? 0 };
  const progress = (input.fighterBuildProgress ?? 0) + seconds;
  const completed = Math.min(wing.capacity - fighterCount, Math.floor(progress / wing.rebuildTime));
  return {
    ...input,
    fighterCount: fighterCount + completed,
    fighterBuildProgress: completed ? progress - completed * wing.rebuildTime : progress,
    fighterLossProgress: input.fighterLossProgress ?? 0,
    fighterDamage: input.fighterDamage ?? 0,
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
  if (losses) ship.fighterDamage = 0;
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
  const armor = UNITS[target.kind].factory === 'space' ? shipArmor(target.kind as SpaceUnitKind) : 0;
  return { ...target, shields: target.shields - shieldDamage, hp: target.hp - (reducedDamage - shieldDamage) * (1 - armor) };
}

function damageUnitPiercing(target: Unit, damage: number, piercingFraction = 0): Unit {
  const ability = UNITS[target.kind].ability?.kind;
  const reducedDamage = damage * (ability === 'evasiveChitin' ? .7 : ability === 'phaseCarapace' ? .65 : ability === 'ironcladArmor' ? .75 : ability === 'ablativePlating' && target.hp > target.maxHp / 2 ? .7 : 1);
  const directHullDamage = reducedDamage * piercingFraction;
  const shieldedDamage = reducedDamage - directHullDamage;
  const shieldDamage = Math.min(target.shields, shieldedDamage);
  const armor = UNITS[target.kind].factory === 'space' ? shipArmor(target.kind as SpaceUnitKind) : 0;
  const hullDamage = (directHullDamage + shieldedDamage - shieldDamage) * (1 - armor);
  return { ...target, shields: target.shields - shieldDamage, hp: target.hp - hullDamage };
}

function damageBuilding(target: Building, damage: number): Building {
  ensureOrbitalDefenseHealth(target);
  const shieldDamage = Math.min(target.shields!, damage);
  return { ...target, shields: target.shields! - shieldDamage, hp: target.hp! - (damage - shieldDamage) };
}

function ensureBattlePositions(battle: GroundBattle) {
  const occupied: Array<{ id: string; battleX: number; battleY: number }> = [];
  const deploy = (units: Unit[], x: number, direction: 1 | -1) => units.forEach((unit, index) => {
    if (typeof unit.battleX === 'number' && typeof unit.battleY === 'number') {
      occupied.push({ id: unit.id, battleX: unit.battleX, battleY: unit.battleY });
      return;
    }
    const rowsPerColumn = 13;
    const column = Math.floor(index / rowsPerColumn), row = index % rowsPerColumn;
    const rowCount = Math.min(rowsPerColumn, units.length - column * rowsPerColumn);
    const requested = clampGroundPosition(
      x + column * GROUND_FORMATION_X_SPACING * direction,
      50 + (row - (rowCount - 1) / 2) * GROUND_FORMATION_Y_SPACING,
    );
    const position = nearestOpenGroundPosition(
      requested.battleX,
      requested.battleY,
      occupied,
      isFlyingGroundUnit(unit) ? undefined : battle.planetId,
    );
    unit.battleX = position.battleX;
    unit.battleY = position.battleY;
    occupied.push({ id: unit.id, ...position });
  });
  deploy(battle.attackers, 12, 1);
  deploy(battle.defenders, 88, -1);
  separateGroundUnits([...battle.attackers, ...battle.defenders], battle.planetId);
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

function tickShipWeapon(unit: Unit, weaponIndex: number, seconds: number, firing: boolean) {
  const weapon = shipWeaponBatteries(unit.kind as SpaceUnitKind)[weaponIndex];
  const cooldowns = unit.weaponCooldowns ?? shipWeaponBatteries(unit.kind as SpaceUnitKind).map(() => unit.weaponCooldown ?? 0);
  const flashes = unit.weaponFlashes ?? shipWeaponBatteries(unit.kind as SpaceUnitKind).map(() => unit.weaponFlash ?? 0);
  flashes[weaponIndex] = Math.max(0, (flashes[weaponIndex] ?? 0) - seconds);
  const cooldown = Math.max(0, cooldowns[weaponIndex] ?? 0);
  if (!firing || seconds <= 0) {
    cooldowns[weaponIndex] = Math.max(0, cooldown - seconds);
    unit.weaponCooldowns = cooldowns;
    unit.weaponFlashes = flashes;
    if (weaponIndex === 0) {
      unit.weaponCooldown = cooldowns[weaponIndex];
      unit.weaponFlash = flashes[weaponIndex];
    }
    return 0;
  }
  if (cooldown > seconds) {
    cooldowns[weaponIndex] = cooldown - seconds;
    unit.weaponCooldowns = cooldowns;
    unit.weaponFlashes = flashes;
    if (weaponIndex === 0) {
      unit.weaponCooldown = cooldowns[weaponIndex];
      unit.weaponFlash = flashes[weaponIndex];
    }
    return 0;
  }
  const activeTime = seconds - cooldown;
  const followupVolleys = Math.floor((activeTime + 1e-9) / weapon.cooldown);
  const timeSinceLastVolley = Math.max(0, activeTime - followupVolleys * weapon.cooldown);
  cooldowns[weaponIndex] = Math.max(0, weapon.cooldown - timeSinceLastVolley);
  const flashDuration = Math.max(.45, Math.min(.9, weapon.cooldown * .5));
  flashes[weaponIndex] = Math.max(0, flashDuration - timeSinceLastVolley);
  unit.weaponCooldowns = cooldowns;
  unit.weaponFlashes = flashes;
  if (weaponIndex === 0) {
    unit.weaponCooldown = cooldowns[weaponIndex];
    unit.weaponFlash = flashes[weaponIndex];
  }
  return (followupVolleys + 1) * weapon.damage;
}

const moveBattleUnitToward = (unit: Unit, x: number, y: number, seconds: number, planetId: string) => {
  const dx = x - (unit.battleX ?? 0), dy = y - (unit.battleY ?? 0);
  const distance = Math.hypot(dx, dy), travel = UNITS[unit.kind].moveSpeed * seconds;
  if (!distance || !travel) return;
  const position = isFlyingGroundUnit(unit) ? {
    battleX: (unit.battleX ?? 0) + dx / distance * Math.min(distance, travel),
    battleY: (unit.battleY ?? 0) + dy / distance * Math.min(distance, travel),
  } : groundTerrainMovementStep(
    planetId,
    unit.id,
    { battleX: unit.battleX ?? 0, battleY: unit.battleY ?? 0 },
    { battleX: x, battleY: y },
    travel,
  );
  const clamped = clampGroundPosition(position.battleX, position.battleY);
  unit.battleX = clamped.battleX;
  unit.battleY = clamped.battleY;
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
    const target = targets[0];
    const damage = supportingShips.length * ORBITAL_BOMBARDMENT_DAMAGE_PER_SHIP * seconds;
    addGroundDamage(hits, target.id, damage);
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
  if (battleDistance(target, attacker) <= groundUnitVisionRange(target)) return;
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

function advanceOrFire(unit: Unit, allies: Unit[], enemies: Unit[], seconds: number, hits: Map<string, GroundHit>, planetId: string, advanceX: number, preferredId?: string, power = 1) {
  const definition = UNITS[unit.kind];
  const visibleEnemies = enemies.filter(enemy => allies.some(observer => battleDistance(observer, enemy) <= groundUnitVisionRange(observer)));
  if (unit.landedTransport) {
    tickUnitWeapon(unit, seconds, false);
    return;
  }
  const followingOrder = typeof unit.battleTargetX === 'number' && typeof unit.battleTargetY === 'number';
  if (unit.battleForceMove && followingOrder) {
    tickUnitWeapon(unit, seconds, false);
    moveBattleUnitToward(unit, unit.battleTargetX!, unit.battleTargetY!, seconds, planetId);
    if (Math.hypot(unit.battleTargetX! - (unit.battleX ?? 0), unit.battleTargetY! - (unit.battleY ?? 0)) <= .05) {
      delete unit.battleTargetX;
      delete unit.battleTargetY;
      delete unit.battleForceMove;
    }
    return;
  }
  if (unit.battleForceMove) delete unit.battleForceMove;
  let retaliationTarget = unit.battleRetaliationTargetId && enemies.find(enemy => enemy.id === unit.battleRetaliationTargetId);
  if (unit.battleRetaliationTargetId && !retaliationTarget) delete unit.battleRetaliationTargetId;
  if (!retaliationTarget && followingOrder) {
    const spottedTarget = nearestBattleTarget(unit, visibleEnemies, preferredId);
    if (spottedTarget) {
      unit.battleRetaliationTargetId = spottedTarget.id;
      delete unit.battleTargetX;
      delete unit.battleTargetY;
      retaliationTarget = spottedTarget;
    }
  }
  if (retaliationTarget) {
    if (battleDistance(unit, retaliationTarget) <= definition.range) {
      fireGroundWeapon(unit, allies, enemies, retaliationTarget, seconds, hits, power);
    } else {
      tickUnitWeapon(unit, seconds, false);
      if (!unit.battleHoldPosition) moveBattleUnitToward(unit, retaliationTarget.battleX ?? 0, retaliationTarget.battleY ?? 0, seconds, planetId);
    }
    return;
  }
  const enemiesInRange = visibleEnemies.filter(enemy => battleDistance(unit, enemy) <= definition.range);
  const targetInRange = nearestBattleTarget(unit, enemiesInRange, preferredId);
  if (targetInRange) {
    fireGroundWeapon(unit, allies, enemies, targetInRange, seconds, hits, power);
    return;
  }
  tickUnitWeapon(unit, seconds, false);
  if (unit.battleHoldPosition) return;
  if (typeof unit.battleTargetX === 'number' && typeof unit.battleTargetY === 'number') {
    moveBattleUnitToward(unit, unit.battleTargetX, unit.battleTargetY, seconds, planetId);
    return;
  }
  const target = nearestBattleTarget(unit, visibleEnemies, preferredId);
  if (!target) {
    moveBattleUnitToward(unit, advanceX, unit.battleY ?? 50, seconds, planetId);
    return;
  }
  const distance = battleDistance(unit, target);
  const travel = Math.min(definition.moveSpeed * seconds, Math.max(0, distance - definition.range * .92));
  if (!travel || !distance) return;
  const targetX = (unit.battleX ?? 0) + ((target.battleX ?? 0) - (unit.battleX ?? 0)) / distance * Math.max(0, distance - definition.range * .92);
  const targetY = (unit.battleY ?? 0) + ((target.battleY ?? 0) - (unit.battleY ?? 0)) / distance * Math.max(0, distance - definition.range * .92);
  moveBattleUnitToward(unit, targetX, targetY, seconds, planetId);
}

export function maneuverGroundUnits(input: GameState, planetId: string, unitIds: string[], battleX: number, battleY: number, forceMove = false): GameResult {
  const state = clone(input);
  const battle = state.battles.find(candidate => candidate.planetId === planetId);
  const requested = new Set(unitIds);
  const units = battle ? [...battle.attackers, ...battle.defenders].filter(unit => requested.has(unit.id) && unit.faction === 'player' && !unit.sourceBuildingId && !unit.landedTransport) : [];
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
      isFlyingGroundUnit(unit) ? undefined : battle.planetId,
    );
    unit.battleTargetX = position.battleX;
    unit.battleTargetY = position.battleY;
    occupied.push({ id: unit.id, ...position });
    delete unit.battleRetaliationTargetId;
    delete unit.battleHoldPosition;
    if (forceMove) unit.battleForceMove = true;
    else delete unit.battleForceMove;
  });
  return pass(state);
}

export function holdGroundUnits(input: GameState, planetId: string, unitIds: string[]): GameResult {
  const state = clone(input);
  const battle = state.battles.find(candidate => candidate.planetId === planetId);
  const requested = new Set(unitIds);
  const units = battle ? [...battle.attackers, ...battle.defenders]
    .filter(unit => requested.has(unit.id) && unit.faction === 'player' && !unit.sourceBuildingId && !unit.landedTransport) : [];
  if (!battle || !units.length || units.length !== requested.size) return fail(input, 'Select mobile ground units in the active battle.');
  units.forEach(unit => {
    unit.battleHoldPosition = true;
    delete unit.battleTargetX;
    delete unit.battleTargetY;
    delete unit.battleForceMove;
  });
  return pass(state);
}

function stowGroundUnit(unit: Unit) {
  const stored = { ...unit };
  delete stored.battleX; delete stored.battleY;
  delete stored.battleTargetX; delete stored.battleTargetY;
  delete stored.battleRetaliationTargetId;
  delete stored.battleHoldPosition;
  delete stored.battleForceMove;
  delete stored.weaponCooldown;
  delete stored.weaponFlash;
  return stored;
}

export function loadGroundTransport(input: GameState, planetId: string, transportId: string, unitIds: string[]): GameResult {
  const state = clone(input);
  const battle = state.battles.find(candidate => candidate.planetId === planetId);
  const sides = battle ? [battle.attackers, battle.defenders] : [];
  const side = sides.find(units => units.some(unit => unit.id === transportId));
  const transport = side?.find(unit => unit.id === transportId);
  const requested = new Set(unitIds);
  const units = side?.filter(unit => requested.has(unit.id) && unit.faction === 'player' && !unit.sourceBuildingId && !unit.landedTransport) ?? [];
  const capacity = transport ? (UNITS[transport.kind].capacity ?? 0) - (transport.cargo?.length ?? 0) : 0;
  if (!battle || !side || !transport || transport.faction !== 'player' || !transport.landedTransport || !requested.size || units.length !== requested.size) {
    return fail(input, 'Select friendly squads and a landed transport in the active battle.');
  }
  if (capacity <= 0) return fail(input, `${UNITS[transport.kind].label} has no open berths.`);
  const boarding = units.slice(0, capacity);
  const boardingIds = new Set(boarding.map(unit => unit.id));
  side.splice(0, side.length, ...side.filter(unit => !boardingIds.has(unit.id)));
  transport.cargo = [...(transport.cargo ?? []), ...boarding.map(stowGroundUnit)];
  transport.loadedUnitIds = transport.cargo.map(unit => unit.id);
  const waiting = units.length - boarding.length;
  addMessage(state, `${boarding.length} squad${boarding.length === 1 ? '' : 's'} loaded aboard ${UNITS[transport.kind].label}${waiting ? `; ${waiting} awaiting open berths` : ''}.`);
  return pass(state);
}

export function evacuateGroundTransports(input: GameState, planetId: string, transportIds: string[]): GameResult {
  const state = clone(input);
  const battle = state.battles.find(candidate => candidate.planetId === planetId);
  const p = getPlanet(state, planetId);
  const requested = new Set(transportIds);
  const combatants = battle ? [...battle.attackers, ...battle.defenders] : [];
  const transports = combatants.filter(unit => requested.has(unit.id) && unit.faction === 'player' && unit.landedTransport && (unit.cargo?.length ?? 0) > 0);
  if (!battle || !p || !requested.size || transports.length !== requested.size) return fail(input, 'Select loaded landed transports to evacuate.');
  const departingIds = new Set(transports.map(unit => unit.id));
  battle.attackers = battle.attackers.filter(unit => !departingIds.has(unit.id));
  battle.defenders = battle.defenders.filter(unit => !departingIds.has(unit.id));
  for (const transport of transports) {
    delete transport.landedTransport;
    delete transport.battleX; delete transport.battleY;
    delete transport.battleTargetX; delete transport.battleTargetY;
    delete transport.battleRetaliationTargetId;
    delete transport.battleHoldPosition;
    delete transport.battleForceMove;
    transport.orbitX = 0;
    transport.orbitY = 0;
    targetOpenOrbit(p, transport, [...p.orbitUnits, ...transports]);
    p.orbitUnits.push(transport);
  }
  addMessage(state, `${transports.length} loaded transport${transports.length === 1 ? '' : 's'} evacuated from ${p.name} to orbit.`);
  resolveGroundBattleIfDecided(state, battle);
  return pass(state);
}

function resolveGroundDefenseBuildings(p: Planet, battle: GroundBattle, survivingDefenders: Unit[]) {
  const deployedIds = new Set(battle.groundDefenseBuildingIds ?? []);
  if (!deployedIds.size) return;
  const survivingIds = new Set(survivingDefenders.map(unit => unit.sourceBuildingId).filter((id): id is string => !!id));
  const destroyed = p.buildings.some(building => building.kind === 'groundDefense' && deployedIds.has(building.id) && !survivingIds.has(building.id));
  p.buildings = p.buildings.filter(building => !deployedIds.has(building.id) || survivingIds.has(building.id));
  if (destroyed) startDefenseRebuildCooldown(p, 'groundDefense');
}

const fieldArmy = (units: Unit[]) => recoverGroundUnits(units.filter(unit => !unit.sourceBuildingId && !unit.landedTransport));

function returnLandedTransportsToOrbit(p: Planet, units: Unit[]) {
  const landed = recoverGroundUnits(units.filter(unit => unit.landedTransport));
  for (const transport of landed) {
    delete transport.landedTransport;
    transport.orbitX = 0;
    transport.orbitY = 0;
    transport.docked = true;
    p.orbitUnits = p.orbitUnits.filter(unit => unit.id !== transport.id);
    p.orbitUnits.push(transport);
  }
}

function resolveGroundBattleIfDecided(state: GameState, battle: GroundBattle) {
  if (battle.attackers.length && battle.defenders.length) return false;
  const p = getPlanet(state, battle.planetId);
  if (!p) return false;
  if (!battle.defenders.length && battle.attackers.length) {
    const attackingUnitFaction = battle.attackers[0].faction;
    const winner = battle.attackerFaction ?? (attackingUnitFaction === 'neutral' ? 'player' : attackingUnitFaction);
    resolveGroundDefenseBuildings(p, battle, []);
    returnLandedTransportsToOrbit(p, battle.attackers);
    p.owner = winner; p.groundUnits = fieldArmy(battle.attackers);
    state.battles = state.battles.filter(candidate => candidate.planetId !== battle.planetId);
    addMessage(state, winner === 'player' ? `${p.name} secured. Ground forces fully restored.` : `${p.name} has fallen to enemy ground forces.`);
  } else if (!battle.attackers.length && battle.defenders.length) {
    const winner = battle.defenders[0]?.faction ?? 'enemy';
    resolveGroundDefenseBuildings(p, battle, battle.defenders);
    returnLandedTransportsToOrbit(p, battle.defenders);
    p.owner = winner === 'neutral' ? null : winner;
    p.groundUnits = fieldArmy(battle.defenders);
    state.battles = state.battles.filter(candidate => candidate.planetId !== battle.planetId);
    addMessage(state, winner === 'player' ? `Enemy invasion of ${p.name} repelled.` : winner === 'neutral' ? `Landing on ${p.name} repelled by neutral defenders.` : `Invasion of ${p.name} repelled.`);
  }
  return true;
}

function tickBattle(state: GameState, battle: GroundBattle, seconds: number) {
  if (resolveGroundBattleIfDecided(state, battle)) return;
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
  battle.attackers.forEach(unit => advanceOrFire(unit, battle.attackers, battle.defenders, seconds, hits, battle.planetId, 88, focus(unit), power(unit)));
  battle.defenders.forEach(unit => advanceOrFire(unit, battle.defenders, battle.attackers, seconds, hits, battle.planetId, 12, focus(unit), power(unit)));
  protectGroundFormation(hits, battle.attackers);
  protectGroundFormation(hits, battle.defenders);
  const p = getPlanet(state, battle.planetId)!;
  recordOrbitalBombardment(p, battle, seconds, hits);
  separateGroundUnits([...battle.attackers, ...battle.defenders], battle.planetId);
  const applyHit = (unit: Unit) => {
    const hit = hits.get(unit.id);
    if (!hit) return unit;
    const terrainDamage = hit.damage * (!isFlyingGroundUnit(unit) && groundForestAtPosition(battle.planetId, { battleX: unit.battleX ?? 0, battleY: unit.battleY ?? 0 }) ? GROUND_FOREST_DAMAGE_MULTIPLIER : 1);
    if (!hit.retaliationTargetId) return { ...damageUnit(unit, terrainDamage), ...(hit.corrosionSeconds ? { corrodedFor: hit.corrosionSeconds } : {}) };
    const retaliating = { ...unit, battleRetaliationTargetId: hit.retaliationTargetId };
    if (!retaliating.battleForceMove) {
      delete retaliating.battleTargetX;
      delete retaliating.battleTargetY;
    }
    return { ...damageUnit(retaliating, terrainDamage), ...(hit.corrosionSeconds ? { corrodedFor: hit.corrosionSeconds } : {}) };
  };
  battle.attackers = battle.attackers.map(applyHit).filter(unit => unit.hp > 0);
  battle.defenders = battle.defenders.map(applyHit).filter(unit => unit.hp > 0);
  const survivors = new Set([...battle.attackers, ...battle.defenders].map(unit => unit.id));
  const destroyed = combatantsBefore.filter(unit => !survivors.has(unit.id));
  const survivingCombatants = [...battle.attackers, ...battle.defenders];
  harvestBattlefieldBiomass(state, destroyed, participants, `on ${p.name}`);
  harvestBattlefieldSalvage(state, destroyed, participants, survivingCombatants, `on ${p.name}`);
  resolveGroundBattleIfDecided(state, battle);
}

export interface OrbitalCombatShot {
  attackerId: string;
  attackerType: 'ship' | 'defense' | 'battery';
  targetId: string;
  targetType: 'ship' | 'defense' | 'fighter';
  faction: UnitFaction;
  damage: number;
  weaponEffect: WeaponEffect;
  weaponIndex?: number;
  weaponLabel?: string;
  mountIndex?: number;
  mountCount?: number;
  weaponRange?: number;
  damageMultiplier?: number;
  piercingFraction?: number;
}

const orbitDistance = (fromX: number, fromY: number, toX: number, toY: number) => Math.hypot(toX - fromX, toY - fromY);

export function phaseControlStackCount(combatants: Unit[], target: Unit) {
  if (!SPACE_KINDS.includes(target.kind as SpaceUnitKind)
    || !Number.isFinite(target.orbitX)
    || !Number.isFinite(target.orbitY)) return 0;
  return combatants.filter(source => source.id !== target.id
    && source.hp > 0
    && source.faction !== target.faction
    && isPhaseControlShipKind(source.kind)
    && Number.isFinite(source.orbitX)
    && Number.isFinite(source.orbitY)
    && orbitDistance(source.orbitX!, source.orbitY!, target.orbitX!, target.orbitY!) <= UNITS[source.kind].range).length;
}

function hasTierTwoPhaseLock(combatants: Unit[], target: Unit) {
  return SPACE_KINDS.includes(target.kind as SpaceUnitKind)
    && Number.isFinite(target.orbitX)
    && Number.isFinite(target.orbitY)
    && combatants.some(source => source.id !== target.id
    && source.hp > 0
    && source.faction !== target.faction
    && blocksPhaseGate(source.kind)
    && Number.isFinite(source.orbitX)
    && Number.isFinite(source.orbitY)
    && orbitDistance(source.orbitX!, source.orbitY!, target.orbitX!, target.orbitY!) <= UNITS[source.kind].range);
}

function phaseFieldUnitsForFleet(state: GameState, fleet: Fleet) {
  const origin = getPlanet(state, fleet.originId);
  const candidates = [
    ...(origin?.orbitUnits ?? []),
    ...state.fleets.filter(other => other.originId === fleet.originId && (other.phase === 'exiting' || other.phase === 'charging')).map(other => other.unit),
  ];
  return [...new Map(candidates.map(unit => [unit.id, unit])).values()];
}

export const fleetPhaseControlStackCount = (state: GameState, fleet: Fleet) =>
  phaseControlStackCount(phaseFieldUnitsForFleet(state, fleet), fleet.unit);

export const phaseGateBlocked = (_state: GameState, fleet: Fleet) =>
  fleet.phase === 'charging' && !!fleet.phaseGateLocked;

export function orbitalCombatShots(p: Planet): OrbitalCombatShot[] {
  const shots: OrbitalCombatShot[] = [];
  const defenses = p.buildings.filter(building => building.kind === 'spaceDefense' && isBuildingOperational(building));
  const batteries = p.buildings.filter(building => building.kind === 'antiSpaceDefense' && isBuildingOperational(building));
  const combatants = p.orbitUnits;
  const factions = new Set(combatants.map(unit => unit.faction));
  const hasHostileInstallations = !!p.owner && combatants.some(unit => unit.faction !== p.owner) && (defenses.length > 0 || batteries.length > 0);
  if (factions.size < 2 && !hasHostileInstallations) return shots;
  const hostileShipsByFaction = new Map<UnitFaction, Unit[]>();
  for (const faction of factions) hostileShipsByFaction.set(faction, combatants.filter(unit => unit.faction !== faction));
  const defensePosition = (defense: Building) => orbitalDefenseOffset(defenses.findIndex(item => item.id === defense.id), defenses.length);
  const shipPosition = (ship: Unit) => ({ x: ship.orbitX ?? 0, y: ship.orbitY ?? 0 });

  for (const attacker of combatants) {
    const faction = attacker.faction;
    const hostileShips = hostileShipsByFaction.get(faction) ?? [];
    // Anti-Space Batteries are protected surface emplacements. Ships can target
    // armed orbital platforms, but cannot fire through the planet to destroy a
    // ground-based battery.
    const hostileDefenses = faction !== 'neutral' && p.owner && p.owner !== faction ? defenses : [];
    const focusId = faction === 'player' ? p.orbitFocusTargetId : faction === 'enemy' ? p.enemyOrbitFocusTargetId : faction === 'neutral' ? undefined : p.orbitFocusTargetIds?.[faction];
    const preferredDefense = hostileDefenses.find(defense => defense.id === focusId);
    const attackerPosition = shipPosition(attacker);
    const ability = UNITS[attacker.kind].ability?.kind;
    const fighterWing = UNITS[attacker.kind].fighterWing;
    shipWeaponBatteries(attacker.kind as SpaceUnitKind).forEach((weapon, weaponIndex) => {
      const weaponRange = weapon.range * titanWeaponRangeMultiplier(attacker);
      const shipInRange = (target: Unit) => {
        const to = shipPosition(target);
        return orbitDistance(attackerPosition.x, attackerPosition.y, to.x, to.y) <= weaponRange;
      };
      const defenseInRange = (defense: Building) => {
        const target = defensePosition(defense);
        return orbitDistance(attackerPosition.x, attackerPosition.y, target.x, target.y) <= weaponRange;
      };
      const emit = (targetId: string, targetType: OrbitalCombatShot['targetType'], damageMultiplier = 1, piercingFraction = 0) => {
        const effectiveDamageMultiplier = damageMultiplier * titanWeaponDamageMultiplier(attacker);
        for (let mountIndex = 0; mountIndex < weapon.mounts; mountIndex += 1) {
          shots.push({
            attackerId: attacker.id,
            attackerType: 'ship',
            targetId,
            targetType,
            faction,
            damage: weapon.damage,
            weaponEffect: weapon.effect,
            weaponIndex,
            weaponLabel: weapon.label,
            mountIndex,
            mountCount: weapon.mounts,
            weaponRange,
            damageMultiplier: effectiveDamageMultiplier,
            ...(piercingFraction ? { piercingFraction } : {}),
          });
        }
      };
      const fighterWeapon = !!fighterWing && weaponIndex === 0;
      if (fighterWeapon && carrierFighterCount(attacker) <= 0) return;
      const vulnerableTarget = hostileShips.find(target => (target.pendingLanding || target.pendingEmbark) && shipInRange(target));
      const defenseTarget = preferredDefense && defenseInRange(preferredDefense)
        ? preferredDefense
        : hostileDefenses.find(defenseInRange);
      const initialShipTarget = vulnerableTarget ?? (defenseTarget ? undefined : hostileShips.find(shipInRange));
      const ward = initialShipTarget && hostileShips.find(target => target.id !== initialShipTarget.id
        && target.faction === initialShipTarget.faction
        && UNITS[target.kind].ability?.kind === 'wardInterception'
        && orbitDistance(target.orbitX ?? 0, target.orbitY ?? 0, initialShipTarget.orbitX ?? 0, initialShipTarget.orbitY ?? 0) <= AEGIS_WARD_INTERCEPTION_RANGE
        && shipInRange(target));
      const shipTarget = ward ?? initialShipTarget;
      const fighterTarget = ability === 'antiFighterCannons' && weaponIndex === 0
        ? hostileShips.find(target => carrierFighterCount(target) > 0 && shipInRange(target))
        : undefined;
      if (fighterTarget) {
        emit(fighterTarget.id, 'fighter', ANTI_FIGHTER_DAMAGE_MULTIPLIER);
        return;
      }
      if (shipTarget) {
        const transportMultiplier = ability === 'transportHunter' && (shipTarget.cargo?.length ?? 0) > 0 ? 1.5 : 1;
        const targetPosition = shipPosition(shipTarget);
        const distance = orbitDistance(attackerPosition.x, attackerPosition.y, targetPosition.x, targetPosition.y);
        const rangeMultiplier = ability === 'rangeCalibration' && weaponIndex === 0 ? 1 + .7 * Math.min(1, distance / weaponRange) : 1;
        const focusMultiplier = ability === 'focusFire' && weaponIndex === 0 && shipTarget.hp < shipTarget.maxHp ? 1.5 : 1;
        emit(shipTarget.id, 'ship', transportMultiplier * rangeMultiplier * focusMultiplier, ability === 'shieldPiercing' && weaponIndex === 0 ? .5 : 0);
        if ((ability === 'spawnCloud' || ability === 'fabricatorSwarm') && weaponIndex === 0) {
          const secondary = hostileShips.find(target => target.id !== shipTarget.id && shipInRange(target));
          if (secondary) emit(secondary.id, 'ship', .5);
        }
        if (ability === 'sovereignBarrage' && weaponIndex === 0) {
          hostileShips.filter(target => target.id !== shipTarget.id && target.faction === shipTarget.faction && shipInRange(target)
            && orbitDistance(target.orbitX ?? 0, target.orbitY ?? 0, targetPosition.x, targetPosition.y) <= 140)
            .forEach(target => emit(target.id, 'ship', .35));
        }
      } else if (defenseTarget) {
        emit(defenseTarget.id, 'defense', weaponIndex === 0 && (ability === 'planetCracker' || ability === 'dismantlerBeam') ? 2 : 1);
      }
    });
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
  const defenses = p.buildings.filter(b => b.kind === 'spaceDefense' && isBuildingOperational(b));
  defenses.forEach(ensureOrbitalDefenseHealth);
  const shots = orbitalCombatShots(p);
  if (!shots.length) {
    p.orbitUnits.forEach(unit => {
      const effectiveSeconds = seconds * phaseControlRateMultiplier(phaseControlStackCount(p.orbitUnits, unit));
      shipWeaponBatteries(unit.kind as SpaceUnitKind)
        .forEach((_, weaponIndex) => tickShipWeapon(unit, weaponIndex, effectiveSeconds, false));
    });
    return;
  }
  const combatantsBefore = [...p.orbitUnits];
  const participants = battlefieldFactions(combatantsBefore);
  const vulnerableShipsBeforeCombat = new Map(p.orbitUnits.filter(unit => unit.pendingLanding || unit.pendingEmbark).map(unit => [unit.id, unit]));
  const installationScale = seconds * 0.18 * SPACE_COMBAT_DAMAGE_MULTIPLIER;
  const enemyPower = enemyDifficultyMultiplier(state.config.difficulty);
  const shipDamage = new Map<string, { damage: number; piercingDamage: number }>();
  const fighterDamage = new Map<string, number>();
  const defenseDamage = new Map<string, number>();
  const shipShots = new Map<string, OrbitalCombatShot[]>();
  shots.filter(shot => shot.attackerType === 'ship').forEach(shot => shipShots.set(shot.attackerId, [...(shipShots.get(shot.attackerId) ?? []), shot]));
  const devourHealing = new Map<string, number>();
  p.orbitUnits.forEach(unit => {
    const attackerShots = shipShots.get(unit.id) ?? [];
    const fighterWing = UNITS[unit.kind].fighterWing;
    const hasSynapse = p.orbitUnits.some(ally => ally.faction === unit.faction && UNITS[ally.kind].ability?.kind === 'orbitalSynapse'
      && orbitDistance(unit.orbitX ?? 0, unit.orbitY ?? 0, ally.orbitX ?? 0, ally.orbitY ?? 0) <= 240);
    const factionScale = (unit.faction !== 'neutral' && state.aiFactions?.includes(unit.faction) ? enemyPower : 1) * (hasSynapse ? 1.25 : 1)
      * (unit.faction === 'neutral' ? 1 : orbitalDamageMultiplier(empireEconomy(state, unit.faction).completedResearch))
      * (unit.faction !== 'neutral' && controlsAncientRelic(state, unit.faction) ? ANCIENT_RELIC_DAMAGE_MULTIPLIER : 1);
    const effectiveSeconds = seconds * phaseControlRateMultiplier(phaseControlStackCount(p.orbitUnits, unit));
    shipWeaponBatteries(unit.kind as SpaceUnitKind).forEach((_, weaponIndex) => {
      const weaponShots = attackerShots.filter(shot => shot.weaponIndex === weaponIndex);
      const perMountDamage = tickShipWeapon(unit, weaponIndex, effectiveSeconds, weaponShots.length > 0);
      if (!weaponShots.length || !perMountDamage) return;
      const fighterScale = fighterWing && weaponIndex === 0 ? carrierFighterCount(unit) / fighterWing.capacity : 1;
      if (fighterWing && weaponIndex === 0) applyCarrierFighterAttrition(unit, seconds);
      weaponShots.forEach(shot => {
        const damage = perMountDamage * fighterScale * SPACE_COMBAT_DAMAGE_MULTIPLIER * factionScale * (shot.damageMultiplier ?? 1);
        if (shot.targetType === 'ship') {
          const current = shipDamage.get(shot.targetId) ?? { damage: 0, piercingDamage: 0 };
          current.damage += damage;
          current.piercingDamage += damage * (shot.piercingFraction ?? 0);
          shipDamage.set(shot.targetId, current);
        } else if (shot.targetType === 'defense') {
          defenseDamage.set(shot.targetId, (defenseDamage.get(shot.targetId) ?? 0) + damage);
        } else {
          fighterDamage.set(shot.targetId, (fighterDamage.get(shot.targetId) ?? 0) + damage);
        }
        if (UNITS[unit.kind].ability?.kind === 'devour') devourHealing.set(unit.id, (devourHealing.get(unit.id) ?? 0) + damage * .2);
      });
    });
  });
  shots.filter(shot => shot.attackerType !== 'ship').forEach(shot => {
    const damage = shot.damage * installationScale * (shot.faction !== 'neutral' && state.aiFactions?.includes(shot.faction) ? enemyPower : 1)
      * (shot.faction === 'neutral' ? 1 : orbitalDamageMultiplier(empireEconomy(state, shot.faction).completedResearch))
      * (shot.faction !== 'neutral' && controlsAncientRelic(state, shot.faction) ? ANCIENT_RELIC_DAMAGE_MULTIPLIER : 1);
    const current = shipDamage.get(shot.targetId) ?? { damage: 0, piercingDamage: 0 };
    current.damage += damage;
    shipDamage.set(shot.targetId, current);
  });
  p.orbitUnits = p.orbitUnits.map(unit => {
    const incoming = shipDamage.get(unit.id);
    const incomingFighterDamage = fighterDamage.get(unit.id) ?? 0;
    const wing = UNITS[unit.kind].fighterWing;
    const fighterCount = carrierFighterCount(unit);
    const totalFighterDamage = (unit.fighterDamage ?? 0) + incomingFighterDamage;
    const fighterLosses = wing && fighterCount ? Math.min(fighterCount, Math.floor(totalFighterDamage / FIGHTER_HIT_POINTS)) : 0;
    const survivingFighters = fighterCount - fighterLosses;
    const fighterDamaged = wing ? {
      ...unit,
      fighterCount: survivingFighters,
      fighterDamage: survivingFighters ? totalFighterDamage - fighterLosses * FIGHTER_HIT_POINTS : 0,
      fighterBuildProgress: fighterLosses ? 0 : unit.fighterBuildProgress ?? 0,
    } : unit;
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
    const regenerated = projected ? { ...fighterDamaged, shields: Math.min(fighterDamaged.maxShields, fighterDamaged.shields + seconds * 10) } : fighterDamaged;
    const approachScale = UNITS[unit.kind].ability?.kind === 'armoredApproach' && (unit.pendingLanding || unit.pendingEmbark) ? .55 : 1;
    const protectionScale = (projected ? .7 : 1) * approachScale;
    const damaged = incoming ? damageUnitPiercing(regenerated, incoming.damage * protectionScale, incoming.damage > 0 ? incoming.piercingDamage / incoming.damage : 0) : regenerated;
    const healing = (devourHealing.get(unit.id) ?? 0) + (repaired ? seconds * 6 : 0) + (assemblyRepair ? seconds * 4 : 0) + (foundryRepair ? seconds * 7 : 0);
    return healing && damaged.hp > 0 ? { ...damaged, hp: Math.min(damaged.maxHp, damaged.hp + healing) } : damaged;
  });
  const defenseProtection = p.owner ? 1 / defenseDurabilityMultiplier(empireEconomy(state, p.owner).completedResearch) : 1;
  p.buildings = p.buildings.map(building => defenseDamage.has(building.id) ? damageBuilding(building, defenseDamage.get(building.id)! * defenseProtection) : building);

  const destroyedDefenses = p.buildings.filter(building => (building.kind === 'spaceDefense' || building.kind === 'antiSpaceDefense') && building.hp! <= 0);
  if (destroyedDefenses.length) {
    const destroyedIds = new Set(destroyedDefenses.map(building => building.id));
    const orbitalDefenseCount = destroyedDefenses.filter(building => building.kind === 'spaceDefense').length;
    const batteryCount = destroyedDefenses.filter(building => building.kind === 'antiSpaceDefense').length;
    if (orbitalDefenseCount) startDefenseRebuildCooldown(p, 'spaceDefense');
    if (batteryCount) startDefenseRebuildCooldown(p, 'antiSpaceDefense');
    p.buildings = p.buildings.filter(building => !destroyedIds.has(building.id));
    if (p.orbitFocusTargetId && destroyedIds.has(p.orbitFocusTargetId)) delete p.orbitFocusTargetId;
    if (orbitalDefenseCount) addMessage(state, `${orbitalDefenseCount} orbital defense platform${orbitalDefenseCount === 1 ? '' : 's'} destroyed at ${p.name}.`);
    if (batteryCount) addMessage(state, `${batteryCount} anti-space batter${batteryCount === 1 ? 'y' : 'ies'} destroyed at ${p.name}.`);
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

function tickSpecialSystem(state: GameState, system: Planet, seconds: number) {
  if (systemKind(system) === 'star' && system.orbitUnits.length) {
    const before = [...system.orbitUnits];
    system.orbitUnits = system.orbitUnits
      .map(ship => damageUnit(ship, STELLAR_HAZARD_DAMAGE_PER_SECOND * seconds))
      .filter(ship => ship.hp > 0);
    const destroyed = before.filter(ship => !system.orbitUnits.some(survivor => survivor.id === ship.id));
    if (destroyed.length) addMessage(state, `${destroyed.length} ship${destroyed.length === 1 ? '' : 's'} consumed by ${system.name}.`);
  }
  if (systemKind(system) !== 'ancientTemple') return;
  const occupiers = [...new Set(system.orbitUnits.filter(ship => ship.faction !== 'neutral').map(ship => ship.faction as EmpireFaction))];
  const nextOwner = occupiers.length === 1 ? occupiers[0] : null;
  if (nextOwner === system.owner) return;
  const previousOwner = system.owner;
  system.owner = nextOwner;
  if (nextOwner === 'player') addMessage(state, `RELIC AWAKENED — ${system.name} grants +50% income and +25% fleet damage.`);
  else if (previousOwner === 'player') addMessage(state, `RELIC LOST — control of ${system.name} has been broken.`);
}

function turnShipTowardVector(ship: Unit, dx: number, dy: number, seconds: number) {
  const current = ship.heading ?? 0;
  const target = headingForVector(dx, dy, current);
  const turnDegrees = Math.abs(shortestHeadingDelta(current, target));
  const availableSeconds = Math.max(0, seconds);
  ship.heading = turnHeadingToward(
    current,
    target,
    SHIP_TURN_RATE_DEGREES_PER_SECOND * availableSeconds,
  );
  return Math.min(availableSeconds, turnDegrees / SHIP_TURN_RATE_DEGREES_PER_SECOND);
}

function tickOrbitUnitMovement(p: Planet, ship: Unit, seconds: number) {
  if (typeof ship.orbitTargetX !== 'number' || typeof ship.orbitTargetY !== 'number') return;
  const currentX = ship.orbitX ?? 0, currentY = ship.orbitY ?? 0;
  const dx = ship.orbitTargetX - currentX, dy = ship.orbitTargetY - currentY;
  const turnSeconds = turnShipTowardVector(ship, dx, dy, seconds);
  const movementSeconds = Math.max(0, seconds - turnSeconds);
  const movementMultiplier = shipMovementSpeedMultiplier(ship.kind)
    * phaseControlRateMultiplier(phaseControlStackCount(p.orbitUnits, ship));
  const distance = Math.hypot(dx, dy), step = (ship.pendingLanding || ship.pendingEmbark ? LANDING_APPROACH_SPEED : ORBIT_MANEUVER_SPEED) * movementSeconds * movementMultiplier;
  if (distance <= step || distance === 0) {
    ship.orbitX = ship.orbitTargetX; ship.orbitY = ship.orbitTargetY;
    delete ship.orbitTargetX; delete ship.orbitTargetY;
    if (!ship.pendingLanding) delete ship.phaseArrival;
  } else {
    ship.orbitX = currentX + dx / distance * step;
    ship.orbitY = currentY + dy / distance * step;
  }
}

function directAiOrbitalShips(state: GameState, p: Planet) {
  const aiFactions = new Set<EmpireFaction>(state.mode === 'competitive' ? state.aiFactions ?? [] : ['enemy']);
  for (const ship of p.orbitUnits) {
    if (ship.faction === 'neutral' || !aiFactions.has(ship.faction) || ship.pendingLanding || ship.pendingEmbark
      || typeof ship.orbitTargetX === 'number' || typeof ship.orbitTargetY === 'number') continue;
    const hostileShips = p.orbitUnits.filter(target => target.faction !== 'neutral' && target.faction !== ship.faction);
    const hostileInstallations = p.owner && p.owner !== ship.faction
      ? p.buildings.filter(building => building.kind === 'spaceDefense' && isBuildingOperational(building)).map((building, index, defenses) => orbitalDefenseOffset(index, defenses.length))
      : [];
    const targets = [
      ...hostileShips.map(target => ({ x: target.orbitX ?? 0, y: target.orbitY ?? 0 })),
      ...hostileInstallations,
    ].sort((a, b) => orbitDistance(ship.orbitX ?? 0, ship.orbitY ?? 0, a.x, a.y) - orbitDistance(ship.orbitX ?? 0, ship.orbitY ?? 0, b.x, b.y));
    if (targets.some(target => orbitDistance(ship.orbitX ?? 0, ship.orbitY ?? 0, target.x, target.y) <= UNITS[ship.kind].range)) continue;
    if (!targets.length) {
      if (Math.hypot(ship.orbitX ?? 0, ship.orbitY ?? 0) >= MAX_SHIP_ORBIT_RADIUS - 24) targetOpenOrbit(p, ship);
      continue;
    }
    const occupied = p.orbitUnits.filter(other => other.id !== ship.id && !other.docked).flatMap(other => {
      const x = other.orbitTargetX ?? other.orbitX, y = other.orbitTargetY ?? other.orbitY;
      return typeof x === 'number' && typeof y === 'number' ? [{ orbitX: x, orbitY: y }] : [];
    });
    occupied.push(...hostileInstallations.map(position => ({ orbitX: position.x, orbitY: position.y })));
    const position = nearestOpenOrbitPosition(targets[0].x, targets[0].y, occupied);
    delete ship.docked;
    ship.orbitTargetX = position.x;
    ship.orbitTargetY = position.y;
    ship.heading ??= 0;
  }
}

function tickOrbitMovement(p: Planet, seconds: number) {
  for (const ship of p.orbitUnits) tickOrbitUnitMovement(p, ship, seconds);
}

function resolveLandingApproaches(state: GameState, p: Planet) {
  for (const ship of p.orbitUnits.filter(unit => unit.pendingLanding && typeof unit.orbitTargetX !== 'number' && typeof unit.orbitTargetY !== 'number')) {
    delete ship.pendingLanding;
    delete ship.phaseArrival;
    const joinedBattle = unloadTransport(state, p, ship);
    if (joinedBattle) {
      addMessage(state, `${UNITS[ship.kind].label} landed and deployed troops onto the battlefield at ${p.name}.`);
    } else {
      ship.orbitX = 0;
      ship.orbitY = 0;
      ship.docked = true;
      addMessage(state, `${UNITS[ship.kind].label} docked after completing its landing approach at ${p.name}.`);
    }
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
  let strategicActionRan = false;
  for (let actions = 0; view.enemyActionClock <= 0 && actions < 32; actions += 1) {
    runEnemyStrategicAction(view);
    strategicActionRan = true;
    view.enemyActionClock += actionInterval;
  }
  view.enemyAttackClock -= seconds;
  if (view.enemyAttackClock <= 0) {
    launchEnemyMission(view);
    launchEnemyCombatFleets(view);
    view.enemyAttackClock += attackInterval;
  } else if (strategicActionRan) {
    launchEnemyCombatFleets(view);
    launchEnemyMission(view, true);
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
    || (isDefenseBuildingKind(kind) && (p.defenseRebuildCooldowns?.[kind] ?? 0) > 0)
    || !enemyHasResearch(state, def.requires) || !canEnemyAfford(state, def.cost)) return false;
  spendEnemyResources(state, def.cost);
  const building: Building = {
    id: `eb${state.nextId++}`, kind,
    ...(isDefenseBuildingKind(kind) ? { constructionRemaining: def.time!, constructionTotal: def.time! } : {}),
  };
  if (isSpaceYard(building)) building.spaceQueue = [];
  ensureOrbitalDefenseHealth(building);
  p.buildings.push(building);
  if (isSpaceYard(building)) rebalanceSpaceYardQueues(p);
  return true;
}

function enemyQueueUnit(state: GameState, p: Planet, kind: UnitKind, yard?: Building) {
  const def = UNITS[kind];
  if (!unitAvailableToCivilization(kind, empireCivilization(state, 'enemy')) || !enemyHasResearch(state, def.requires) || !canEnemyAfford(state, def.cost)) return false;
  if (def.factory === 'ground') {
    if (!p.buildings.some(building => building.kind === 'groundFactory' || building.kind === 'advancedGroundFactory')) return false;
    if (def.advancedFactory && !p.buildings.some(building => building.kind === 'advancedGroundFactory')) return false;
    spendEnemyResources(state, def.cost);
    p.groundQueue.push({ id: `eq${state.nextId++}`, kind, remaining: def.time!, total: def.time! });
    return true;
  }
  if (!yard || !spaceYardCanProduce(yard, kind) || (isTitanKind(kind) && factionHasTitan(state, 'enemy'))) return false;
  spendEnemyResources(state, def.cost);
  yard.spaceQueue ??= [];
  yard.spaceQueue.push({ id: `eq${state.nextId++}`, kind, remaining: def.time!, total: def.time! });
  return true;
}

function advanceEnemyResearch(state: GameState) {
  if (!state.planets.some(p => p.owner === 'enemy' && p.buildings.some(building => building.kind === 'researchLab'))) return;
  const civilization = empireCivilization(state, 'enemy');
  const tree = researchTreeForCivilization(civilization);
  const candidates = tree.nodes.filter(node => !isRepeatableResearch(node.id) && !state.enemyCompletedResearch.includes(node.id));
  const eligible = candidates.filter(node => enemyHasResearch(state, tree.requires[node.id]));
  const id = eligible.find(node => state.elapsed >= 70 + tree.nodes.indexOf(node) * 13 && canEnemyAfford(state, RESEARCH[node.id].cost))?.id;
  if (!id) return;
  const def = RESEARCH[id];
  spendEnemyResources(state, def.cost);
  state.enemyCompletedResearch.push(id);
}

function runEnemyStrategicAction(state: GameState) {
  advanceEnemyResearch(state);
  const civilization = empireCivilization(state, 'enemy');
  const groundKind = (kind: GroundUnitKind) => civilizationUnitKind(civilization, kind) as GroundUnitKind;
  const spaceKind = (kind: SpaceUnitKind) => civilizationUnitKind(civilization, kind) as SpaceUnitKind;
  const colonies = state.planets.filter(p => isColonizableWorld(p) && p.owner === 'enemy' && !state.battles.some(battle => battle.planetId === p.id));
  const urgentCarrierOrigins = new Set(enemyOrbitalBeachheads(state).flatMap(target => {
    const nearest = colonies.flatMap(origin => {
      const path = findPlanetPath(state.planets, origin.id, target.id);
      return path && spaceYards(origin).length ? [{ origin, distance: path.slice(1).reduce((sum, id, index) => {
        const from = getPlanet(state, path[index])!, to = getPlanet(state, id)!;
        return sum + Math.hypot(to.x - from.x, to.y - from.y);
      }, 0) }] : [];
    }).sort((a, b) => a.distance - b.distance || a.origin.id.localeCompare(b.origin.id))[0];
    return nearest ? [nearest.origin.id] : [];
  }));
  const forceTarget = state.config.difficulty === 'cadet' ? 4 : state.config.difficulty === 'admiral' ? 8 : 6;
  for (const p of colonies) {
    const priorities: Array<[BuildingKind, number]> = [
      ['metalMine', 2], ['crystalMine', 2], ['goldMine', 2], ['groundFactory', 2], ['spaceFactory', 2],
      ['groundDefense', 1], ['spaceDefense', 1], ['antiSpaceDefense', 1], ['researchLab', 1],
      ['advancedGroundFactory', 1], ['advancedSpaceFactory', 1], ['experimentalSpaceFactory', 1],
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

    const transportTarget = (state.config.difficulty === 'cadet' ? 2 : state.config.difficulty === 'admiral' ? 4 : 3)
      + (urgentCarrierOrigins.has(p.id) ? 1 : 0);
    for (const yard of spaceYards(p)) {
      if (yard.spaceQueue?.length) continue;
      const queuedKinds = spaceYards(p).flatMap(other => other.spaceQueue ?? []).map(item => item.kind);
      const localShips = [...p.orbitUnits, ...state.fleets.filter(fleet => fleet.faction === 'enemy' && fleet.originId === p.id).map(fleet => fleet.unit)];
      const carrierCount = [...localShips.map(ship => ship.kind), ...queuedKinds].filter(kind => (UNITS[kind].capacity ?? 0) > 0).length;
      const needsCarrier = carrierCount < transportTarget;
      const hasFlakFrigate = [...localShips.map(ship => ship.kind), ...queuedKinds].some(isFlakFrigateKind);
      const hasReconShip = [...localShips.map(ship => ship.kind), ...queuedKinds].some(kind => UNITS[kind].ability?.kind === 'reconDrive');
      const hasTierOnePhaseShip = [...localShips.map(ship => ship.kind), ...queuedKinds].some(kind => isPhaseControlShipKind(kind) && UNITS[kind].spaceTier === 1);
      const hasTierTwoPhaseShip = [...localShips.map(ship => ship.kind), ...queuedKinds].some(kind => isPhaseControlShipKind(kind) && UNITS[kind].spaceTier === 2);
      let desired: SpaceUnitKind;
      if (yard.kind === 'spaceFactory') {
        desired = needsCarrier ? spaceKind('transport')
          : !hasFlakFrigate ? spaceKind('flakFrigate')
            : !hasReconShip ? spaceKind('reconCutter')
              : !hasTierOnePhaseShip ? spaceKind('phaseSuppressionFrigate')
                : spaceKind(state.nextId % 2 ? 'missileFrigate' : 'escortFrigate');
      } else if (yard.kind === 'advancedSpaceFactory') {
        const advancedLine: SpaceUnitKind[] = ['advancedEscortFrigate', 'advancedMissileFrigate'];
        desired = needsCarrier ? spaceKind('advancedTransport')
          : !hasFlakFrigate ? spaceKind('advancedFlakFrigate')
            : !hasTierTwoPhaseShip ? spaceKind('phaseLockCruiser')
              : spaceKind(advancedLine[state.nextId % advancedLine.length]);
      } else {
        const titan = spaceKind('dreadnought');
        const capital = spaceKind('battlecruiser');
        if (state.enemyCompletedResearch.includes('carrierOperations') && needsCarrier) desired = spaceKind('assaultCarrier');
        else if (state.enemyCompletedResearch.includes('titanEngineering') && !factionHasTitan(state, 'enemy')) desired = titan;
        else if (isTitanKind(capital)) desired = spaceKind('assaultCarrier');
        else desired = capital;
      }
      enemyQueueUnit(state, p, desired, yard);
    }
  }
}

function launchEnemyMission(state: GameState, urgentOnly = false) {
  const hostilePlanets = state.planets.filter(p => isColonizableWorld(p) && p.owner !== null && p.owner !== 'enemy');
  const reservedTargets = new Set(state.fleets.filter(fleet => fleet.faction === 'enemy').map(fleet => fleet.finalDestinationId ?? fleet.destinationId));
  const neutralPlanets = state.planets.filter(p => isColonizableWorld(p) && p.owner === null && !reservedTargets.has(p.id) && !state.battles.some(battle => battle.planetId === p.id));
  const urgentTargets = enemyOrbitalBeachheads(state);
  if ((!hostilePlanets.length && !neutralPlanets.length) || (urgentOnly && !urgentTargets.length)) return;
  const preferExpansion = neutralPlanets.length > 0 && (state.enemyMissionCount % 3 !== 2 || !hostilePlanets.length);
  const preferredTargets = preferExpansion ? neutralPlanets : hostilePlanets;
  const fallbackTargets = preferExpansion ? hostilePlanets : neutralPlanets;
  const candidatesFor = (targets: Planet[]) => state.planets.flatMap(origin => {
    if (origin.owner !== 'enemy' || origin.groundUnits.length < 2 || state.battles.some(battle => battle.planetId === origin.id)) return [];
    const availableCarriers = origin.orbitUnits.filter(ship => ship.faction === 'enemy' && (UNITS[ship.kind].capacity ?? 0) > 0)
      .sort((a, b) => (b.cargo?.length ?? 0) - (a.cargo?.length ?? 0) || (UNITS[b.kind].capacity ?? 0) - (UNITS[a.kind].capacity ?? 0) || a.id.localeCompare(b.id));
    if (!availableCarriers.length) return [];
    return targets.flatMap(target => {
      const path = findPlanetPath(state.planets, origin.id, target.id);
      const transportLimit = target.owner === null ? 1 : state.config.difficulty === 'cadet' ? 2 : state.config.difficulty === 'admiral' ? 4 : 3;
      const loadedCarriers = availableCarriers.filter(carrier => (carrier.cargo?.length ?? 0) > 0).length;
      const carrierCount = Math.min(transportLimit, availableCarriers.length, origin.groundUnits.length + loadedCarriers);
      const carriers = availableCarriers.slice(0, Math.max(1, carrierCount));
      return path ? [{ origin, target, carriers, distance: path.slice(1).reduce((sum, id, index) => {
        const from = getPlanet(state, path[index])!, to = getPlanet(state, id)!;
        return sum + Math.hypot(to.x - from.x, to.y - from.y);
      }, 0) }] : [];
    });
  }).sort((a, b) => a.distance - b.distance);
  const mission = candidatesFor(urgentTargets)[0]
    ?? (urgentOnly ? undefined : candidatesFor(preferredTargets)[0] ?? candidatesFor(fallbackTargets)[0]);
  if (!mission) return;
  const warships = mission.origin.orbitUnits.filter(ship => ship.faction === 'enemy' && !UNITS[ship.kind].capacity);
  const escorts = warships.slice(0, Math.max(0, warships.length - enemyDefensiveReserve(warships.length, state.config.difficulty)));
  for (const carrier of mission.carriers) {
    if ((carrier.cargo?.length ?? 0) > 0) continue;
    const squad = mission.origin.groundUnits.find(unit => unit.faction === 'enemy');
    if (!squad) break;
    mission.origin.groundUnits = mission.origin.groundUnits.filter(unit => unit.id !== squad.id);
    carrier.cargo = [squad];
    carrier.loadedUnitIds = [squad.id];
  }
  if (dispatchFactionUnits(state, mission.origin, [...mission.carriers, ...escorts], mission.target, 'enemy')) {
    state.enemyMissionCount += 1;
    addMessage(state, mission.target.owner === null
      ? `HOSTILE EXPANSION FLEET — ${mission.target.name} targeted for colonization.`
      : `HOSTILE FLEET LAUNCHED — ${mission.carriers.length} loaded transport${mission.carriers.length === 1 ? '' : 's'} and ${escorts.length} warship${escorts.length === 1 ? '' : 's'} attacking ${mission.target.name}.`);
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
  state.fleets = state.fleets.map(fleet => {
    const completed = empireEconomy(state, fleet.faction).completedResearch;
    return { ...fleet, unit: recoverCarrierFighters(recoverSpaceUnit(fleet.unit, false, seconds, empireCivilization(state, fleet.faction), shieldRecoveryMultiplier(completed), hullRecoveryMultiplier(completed)), seconds) };
  });
  state.fleets.forEach(fleet => syncDepartingFleetPosition(state, fleet));
  for (const p of state.planets) {
    advanceDefenseConstruction(state, p, seconds);
    ensureOrbitPositions(p);
    directAiOrbitalShips(state, p);
    if (p.owner && isColonizableWorld(p)) {
      const economy = empireEconomy(state, p.owner);
      const aiScale = state.aiFactions?.includes(p.owner) && state.mode !== 'competitive' ? enemyDifficultyMultiplier(state.config.difficulty) * .62 : .7;
      const relicScale = controlsAncientRelic(state, p.owner) ? ANCIENT_RELIC_ECONOMY_MULTIPLIER : 1;
      const incomeScale = aiScale * researchIncomeMultiplier(economy.completedResearch) * relicScale;
      if (usesBiomass(state, p.owner)) {
        economy.resources.biomass = (economy.resources.biomass ?? 0) + seconds * BROOD_BIOMASS_PER_PLANET * researchIncomeMultiplier(economy.completedResearch) * relicScale;
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
    p.orbitUnits = p.orbitUnits.map(u => {
      const completed = u.faction === 'neutral' ? [] : empireEconomy(state, u.faction).completedResearch;
      return recoverCarrierFighters(recoverSpaceUnit(u, isColonizableWorld(p) && p.owner === u.faction, seconds, u.faction === 'neutral' ? 'human' : empireCivilization(state, u.faction), shieldRecoveryMultiplier(completed), hullRecoveryMultiplier(completed)), seconds);
    });
    p.buildings = p.buildings.map(building => recoverOrbitalDefense(building, seconds));
    const stagedFleetIds = stageDepartingFleetsForCombat(state, p);
    tickOrbitCombat(state, p, seconds);
    tickSpecialSystem(state, p, seconds);
    restoreDepartingFleetsAfterCombat(state, p, stagedFleetIds);
  }

  if (state.researchQueue.length) {
    state.researchQueue[0].remaining -= seconds * researchSpeedMultiplier(state);
    if (state.researchQueue[0].remaining <= 0) {
      const done = state.researchQueue.shift()!; state.completedResearch.push(done.id);
      const definition = researchDefinitionForCivilization(done.id, empireCivilization(state));
      addMessage(state, `${definition.label}${isRepeatableResearch(done.id) ? ` level ${researchLevel(state.completedResearch, done.id)}` : ''} research complete.`);
    }
  }

  for (const faction of EMPIRE_FACTIONS.filter(faction => faction !== 'player')) {
    const economy = empireEconomy(state, faction);
    if (economy.researchQueue.length) {
      economy.researchQueue[0].remaining -= seconds * researchSpeedMultiplier(state, faction);
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
      if (fleet.phase === 'exiting') {
        if (hasTierTwoPhaseLock(phaseFieldUnitsForFleet(state, fleet), fleet.unit)) fleet.phaseGateLocked = true;
        const origin = getPlanet(state, fleet.originId), destination = getPlanet(state, fleet.destinationId);
        if (origin && destination) {
          const border = systemBorderOffset(origin, destination, state.config.mapSize);
          const turnSeconds = turnShipTowardVector(
            fleet.unit,
            border.x - (fleet.unit.orbitX ?? fleet.departureX ?? 0),
            border.y - (fleet.unit.orbitY ?? fleet.departureY ?? 0),
            timeLeft,
          );
          timeLeft -= turnSeconds;
          if (timeLeft <= 1e-9) break;
        }
      }
      const progressRate = fleet.phase === 'exiting'
        ? shipMovementSpeedMultiplier(fleet.unit.kind) * phaseControlRateMultiplier(fleetPhaseControlStackCount(state, fleet))
        : 1;
      const remainingPhaseTime = Math.max(0, fleet.travelTime - fleet.progress);
      const actualSecondsRemaining = remainingPhaseTime / progressRate;
      if (timeLeft + 1e-9 < actualSecondsRemaining) {
        fleet.progress += timeLeft * progressRate;
        timeLeft = 0;
      } else {
        timeLeft = Math.max(0, timeLeft - actualSecondsRemaining);
        const origin = getPlanet(state, fleet.originId)!;
        const waypoint = getPlanet(state, fleet.destinationId)!;
        if (fleet.phase === 'exiting') {
          fleet.phase = 'charging';
          fleet.progress = 0;
          fleet.travelTime = PHASE_GATE_CHARGE_SECONDS;
        } else if (fleet.phase === 'charging') {
          if (phaseGateBlocked(state, fleet)) {
            fleet.progress = fleet.travelTime;
            timeLeft = 0;
            break;
          }
          fleet.phase = 'tunnel';
          fleet.progress = 0;
          fleet.travelTime = phaseTravelTime(origin, waypoint) * phaseTravelMultiplier(empireEconomy(state, fleet.faction).completedResearch)
            / shipMovementSpeedMultiplier(fleet.unit.kind);
        } else if (fleet.route?.length) {
          const nextId = fleet.route.shift()!;
          const next = getPlanet(state, nextId)!;
          const inboundBorder = systemBorderOffset(waypoint, origin, state.config.mapSize);
          fleet.originId = waypoint.id;
          fleet.destinationId = next.id;
          fleet.phaseGateLocked = hasTierTwoPhaseLock(waypoint.orbitUnits, { ...fleet.unit, orbitX: inboundBorder.x, orbitY: inboundBorder.y });
          beginSystemExit(fleet, waypoint, next, inboundBorder.x, inboundBorder.y, state.config.mapSize);
        } else {
          placeAtSystemEdge(origin, waypoint, fleet.unit, state.config.mapSize);
          waypoint.orbitUnits.push(fleet.unit);
          addMessage(state, `${UNITS[fleet.unit.kind].label} emerged at the outer edge of ${waypoint.name}.`);
          const group = arrivals.get(waypoint.id) ?? [];
          group.push({ unit: fleet.unit, seconds: timeLeft });
          arrivals.set(waypoint.id, group);
          arrived = true;
        }
      }
    }
    if (!arrived) {
      syncDepartingFleetPosition(state, fleet);
      traveling.push(fleet);
    }
  }
  state.fleets = traveling;
  for (const [planetId, landedFleets] of arrivals) {
    const p = getPlanet(state, planetId)!;
    directAiOrbitalShips(state, p);
    for (const arrival of landedFleets) tickOrbitUnitMovement(p, arrival.unit, arrival.seconds);
    const combatSeconds = Math.max(0, ...landedFleets.map(arrival => arrival.seconds));
    if (combatSeconds) tickOrbitCombat(state, p, combatSeconds);
    resolveLandingApproaches(state, p);
  }
  updatePlanetIntel(state);
  return state;
}
