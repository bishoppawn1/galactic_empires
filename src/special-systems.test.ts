import { describe, expect, it } from 'vitest';
import {
  ANCIENT_RELIC_IDS,
  ANCIENT_RELICS,
  ANCIENT_RELIC_DAMAGE_MULTIPLIER,
  ANCIENT_RELIC_ECONOMY_BONUS,
  ANCIENT_RELIC_PHASE_TRAVEL_MULTIPLIER,
  ANCIENT_RELIC_PRODUCTION_MULTIPLIER,
  ANCIENT_RELIC_RECOVERY_MULTIPLIER,
  ANCIENT_RELIC_RESEARCH_MULTIPLIER,
  BROOD_BIOMASS_PER_PLANET,
  GRAVITY_WELL_RADIUS,
  MIN_SYSTEM_CENTER_SEPARATION,
  STELLAR_HAZARD_DAMAGE_PER_SECOND,
  UNITS,
  ancientRelicCount,
  ancientRelicDamageMultiplier,
  ancientRelicDefinition,
  ancientRelicPhaseTravelMultiplier,
  ancientRelicProductionMultiplier,
  ancientRelicRecoveryMultiplier,
  constructBuilding,
  controlsAncientRelic,
  createCompetitiveState,
  createInitialState,
  dispatchSpaceUnit,
  dockSpaceUnit,
  findPlanetPath,
  galaxyCanvasDimensions,
  isColonizableWorld,
  migrateGameState,
  orbitalCombatShots,
  researchIncomeMultiplier,
  researchSpeedMultiplier,
  systemKind,
  tick,
  visibleOrbitUnits,
  visibleStateForPlayer,
  type GameState,
  type Unit,
  type UnitFaction,
  type UnitKind,
} from './game';

const config = (mapSeed: number) => ({ mapSize: 'huge' as const, difficulty: 'commander' as const, mapSeed });

const makeUnit = (id: string, kind: UnitKind, faction: UnitFaction, orbitX = 0, orbitY = 0): Unit => ({
  id,
  kind,
  faction,
  hp: UNITS[kind].hp,
  maxHp: UNITS[kind].hp,
  shields: UNITS[kind].shields,
  maxShields: UNITS[kind].shields,
  orbitX,
  orbitY,
});

const quiet = (state: GameState) => {
  state.enemyActionClock = 9999;
  state.enemyAttackClock = 9999;
  return state;
};

