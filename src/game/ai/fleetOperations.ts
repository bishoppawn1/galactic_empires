import { UNITS, isBuildingOperational, isOrbitalDefenseBuilding, shipArmor, shipWeaponBatteries } from '../definitions';
import { findPlanetPath } from '../navigation';
import type { EnemyDifficulty, GameState, Planet, SpaceUnitKind, Unit } from '../types';

export interface AiFleetOperation {
  originId: string;
  targetId: string;
  shipIds: string[];
  kind: 'reinforce' | 'strike';
}

const combatStrength = (ship: Unit) => {
  const kind = ship.kind as SpaceUnitKind;
  const damagePerSecond = shipWeaponBatteries(kind)
    .reduce((total, weapon) => total + weapon.damage * weapon.mounts / weapon.cooldown, 0);
  const armoredHull = ship.hp / (1 - shipArmor(kind));
  return (armoredHull + ship.shields) * damagePerSecond;
};

const routeDistance = (state: GameState, path: string[]) => path.slice(1).reduce((total, id, index) => {
  const from = state.planets.find(planet => planet.id === path[index])!;
  const to = state.planets.find(planet => planet.id === id)!;
  return total + Math.hypot(to.x - from.x, to.y - from.y);
}, 0);

const hasHostileShips = (planet: Planet) => planet.orbitUnits.some(ship => ship.faction !== 'neutral' && ship.faction !== 'enemy');

const isWarship = (ship: Unit) => !(UNITS[ship.kind].capacity ?? 0);

export const enemyDefensiveReserve = (warshipCount: number, difficulty: EnemyDifficulty) => {
  const profile = difficulty === 'cadet'
    ? { minimum: 3, share: .55 }
    : difficulty === 'admiral'
      ? { minimum: 1, share: .3 }
      : { minimum: 2, share: .4 };
  return Math.min(warshipCount, Math.max(profile.minimum, Math.ceil(warshipCount * profile.share)));
};

export function enemyHasOrbitalSuperiority(state: GameState, target: Planet, includeInbound = true) {
  const enemyWarships = target.orbitUnits.filter(ship => ship.faction === 'enemy' && isWarship(ship)).length;
  const inboundWarships = includeInbound
    ? state.fleets.filter(fleet => fleet.faction === 'enemy'
      && (fleet.finalDestinationId ?? fleet.destinationId) === target.id
      && isWarship(fleet.unit)).length
    : 0;
  const hostileShips = target.orbitUnits.filter(ship => ship.faction !== 'enemy').length;
  const hostileOrbitalDefenses = target.owner && target.owner !== 'enemy'
    ? target.buildings.filter(isBuildingOperational).reduce((total, building) => total
      + (building.kind === 'starbase' ? 6 : building.kind === 'antiSpaceDefense' || building.kind === 'spaceDefense' ? 1 : 0), 0)
    : 0;
  const resistance = hostileShips + hostileOrbitalDefenses;
  return enemyWarships + inboundWarships >= Math.max(2, resistance * 2 + 2);
}

export function enemyOrbitalBeachheads(state: GameState) {
  const committedTargets = new Set(state.fleets.filter(fleet => fleet.faction === 'enemy'
    && (UNITS[fleet.unit.kind].capacity ?? 0) > 0)
    .map(fleet => fleet.finalDestinationId ?? fleet.destinationId));
  return state.planets.filter(target => (target.systemKind ?? 'planet') === 'planet'
    && target.owner !== null
    && target.owner !== 'enemy'
    && !state.battles.some(battle => battle.planetId === target.id)
    && !committedTargets.has(target.id)
    && !target.orbitUnits.some(ship => ship.faction === 'enemy'
      && (UNITS[ship.kind].capacity ?? 0) > 0
      && ((ship.cargo?.length ?? 0) > 0 || ship.pendingLanding))
    && enemyHasOrbitalSuperiority(state, target, false));
}

export function planEnemyFleetOperations(state: GameState): AiFleetOperation[] {
  const invasionTargets = new Set(state.fleets.filter(fleet => fleet.faction === 'enemy' && (UNITS[fleet.unit.kind].capacity ?? 0) > 0)
    .map(fleet => fleet.finalDestinationId ?? fleet.destinationId));
  const plannedTargets = new Set<string>();
  const operations: AiFleetOperation[] = [];

  for (const origin of state.planets) {
    if (origin.owner !== 'enemy' || hasHostileShips(origin) || state.battles.some(battle => battle.planetId === origin.id)) continue;
    const warships = origin.orbitUnits.filter(ship => ship.faction === 'enemy' && isWarship(ship));
    const deploymentSize = warships.length - enemyDefensiveReserve(warships.length, state.config.difficulty);
    if (deploymentSize < 1) continue;

    const targets = state.planets.flatMap(target => {
      if (target.id === origin.id || plannedTargets.has(target.id)) return [];
      const reinforce = target.owner === 'enemy' && hasHostileShips(target);
      const strike = (target.owner !== null && target.owner !== 'enemy')
        || ((target.systemKind ?? 'planet') === 'ancientTemple' && target.owner !== 'enemy');
      if ((!reinforce && !strike) || (strike && enemyHasOrbitalSuperiority(state, target))) return [];
      const path = findPlanetPath(state.planets, origin.id, target.id);
      if (!path) return [];
      const priority = reinforce ? 0
        : invasionTargets.has(target.id) ? 1
          : hasHostileShips(target) || target.buildings.some(building => isOrbitalDefenseBuilding(building) && isBuildingOperational(building)) ? 2 : 3;
      return [{ target, priority, distance: routeDistance(state, path), kind: reinforce ? 'reinforce' as const : 'strike' as const }];
    }).sort((a, b) => a.priority - b.priority || a.distance - b.distance || a.target.id.localeCompare(b.target.id));
    const destination = targets[0];
    if (!destination) continue;
    const ships = [...warships].sort((a, b) => combatStrength(b) - combatStrength(a) || a.id.localeCompare(b.id)).slice(0, deploymentSize);
    operations.push({ originId: origin.id, targetId: destination.target.id, shipIds: ships.map(ship => ship.id), kind: destination.kind });
    plannedTargets.add(destination.target.id);
  }
  return operations;
}
