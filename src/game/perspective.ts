import type { Faction, GameState, Unit, UnitFaction } from './types';

const swapFaction = <T extends Faction | UnitFaction>(faction: T): T => (
  faction === 'player' ? 'enemy' : faction === 'enemy' ? 'player' : faction
) as T;

const swapUnit = (unit: Unit) => {
  unit.faction = swapFaction(unit.faction);
  unit.cargo?.forEach(swapUnit);
};

/**
 * Returns the same canonical match as seen from the rival commander's seat.
 * Applying this function twice restores the original state.
 */
export function swapPlayerPerspective(input: GameState): GameState {
  const state = structuredClone(input);
  [state.resources, state.enemyResources] = [state.enemyResources, state.resources];
  [state.completedResearch, state.enemyCompletedResearch] = [state.enemyCompletedResearch, state.completedResearch];
  [state.researchQueue, state.enemyResearchQueue] = [state.enemyResearchQueue, state.researchQueue];
  for (const planet of state.planets) {
    planet.owner = swapFaction(planet.owner);
    [planet.orbitFocusTargetId, planet.enemyOrbitFocusTargetId] = [planet.enemyOrbitFocusTargetId, planet.orbitFocusTargetId];
    planet.groundUnits.forEach(swapUnit);
    planet.orbitUnits.forEach(swapUnit);
  }
  for (const fleet of state.fleets) {
    fleet.faction = swapFaction(fleet.faction);
    swapUnit(fleet.unit);
  }
  for (const battle of state.battles) {
    battle.attackerFaction = battle.attackerFaction ? swapFaction(battle.attackerFaction) : undefined;
    [battle.focusTargetId, battle.enemyFocusTargetId] = [battle.enemyFocusTargetId, battle.focusTargetId];
    battle.attackers.forEach(swapUnit);
    battle.defenders.forEach(swapUnit);
  }
  return state;
}