describe('seeded special-system generation', () => {
  it('randomizes non-home locations, keeps exactly one star, and creates fortified pirate worlds', () => {
    const state = createInitialState(config(142857));
    const kinds = state.planets.map(systemKind);
    expect(kinds.filter(kind => kind === 'star')).toHaveLength(1);
    expect(new Set(kinds)).toEqual(new Set(['planet', 'nebula', 'star', 'pirateBase', 'ancientTemple']));

    state.planets.filter(system => !isColonizableWorld(system)).forEach(system => {
      expect(system.buildings).toEqual([]);
      expect(system.groundUnits).toEqual([]);
      expect(system.groundQueue).toEqual([]);
      expect(system.owner).toBeNull();
    });
    state.planets.filter(system => systemKind(system) === 'pirateBase').forEach(system => {
      expect(isColonizableWorld(system)).toBe(true);
      expect(system.orbitUnits).toHaveLength(48);
      expect(system.orbitUnits.every(ship => ship.faction === 'neutral')).toBe(true);
      expect(system.groundUnits).toHaveLength(12);
      expect(system.groundUnits.every(unit => unit.faction === 'neutral')).toBe(true);
      expect(system.buildingLimits.metalMine).toBeGreaterThan(0);
      expect(system.resourceYield.metal).toBeGreaterThan(0);
    });
  });

  it('is repeatable for one seed and randomizes ordinary versus special locations between seeds', () => {
    const snapshot = (seed: number) => {
      const state = createInitialState(config(seed));
      return {
        homes: state.homeSystemIds,
        systems: state.planets.map(system => [system.id, system.name, systemKind(system), system.x, system.y]),
      };
    };
    expect(snapshot(99)).toEqual(snapshot(99));
    expect(snapshot(99)).not.toEqual(snapshot(100));
    const classifications = new Map<string, Set<string>>();
    for (let seed = 1; seed <= 30; seed += 1) {
      createInitialState(config(seed)).planets.forEach(system => {
        const kinds = classifications.get(system.id) ?? new Set<string>();
        kinds.add(systemKind(system));
        classifications.set(system.id, kinds);
      });
    }
    expect([...classifications.values()].some(kinds => kinds.has('planet') && kinds.size > 1)).toBe(true);
  });

  it('places exactly one star on every generated map size', () => {
    for (const mapSize of ['small', 'medium', 'large', 'huge', 'massive', 'galactic'] as const) {
      for (let seed = 1; seed <= 20; seed += 1) {
        const state = createInitialState({ mapSize, difficulty: 'commander', mapSeed: seed });
        const [star] = state.planets.filter(system => systemKind(system) === 'star');
        expect(star).toBeDefined();
        expect(state.planets.filter(system => systemKind(system) === 'star')).toHaveLength(1);
        const eligibleDistances = state.planets
          .filter(system => !state.homeSystemIds!.includes(system.id))
          .map(system => Math.hypot(system.x - 50, system.y - 50));
        expect(Math.hypot(star.x - 50, star.y - 50)).toBeCloseTo(Math.min(...eligibleDistances));
        expect(state.homeSystemIds!.every(id => systemKind(state.planets.find(system => system.id === id)!) === 'planet')).toBe(true);
      }
    }
  });

  it('keeps every generated gravity well physically separated', () => {
    for (const mapSize of ['small', 'medium', 'large', 'huge', 'massive', 'galactic'] as const) {
      const { width, height } = galaxyCanvasDimensions(mapSize);
      for (let seed = 1; seed <= 20; seed += 1) {
        const systems = createInitialState({ mapSize, difficulty: 'commander', mapSeed: seed }).planets;
        systems.forEach(system => {
          const x = system.x / 100 * width, y = system.y / 100 * height;
          expect(x).toBeGreaterThanOrEqual(GRAVITY_WELL_RADIUS);
          expect(x).toBeLessThanOrEqual(width - GRAVITY_WELL_RADIUS);
          expect(y).toBeGreaterThanOrEqual(GRAVITY_WELL_RADIUS);
          expect(y).toBeLessThanOrEqual(height - GRAVITY_WELL_RADIUS);
        });
        systems.forEach((system, index) => systems.slice(index + 1).forEach(other => {
          const separation = Math.hypot(
            (other.x - system.x) / 100 * width,
            (other.y - system.y) / 100 * height,
          );
          expect(separation).toBeGreaterThanOrEqual(MIN_SYSTEM_CENTER_SEPARATION);
          expect(separation).toBeGreaterThan(GRAVITY_WELL_RADIUS * 2);
        }));
      }
    }
  });

  it('scatters Galactic layouts across two dimensions instead of arranging systems in rows', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const { height } = galaxyCanvasDimensions('galactic');
      const systems = createInitialState({ mapSize: 'galactic', difficulty: 'commander', mapSeed: seed }).planets;
      const yPositions = systems.map(system => system.y / 100 * height).sort((a, b) => a - b);
      const largestHorizontalBand = Math.max(...yPositions.map(y =>
        yPositions.filter(other => Math.abs(other - y) <= MIN_SYSTEM_CENTER_SEPARATION / 5).length));

      expect(largestHorizontalBand).toBeLessThanOrEqual(9);
      expect(new Set(systems.map(system => Math.round(system.x * 10))).size).toBeGreaterThan(30);
      expect(new Set(systems.map(system => Math.round(system.y * 10))).size).toBeGreaterThan(30);
    }
  });

  it('keeps every seeded map connected and places solo rivals far apart', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const state = createInitialState(config(seed));
      const first = state.planets[0];
      state.planets.forEach(system => expect(findPlanetPath(state.planets, first.id, system.id)).toBeDefined());
      const homes = state.homeSystemIds!.map(id => state.planets.find(system => system.id === id)!);
      expect(Math.hypot(homes[0].x - homes[1].x, homes[0].y - homes[1].y)).toBeGreaterThan(55);
      expect(homes.every(isColonizableWorld)).toBe(true);
      expect(homes.every(home => systemKind(home) === 'planet')).toBe(true);
      expect(state.startingPlanetIds).toEqual({ player: homes[0].id, enemy: homes[1].id });
      expect(state.planets.filter(system => system.owner === 'player').map(system => system.id)).toEqual([homes[0].id]);
      expect(visibleStateForPlayer(state).planets.filter(system => system.owner === 'player').map(system => system.id)).toEqual([homes[0].id]);
      expect(state.planets.filter(system => systemKind(system) === 'star')).toHaveLength(1);
    }
  });

  it('keeps Galactic maps connected with unique system identities', () => {
    for (let seed = 1; seed <= 10; seed += 1) {
      const state = createInitialState({ mapSize: 'galactic', difficulty: 'commander', mapSeed: seed });
      const first = state.planets[0];
      expect(state.planets).toHaveLength(45);
      expect(new Set(state.planets.map(system => system.id)).size).toBe(45);
      expect(new Set(state.planets.map(system => system.name)).size).toBe(45);
      state.planets.forEach(system => expect(findPlanetPath(state.planets, first.id, system.id)).toBeDefined());
    }
  });

  it('reserves four ordinary, separated home systems for a four-empire match', () => {
    const state = createCompetitiveState(config(90210), [
      { faction: 'player', controller: 'human' },
      { faction: 'enemy', controller: 'human' },
      { faction: 'rival2', controller: 'ai' },
      { faction: 'rival3', controller: 'ai' },
    ]);
    const homes = state.homeSystemIds!.map(id => state.planets.find(system => system.id === id)!);
    expect(homes).toHaveLength(4);
    expect(homes.every(isColonizableWorld)).toBe(true);
    expect(new Set(homes.map(home => home.owner))).toEqual(new Set(['player', 'enemy', 'rival2', 'rival3']));
  });

  it('keeps every special-system identity visible through fog of war', () => {
    const canonical = createInitialState(config(142857));
    const visible = visibleStateForPlayer(canonical);
    const specialSystems = canonical.planets.filter(system => systemKind(system) !== 'planet');

    expect(specialSystems.length).toBeGreaterThan(0);
    specialSystems.forEach(system => {
      const obscured = visible.planets.find(candidate => candidate.id === system.id)!;
      expect(obscured).toMatchObject({
        name: system.name,
        color: system.color,
        systemKind: systemKind(system),
        intelStatus: 'unscouted',
      });
      expect(obscured.orbitUnits).toEqual([]);
    });
  });

  it('generates non-duplicated relic identities whose names match their effects', () => {
    let foundMultipleRelics = false;
    for (let seed = 1; seed <= 100; seed += 1) {
      const relics = createInitialState(config(seed)).planets.filter(system => systemKind(system) === 'ancientTemple');
      foundMultipleRelics ||= relics.length > 1;
      expect(new Set(relics.map(system => system.ancientRelicId)).size).toBe(relics.length);
      relics.forEach(system => {
        const relic = ancientRelicDefinition(system)!;
        expect(system.name).toBe(relic.name);
        expect(relic.description.length).toBeGreaterThan(0);
      });
    }
    expect(foundMultipleRelics).toBe(true);
  });

  it('deterministically assigns matching relic identities and names to legacy saves', () => {
    const legacy = createInitialState(config(142857));
    const temple = legacy.planets.find(system => systemKind(system) === 'ancientTemple')!;
    delete temple.ancientRelicId;
    temple.name = 'Temple of the First Dawn';

    const firstMigration = migrateGameState(legacy);
    const secondMigration = migrateGameState(legacy);
    const migratedTemple = firstMigration.planets.find(system => system.id === temple.id)!;

    expect(migratedTemple.ancientRelicId).toBe('abundanceEngine');
    expect(migratedTemple.name).toBe(ANCIENT_RELICS.abundanceEngine.name);
    expect(secondMigration.planets.find(system => system.id === temple.id)).toMatchObject({
      ancientRelicId: migratedTemple.ancientRelicId,
      name: migratedTemple.name,
    });
  });
});

