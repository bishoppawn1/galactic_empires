import { describe, expect, it } from 'vitest';
import {
  ANCIENT_RELIC_ECONOMY_MULTIPLIER,
  STELLAR_HAZARD_DAMAGE_PER_SECOND,
  UNITS,
  controlsAncientRelic,
  createCompetitiveState,
  createInitialState,
  dockSpaceUnit,
  findPlanetPath,
  isColonizableWorld,
  orbitalCombatShots,
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
  it('replaces ordinary planets with every special system category', () => {
    const state = createInitialState(config(142857));
    const kinds = state.planets.map(systemKind);
    expect(kinds.filter(kind => kind === 'nebula')).toHaveLength(2);
    expect(kinds.filter(kind => kind === 'star')).toHaveLength(2);
    expect(kinds.filter(kind => kind === 'pirateBase')).toHaveLength(2);
    expect(kinds.filter(kind => kind === 'ancientTemple')).toHaveLength(1);

    state.planets.filter(system => !isColonizableWorld(system)).forEach(system => {
      expect(system.buildings).toEqual([]);
      expect(system.groundUnits).toEqual([]);
      expect(system.groundQueue).toEqual([]);
      expect(system.owner).toBeNull();
    });
    state.planets.filter(system => systemKind(system) === 'pirateBase').forEach(system => {
      expect(system.orbitUnits).toHaveLength(3);
      expect(system.orbitUnits.every(ship => ship.faction === 'neutral')).toBe(true);
    });
  });

  it('is repeatable for one seed and changes layout and homes for another', () => {
    const snapshot = (seed: number) => {
      const state = createInitialState(config(seed));
      return {
        homes: state.homeSystemIds,
        systems: state.planets.map(system => [system.id, system.name, systemKind(system), system.x, system.y]),
      };
    };
    expect(snapshot(99)).toEqual(snapshot(99));
    expect(snapshot(99)).not.toEqual(snapshot(100));
  });

  it('keeps every seeded map connected and places solo rivals far apart', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const state = createInitialState(config(seed));
      const first = state.planets[0];
      state.planets.forEach(system => expect(findPlanetPath(state.planets, first.id, system.id)).toBeDefined());
      const homes = state.homeSystemIds!.map(id => state.planets.find(system => system.id === id)!);
      expect(Math.hypot(homes[0].x - homes[1].x, homes[0].y - homes[1].y)).toBeGreaterThan(55);
      expect(homes.every(isColonizableWorld)).toBe(true);
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
    const specialSystems = canonical.planets.filter(system => !isColonizableWorld(system));

    expect(specialSystems).toHaveLength(7);
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
});

describe('special-system simulation rules', () => {
  it('hides hostile nebula ships from remote sensors and reveals them at close range', () => {
    const state = createInitialState(config(73));
    const nebula = state.planets.find(system => systemKind(system) === 'nebula')!;
    nebula.orbitUnits = [makeUnit('hidden-enemy', 'escortFrigate', 'enemy')];
    expect(visibleOrbitUnits(nebula)).toEqual([]);
    nebula.orbitUnits.push(makeUnit('scout', 'escortFrigate', 'player'));
    expect(visibleOrbitUnits(nebula).map(ship => ship.id)).toEqual(['hidden-enemy', 'scout']);
  });

  it('damages every faction in a lethal-star system and forbids landing', () => {
    const state = quiet(createInitialState(config(81)));
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

  it('makes pirate defenders exchange fire with any arriving empire', () => {
    const state = createInitialState(config(1234));
    const base = state.planets.find(system => systemKind(system) === 'pirateBase')!;
    base.orbitUnits.forEach(ship => { ship.orbitX = 0; ship.orbitY = 0; });
    base.orbitUnits.push(makeUnit('intruder', 'escortFrigate', 'player'));
    const shots = orbitalCombatShots(base);
    expect(shots.some(shot => shot.faction === 'neutral' && shot.targetId === 'intruder')).toBe(true);
    expect(shots.some(shot => shot.faction === 'player' && shot.targetId.startsWith('pirate-'))).toBe(true);
  });

  it('claims a temple from orbit and applies the relic income bonus only to its controller', () => {
    const state = quiet(createInitialState(config(2468)));
    const temple = state.planets.find(system => systemKind(system) === 'ancientTemple')!;
    temple.orbitUnits = [makeUnit('relic-guard', 'escortFrigate', 'player')];
    const claimed = tick(state, .1);
    expect(claimed.planets.find(system => system.id === temple.id)!.owner).toBe('player');
    expect(controlsAncientRelic(claimed, 'player')).toBe(true);

    const home = claimed.planets.find(system => system.owner === 'player' && isColonizableWorld(system))!;
    const metalBefore = claimed.resources.metal;
    const withRelic = tick(claimed, 1);
    const baseIncome = home.buildings.filter(building => building.kind === 'metalMine').length
      * home.resourceYield.metal * 4 * .7;
    expect(withRelic.resources.metal - metalBefore).toBeCloseTo(baseIncome * ANCIENT_RELIC_ECONOMY_MULTIPLIER);

    const contested = structuredClone(claimed);
    contested.planets.find(system => system.id === temple.id)!.orbitUnits.push(makeUnit('challenger', 'escortFrigate', 'enemy'));
    expect(tick(contested, .1).planets.find(system => system.id === temple.id)!.owner).toBeNull();

    const abandoned = structuredClone(claimed);
    abandoned.planets.find(system => system.id === temple.id)!.orbitUnits = [];
    expect(tick(abandoned, .1).planets.find(system => system.id === temple.id)!.owner).toBeNull();
  });
});
