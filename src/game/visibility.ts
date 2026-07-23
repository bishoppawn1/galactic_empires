import type { Building, EmpireFaction, GameState, Planet, PlanetIntel } from './types';

const EMPIRES: EmpireFaction[] = ['player', 'enemy', 'rival2', 'rival3'];

const cloneBuildingsForIntel = (buildings: Building[]) => buildings.map(building => {
  const snapshot = structuredClone(building);
  delete snapshot.spaceQueue;
  return snapshot;
});

const snapshotPlanet = (planet: Planet, observedAt: number): PlanetIntel => ({
  owner: planet.owner,
  buildings: cloneBuildingsForIntel(planet.buildings),
  groundUnits: structuredClone(planet.groundUnits),
  observedAt,
});

/**
 * A commander has live system intelligence while they control the planet or
 * have a ship physically inside its gravity well. Ships clearing the well or
 * charging their gate still count as being in the origin system.
 */
export function isSystemVisibleToFaction(state: GameState, planetId: string, faction: EmpireFaction): boolean {
  const planet = state.planets.find(candidate => candidate.id === planetId);
  if (!planet) return false;
  return planet.owner === faction
    || planet.orbitUnits.some(unit => unit.faction === faction)
    || state.fleets.some(fleet => fleet.faction === faction
      && fleet.originId === planetId
      && (fleet.phase === 'exiting' || fleet.phase === 'charging'));
}

/**
 * Refreshes persistent, faction-specific reconnaissance without mutating the
 * supplied state. Only systems with current friendly presence are updated.
 */
export function updatePlanetIntel(state: GameState): void {
  state.planetIntel ??= {};
  for (const faction of EMPIRES) {
    const factionIntel = state.planetIntel[faction] ??= {};
    for (const planet of state.planets) {
      if (isSystemVisibleToFaction(state, planet.id, faction)) {
        factionIntel[planet.id] = snapshotPlanet(planet, state.elapsed);
      }
    }
  }
}

export function refreshPlanetIntel(input: GameState): GameState {
  const state = structuredClone(input);
  updatePlanetIntel(state);
  return state;
}

const clearLivePlanetSecrets = (planet: Planet) => {
  planet.orbitUnits = [];
  planet.groundQueue = [];
  planet.spaceQueue = [];
  delete planet.orbitFocusTargetId;
  delete planet.enemyOrbitFocusTargetId;
  delete planet.orbitFocusTargetIds;
};

/**
 * Produces the state safe to render for the local commander. Canonical state
 * remains untouched so the host simulation and command validation retain the
 * complete match.
 */
export function visibleStateForPlayer(input: GameState): GameState {
  const state: GameState = {
    ...input,
    planets: input.planets.map(planet => ({ ...planet })),
    fleets: [...input.fleets],
    battles: [...input.battles],
    messages: [...input.messages],
  };
  const currentSystemIds = new Set(input.planets
    .filter(planet => isSystemVisibleToFaction(input, planet.id, 'player'))
    .map(planet => planet.id));
  const intel = input.planetIntel?.player ?? {};

  for (const planet of state.planets) {
    if (currentSystemIds.has(planet.id)) {
      planet.intelStatus = 'current';
      continue;
    }

    const snapshot = intel[planet.id];
    clearLivePlanetSecrets(planet);
    if (snapshot) {
      planet.owner = snapshot.owner;
      planet.buildings = cloneBuildingsForIntel(snapshot.buildings);
      planet.groundUnits = structuredClone(snapshot.groundUnits);
      planet.intelStatus = 'stale';
    } else {
      planet.owner = null;
      planet.buildings = [];
      planet.groundUnits = [];
      planet.intelStatus = 'unscouted';
    }
  }

  state.fleets = state.fleets.filter(fleet => fleet.faction === 'player'
    || currentSystemIds.has(fleet.destinationId)
    || (!!fleet.finalDestinationId && currentSystemIds.has(fleet.finalDestinationId)));
  state.battles = state.battles.filter(battle => currentSystemIds.has(battle.planetId));

  const hiddenPlanetNames = input.planets
    .filter(planet => !currentSystemIds.has(planet.id))
    .map(planet => planet.name.toLowerCase());
  state.messages = state.messages.filter(message => {
    const normalized = message.toLowerCase();
    const concernsHiddenSystem = hiddenPlanetNames.some(name => normalized.includes(name));
    if (!concernsHiddenSystem) return true;
    return ![
      'hostile', 'enemy forces', 'enemy invasion', 'lost to', 'fallen to enemy',
      'emerged at the outer edge', 'orbital defense platform', 'invasion of',
      'landing on', 'reinforced the ground battle', 'docked after completing',
      'but no squads were available',
    ].some(marker => normalized.includes(marker));
  });
  if (!state.messages.length) state.messages = ['LONG-RANGE SENSORS — no verified strategic updates.'];

  return state;
}