describe('special-system simulation rules', () => {
  it('hides hostile nebula ships from remote sensors and reveals them at close range', () => {
    const state = createInitialState(config(142857));
    const nebula = state.planets.find(system => systemKind(system) === 'nebula')!;
    nebula.orbitUnits = [makeUnit('hidden-enemy', 'escortFrigate', 'enemy')];
    expect(visibleOrbitUnits(nebula)).toEqual([]);
    nebula.orbitUnits.push(makeUnit('scout', 'escortFrigate', 'player'));
    expect(visibleOrbitUnits(nebula).map(ship => ship.id)).toEqual(['hidden-enemy', 'scout']);
  });

  it('damages every faction in a lethal-star system and forbids landing', () => {
    const state = quiet(createInitialState(config(142857)));
    const star = state.planets.find(system => systemKind(system) === 'star')!;
    const ship = makeUnit('star-test', 'transport', 'player');
    ship.cargo = [makeUnit('squad', 'infantry', 'player')];
    star.orbitUnits = [ship];
    const before = ship.shields;
    const advanced = tick(state, 1);
    expect(advanced.planets.find(system => system.id === star.id)!.orbitUnits[0].shields)
      .toBe(before - STELLAR_HAZARD_DAMAGE_PER_SECOND);
    expect(dockSpaceUnit(state, star.id, ship.id)).toMatchObject({ ok: false });
  });

  it('continues star damage while a ship exits and charges, then stops it in the tunnel', () => {
    const state = quiet(createInitialState(config(142857)));
    const star = state.planets.find(system => systemKind(system) === 'star')!;
    const destinationId = findPlanetPath(state.planets, star.id, state.planets.find(system => system.id !== star.id)!.id)![1];
    const ship = makeUnit('departing-star-test', 'escortFrigate', 'player');
    star.orbitUnits = [ship];
    const dispatched = dispatchSpaceUnit(state, star.id, ship.id, destinationId);
    expect(dispatched.ok).toBe(true);
    if (!dispatched.ok) return;

    dispatched.state.fleets[0].travelTime = 100;
    const exiting = tick(quiet(dispatched.state), 1);
    expect(exiting.fleets[0].phase).toBe('exiting');
    expect(exiting.fleets[0].unit.shields).toBe(ship.maxShields - STELLAR_HAZARD_DAMAGE_PER_SECOND);

    exiting.fleets[0].phase = 'charging';
    exiting.fleets[0].progress = 0;
    exiting.fleets[0].travelTime = 100;
    exiting.fleets[0].unit.shields = exiting.fleets[0].unit.maxShields;
    const charging = tick(quiet(exiting), 1);
    expect(charging.fleets[0].phase).toBe('charging');
    expect(charging.fleets[0].unit.shields).toBe(ship.maxShields - STELLAR_HAZARD_DAMAGE_PER_SECOND);

    charging.fleets[0].phase = 'tunnel';
    charging.fleets[0].progress = 0;
    charging.fleets[0].travelTime = 100;
    charging.fleets[0].unit.shields = charging.fleets[0].unit.maxShields;
    const tunnel = tick(quiet(charging), 1);
    expect(tunnel.fleets[0].phase).toBe('tunnel');
    expect(tunnel.fleets[0].unit.shields).toBe(ship.maxShields);
  });

  it('makes pirate defenders exchange fire with any arriving empire', () => {
    const state = createInitialState(config(142857));
    const base = state.planets.find(system => systemKind(system) === 'pirateBase')!;
    base.orbitUnits.forEach(ship => { ship.orbitX = 0; ship.orbitY = 0; });
    base.orbitUnits.push(makeUnit('intruder', 'escortFrigate', 'player'));
    const shots = orbitalCombatShots(base);
    expect(shots.some(shot => shot.faction === 'neutral' && shot.targetId === 'intruder')).toBe(true);
    expect(shots.some(shot => shot.faction === 'player' && shot.targetId.startsWith('pirate-orbit-'))).toBe(true);
  });

  it('lets transports invade a pirate world while its static garrison produces no reinforcements', () => {
    const state = quiet(createInitialState(config(142857)));
    const base = state.planets.find(system => systemKind(system) === 'pirateBase')!;
    const originalGroundIds = base.groundUnits.map(unit => unit.id);
    const originalOrbitIds = base.orbitUnits.map(unit => unit.id);
    const unchanged = tick(state, 30).planets.find(system => system.id === base.id)!;
    expect(unchanged.groundUnits.map(unit => unit.id)).toEqual(originalGroundIds);
    expect(unchanged.orbitUnits.map(unit => unit.id)).toEqual(originalOrbitIds);
    expect(unchanged.buildings).toEqual([]);
    expect(unchanged.groundQueue).toEqual([]);
    expect(unchanged.spaceQueue).toEqual([]);

    base.orbitUnits = [];
    const transport = makeUnit('pirate-invasion-transport', 'transport', 'player');
    transport.cargo = [makeUnit('pirate-invasion-squad', 'infantry', 'player')];
    transport.loadedUnitIds = transport.cargo.map(unit => unit.id);
    base.orbitUnits.push(transport);
    const docking = dockSpaceUnit(state, base.id, transport.id);
    expect(docking.ok).toBe(true);
    if (!docking.ok) return;
    const invaded = tick(quiet(docking.state), .1);
    expect(invaded.battles.find(battle => battle.planetId === base.id)?.defenders).toHaveLength(12);

    const conquered = structuredClone(state);
    const conqueredBase = conquered.planets.find(system => system.id === base.id)!;
    conqueredBase.owner = 'player';
    conqueredBase.groundUnits = [];
    conqueredBase.orbitUnits = [];
    expect(constructBuilding(conquered, base.id, 'groundFactory').ok).toBe(true);
  });

  it('applies The Abundance Engine after research income without stacking unrelated relics', () => {
    const state = quiet(createInitialState(config(142857)));
    const temple = state.planets.find(system => systemKind(system) === 'ancientTemple')!;
    temple.orbitUnits = [makeUnit('relic-guard', 'escortFrigate', 'player')];
    const claimed = tick(state, .1);
    expect(claimed.planets.find(system => system.id === temple.id)!.owner).toBe('player');
    expect(controlsAncientRelic(claimed, 'player')).toBe(true);
    expect(ancientRelicCount(claimed, 'player')).toBe(1);

    const home = claimed.planets.find(system => system.owner === 'player' && isColonizableWorld(system))!;
    claimed.completedResearch.push('deepCoreExtraction');
    const metalBefore = claimed.resources.metal;
    const withRelic = tick(claimed, 1);
    const baseIncome = home.buildings.filter(building => building.kind === 'metalMine').length
      * home.resourceYield.metal * 4 * .7;
    const researchScale = researchIncomeMultiplier(claimed.completedResearch);
    expect(withRelic.resources.metal - metalBefore).toBeCloseTo(baseIncome * (researchScale + ANCIENT_RELIC_ECONOMY_BONUS));

    const stacked = structuredClone(claimed);
    const secondTemple = stacked.planets.find(system => system.id !== temple.id && system.owner === null)!;
    secondTemple.systemKind = 'ancientTemple';
    secondTemple.ancientRelicId = 'warChoir';
    secondTemple.owner = 'player';
    secondTemple.orbitUnits = [makeUnit('second-relic-guard', 'escortFrigate', 'player')];
    expect(ancientRelicCount(stacked, 'player')).toBe(2);
    const stackedMetalBefore = stacked.resources.metal;
    const withTwoRelics = tick(stacked, 1);
    expect(withTwoRelics.resources.metal - stackedMetalBefore).toBeCloseTo(baseIncome * (researchScale + ANCIENT_RELIC_ECONOMY_BONUS));

    const contested = structuredClone(claimed);
    contested.planets.find(system => system.id === temple.id)!.orbitUnits.push(makeUnit('challenger', 'escortFrigate', 'enemy'));
    expect(tick(contested, .1).planets.find(system => system.id === temple.id)!.owner).toBeNull();

    const abandoned = structuredClone(claimed);
    abandoned.planets.find(system => system.id === temple.id)!.orbitUnits = [];
    const retained = tick(abandoned, .1);
    expect(retained.planets.find(system => system.id === temple.id)!.owner).toBe('player');
    expect(controlsAncientRelic(retained, 'player')).toBe(true);

    const captured = structuredClone(retained);
    captured.planets.find(system => system.id === temple.id)!.orbitUnits = [makeUnit('relic-captor', 'escortFrigate', 'enemy')];
    const taken = tick(captured, .1);
    expect(taken.planets.find(system => system.id === temple.id)!.owner).toBe('enemy');
    expect(controlsAncientRelic(taken, 'player')).toBe(false);
    expect(controlsAncientRelic(taken, 'enemy')).toBe(true);
  });

  it('activates only the matching strategic effect for each named relic', () => {
    const state = quiet(createInitialState(config(142857)));
    const temple = state.planets.find(system => systemKind(system) === 'ancientTemple')!;
    temple.owner = 'player';
    temple.orbitUnits = [makeUnit('effect-guard', 'escortFrigate', 'player')];
    const home = state.planets.find(system => system.owner === 'player' && isColonizableWorld(system))!;
    home.buildings.push({ id: 'relic-research-lab', kind: 'researchLab' });

    const expected = {
      abundanceEngine: [1, 1, 1, 1, 1],
      warChoir: [ANCIENT_RELIC_DAMAGE_MULTIPLIER, 1, 1, 1, 1],
      chronoforge: [1, ANCIENT_RELIC_PRODUCTION_MULTIPLIER, 1, 1, 1],
      farstepOrrery: [1, 1, ANCIENT_RELIC_PHASE_TRAVEL_MULTIPLIER, 1, 1],
      renewalWell: [1, 1, 1, ANCIENT_RELIC_RECOVERY_MULTIPLIER, 1],
      mnemonicArchive: [1, 1, 1, 1, ANCIENT_RELIC_RESEARCH_MULTIPLIER],
    } as const;

    for (const relicId of ANCIENT_RELIC_IDS) {
      temple.ancientRelicId = relicId;
      temple.name = ANCIENT_RELICS[relicId].name;
      expect([
        ancientRelicDamageMultiplier(state, 'player'),
        ancientRelicProductionMultiplier(state, 'player'),
        ancientRelicPhaseTravelMultiplier(state, 'player'),
        ancientRelicRecoveryMultiplier(state, 'player'),
        researchSpeedMultiplier(state),
      ]).toEqual(expected[relicId]);
    }
  });

  it('applies relic bonuses separately from research to Brood biomass income', () => {
    const state = quiet(createInitialState({ ...config(142857), playerFaction: 'brood' }));
    const temple = state.planets.find(system => systemKind(system) === 'ancientTemple')!;
    temple.owner = 'player';
    temple.orbitUnits = [makeUnit('brood-relic-guard', 'clawFrigate', 'player')];
    state.completedResearch.push('deepCoreExtraction');
    const biomassBefore = state.resources.biomass ?? 0;
    const ownedWorldCount = state.planets.filter(system => system.owner === 'player' && isColonizableWorld(system)).length;

    const advanced = tick(state, 1);

    expect((advanced.resources.biomass ?? 0) - biomassBefore).toBeCloseTo(
      ownedWorldCount * BROOD_BIOMASS_PER_PLANET
        * (researchIncomeMultiplier(state.completedResearch) + ANCIENT_RELIC_ECONOMY_BONUS),
    );
  });
});
