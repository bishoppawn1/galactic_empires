import { UNITS, isBuildingOperational } from '../definitions';
import { findPlanetPath } from '../navigation';
import type { GameState, Planet, Unit } from '../types';

export interface AiFleetOperation {
  originId: string;
  targetId: string;
  shipIds: string[];
  kind: 'reinforce' | 'strike';
}

const combatStrength = (ship: Unit) => {
  const definition = UNITS[ship.kind];
  const weapon = definition.weapon;
  return (ship.hp + ship.shields) * (weapon.damage * weapon.projectiles / weapon.cooldown);
};

const routeDistance = (state: GameState, path: string[]) => path.slice(1).reduce((total, id, index) => {
  const from = state.planets.find(planet => planet.id === path[index])!;
  const to = state.planets.find(planet => planet.id === id)!;
  return total + Math.hypot(to.x - from.x, to.y - from.y);
}, 0);

const hasHostileShips = (planet: Planet) => planet.orbitUnits.some(ship => ship.faction !== 'neutral' && ship.faction !== 'enemy');

export function planEnemyFleetOperations(state: GameState): AiFleetOperation[] {
  const profile = state.config.difficulty === 'cadet'
    ? { reserve: 3 }
    : state.config.difficulty === 'admiral'
      ? { reserve: 1 }
      : { reserve: 2 };
  const invasionTargets = new Set(state.fleets.filter(fleet => fleet.faction === 'enemy' && (UNITS[fleet.unit.kind].capacity ?? 0) > 0)
    .map(fleet => fleet.finalDestinationId ?? fleet.destinationId));

  return state.planets.flatMap(origin => {
    if (origin.owner !== 'enemy' || hasHostileShips(origin) || state.battles.some(battle => battle.planetId === origin.id)) return [];
    const warships = origin.orbitUnits.filter(ship => ship.faction === 'enemy' && !(UNITS[ship.kind].capacity ?? 0));
    const deploymentSize = warships.length - profile.reserve;
    if (deploymentSize < 1) return [];

    const targets = state.planets.flatMap(target => {
      if (target.id === origin.id) return [];
      const reinforce = target.owner === 'enemy' && hasHostileShips(target);
      const strike = target.owner !== null && target.owner !== 'enemy';
      if (!reinforce && !strike) return [];
      const path = findPlanetPath(state.planets, origin.id, target.id);
      if (!path) return [];
      const priority = reinforce ? 0
        : invasionTargets.has(target.id) ? 1
          : hasHostileShips(target) || target.buildings.some(building => building.kind === 'spaceDefense' && isBuildingOperational(building)) ? 2 : 3;
      return [{ target, priority, distance: routeDistance(state, path), kind: reinforce ? 'reinforce' as const : 'strike' as const }];
    }).sort((a, b) => a.priority - b.priority || a.distance - b.distance || a.target.id.localeCompare(b.target.id));
    const destination = targets[0];
    if (!destination) return [];
    const ships = [...warships].sort((a, b) => combatStrength(b) - combatStrength(a) || a.id.localeCompare(b.id)).slice(0, deploymentSize);
    return [{ originId: origin.id, targetId: destination.target.id, shipIds: ships.map(ship => ship.id), kind: destination.kind }];
  });
}
