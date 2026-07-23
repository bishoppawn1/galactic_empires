import type { EmpireEconomy, EmpireFaction, Faction, GameState, PlanetIntel, Unit, UnitFaction } from './types';

const swapFaction = <T extends Faction | UnitFaction>(faction: T, target: EmpireFaction): T => (
  faction === 'player' ? target : faction === target ? 'player' : faction
) as T;

const swapUnit = (unit: Unit, target: EmpireFaction) => {
  unit.faction = swapFaction(unit.faction, target);
  unit.cargo?.forEach(cargo => swapUnit(cargo, target));
};

const economy = (state: GameState, faction: EmpireFaction): EmpireEconomy => faction === 'player' ? {
  resources: state.resources, completedResearch: state.completedResearch, researchQueue: state.researchQueue,
  actionClock: 0, attackClock: 0, missionCount: 0,
} : faction === 'enemy' ? {
  resources: state.enemyResources, completedResearch: state.enemyCompletedResearch, researchQueue: state.enemyResearchQueue,
  actionClock: state.enemyActionClock, attackClock: state.enemyAttackClock, missionCount: state.enemyMissionCount,
} : structuredClone(state.additionalEmpires?.[faction] ?? {
  resources: { metal: 520, crystal: 420, gold: 280 }, completedResearch: [], researchQueue: [], actionClock: 8, attackClock: 130, missionCount: 0,
});

const installEconomy = (state: GameState, faction: EmpireFaction, value: EmpireEconomy) => {
  if (faction === 'player') {
    state.resources = value.resources; state.completedResearch = value.completedResearch; state.researchQueue = value.researchQueue;
  } else if (faction === 'enemy') {
    state.enemyResources = value.resources; state.enemyCompletedResearch = value.completedResearch; state.enemyResearchQueue = value.researchQueue;
  } else {
    state.additionalEmpires ??= {};
    const current = state.additionalEmpires[faction];
    state.additionalEmpires[faction] = { ...value, actionClock: current?.actionClock ?? value.actionClock, attackClock: current?.attackClock ?? value.attackClock, missionCount: current?.missionCount ?? value.missionCount };
  }
};

const swapFocus = (player: string | undefined, enemy: string | undefined, extras: Partial<Record<EmpireFaction, string>> | undefined, target: EmpireFaction) => {
  const values: Partial<Record<EmpireFaction, string>> = { player, enemy, rival2: extras?.rival2, rival3: extras?.rival3 };
  [values.player, values[target]] = [values[target], values.player];
  const remaining = { rival2: values.rival2, rival3: values.rival3 };
  return { player: values.player, enemy: values.enemy, extras: remaining.rival2 || remaining.rival3 ? remaining : undefined };
};

/**
 * Returns the same canonical match as seen from the rival commander's seat.
 * Applying this function twice restores the original state.
 */
export function viewStateForFaction(input: GameState, target: EmpireFaction = 'enemy'): GameState {
  const state = structuredClone(input);
  if (target === 'player') return state;
  const playerEconomy = economy(state, 'player'), targetEconomy = economy(state, target);
  installEconomy(state, 'player', targetEconomy);
  installEconomy(state, target, playerEconomy);
  [state.empireCivilizations.player, state.empireCivilizations[target]] = [state.empireCivilizations[target], state.empireCivilizations.player];
  state.aiFactions = state.aiFactions?.map(faction => swapFaction(faction, target));
  if (state.planetIntel) {
    const swappedIntel: Partial<Record<EmpireFaction, Record<string, PlanetIntel>>> = {};
    for (const [observer, records] of Object.entries(state.planetIntel) as Array<[EmpireFaction, Record<string, PlanetIntel>]>) {
      const swappedObserver = swapFaction(observer, target);
      swappedIntel[swappedObserver] = records;
      Object.values(records).forEach(snapshot => {
        snapshot.owner = swapFaction(snapshot.owner, target);
        snapshot.groundUnits.forEach(unit => swapUnit(unit, target));
      });
    }
    state.planetIntel = swappedIntel;
  }
  for (const planet of state.planets) {
    const focus = swapFocus(planet.orbitFocusTargetId, planet.enemyOrbitFocusTargetId, planet.orbitFocusTargetIds, target);
    if (focus.player) planet.orbitFocusTargetId = focus.player; else delete planet.orbitFocusTargetId;
    if (focus.enemy) planet.enemyOrbitFocusTargetId = focus.enemy; else delete planet.enemyOrbitFocusTargetId;
    if (focus.extras) planet.orbitFocusTargetIds = focus.extras; else delete planet.orbitFocusTargetIds;
    planet.owner = swapFaction(planet.owner, target);
    planet.groundUnits.forEach(unit => swapUnit(unit, target));
    planet.orbitUnits.forEach(unit => swapUnit(unit, target));
  }
  for (const fleet of state.fleets) {
    fleet.faction = swapFaction(fleet.faction, target);
    swapUnit(fleet.unit, target);
  }
  for (const battle of state.battles) {
    const focus = swapFocus(battle.focusTargetId, battle.enemyFocusTargetId, battle.focusTargetIds, target);
    if (focus.player) battle.focusTargetId = focus.player; else delete battle.focusTargetId;
    if (focus.enemy) battle.enemyFocusTargetId = focus.enemy; else delete battle.enemyFocusTargetId;
    if (focus.extras) battle.focusTargetIds = focus.extras; else delete battle.focusTargetIds;
    battle.attackerFaction = battle.attackerFaction ? swapFaction(battle.attackerFaction, target) : undefined;
    battle.attackers.forEach(unit => swapUnit(unit, target));
    battle.defenders.forEach(unit => swapUnit(unit, target));
  }
  return state;
}

export const swapPlayerPerspective = (input: GameState) => viewStateForFaction(input, 'enemy');
