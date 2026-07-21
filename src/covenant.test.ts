import { describe, expect, it } from 'vitest';
import {
  COVENANT_FIELD_REPAIR_PER_SECOND, COVENANT_GROUND_HULL_REGEN, COVENANT_GROUND_KINDS, COVENANT_SPACE_KINDS, ORBITAL_DEFENSE_STATS, UNITS,
  createCompetitiveState, createInitialState, migrateGameState, orbitalCombatShots, queueUnit, recoverSpaceUnit, spaceYards, tick,
  type GameState, type Unit, type UnitKind,
} from './game';

const makeUnit = (id: string, kind: UnitKind, faction: 'player' | 'enemy', x = 0, y = 0): Unit => ({
  id, kind, faction,
  hp: UNITS[kind].hp, maxHp: UNITS[kind].hp,
  shields: UNITS[kind].shields, maxShields: UNITS[kind].shields,
  ...(UNITS[kind].factory === 'ground' ? { battleX: x, battleY: y } : { orbitX: x, orbitY: y }),
});

const quietState = () => {
  const state = createInitialState({ mapSize: 'small', difficulty: 'commander', playerFaction: 'covenant' });
  state.enemyActionClock = 9999;
  state.enemyAttackClock = 9999;
  return state;
};

const removePlayerIncome = (state: GameState) => {
  state.planets[0].buildings = state.planets[0].buildings.filter(building => !['metalMine', 'crystalMine', 'goldMine'].includes(building.kind));
  state.resources = { metal: 0, crystal: 0, gold: 0 };
};

describe('Iron Covenant', () => {
  it('uses an exclusive mechanical production roster with a named ability on every unit', () => {
    const state = quietState();
    state.resources = { metal: 10_000, crystal: 10_000, gold: 10_000 };
    expect(COVENANT_GROUND_KINDS).toHaveLength(5);
    expect(COVENANT_SPACE_KINDS).toHaveLength(7);
    expect(queueUnit(state, 'terra', 'infantry').ok).toBe(false);
    const queued = queueUnit(state, 'terra', 'covenantCohort');
    expect(queued.ok).toBe(true);
    if (queued.ok) expect(tick(queued.state, UNITS.covenantCohort.time!).planets[0].groundUnits.some(unit => unit.kind === 'covenantCohort')).toBe(true);

    const abilities = [...COVENANT_GROUND_KINDS, ...COVENANT_SPACE_KINDS].map(kind => UNITS[kind].ability?.kind);
    expect(abilities.every(Boolean)).toBe(true);
    expect(new Set(abilities).size).toBe(abilities.length);
    expect(UNITS.covenantBulwark.ability?.kind).toBe('fieldRepair');
  });

  it('converts legacy Coalition machines and production queues into Covenant equivalents', () => {
    const legacy = quietState();
    const home = legacy.planets[0];
    home.groundUnits = [makeUnit('ground', 'infantry', 'player')];
    home.orbitUnits = [{ ...makeUnit('ark', 'transport', 'player'), cargo: [makeUnit('cargo', 'antiVehicle', 'player')] }];
    home.groundQueue = [{ id: 'ground-queue', kind: 'artillery', remaining: 5, total: 24 }];
    spaceYards(home)[0].spaceQueue = [{ id: 'space-queue', kind: 'escortFrigate', remaining: 5, total: 26 }];

    const migrated = migrateGameState(legacy).planets[0];
    expect(migrated.groundUnits[0].kind).toBe('covenantCohort');
    expect(migrated.orbitUnits[0].kind).toBe('covenantAssemblyArk');
    expect(migrated.orbitUnits[0].cargo?.[0].kind).toBe('covenantCohort');
    expect(migrated.groundQueue[0].kind).toBe('covenantFurnaceArtillery');
    expect(spaceYards(migrated)[0].spaceQueue?.[0].kind).toBe('covenantSalvageFrigate');
  });

  it('self-repairs Covenant ground machines and stacks nearby Repair Drone maintenance', () => {
    const state = quietState();
    const cohort = { ...makeUnit('cohort', 'covenantCohort', 'player', 20, 45), hp: 100, battleTargetX: 20, battleTargetY: 45 };
    const drone = { ...makeUnit('drone', 'covenantRepairDrone', 'player', 24, 52), hp: 100, battleTargetX: 24, battleTargetY: 52 };
    const enemy = { ...makeUnit('enemy', 'infantry', 'enemy', 90, 50), battleTargetX: 90, battleTargetY: 50, weaponCooldown: 999 };
    state.battles = [{ planetId: 'draven', attackerFaction: 'player', attackers: [cohort, drone], defenders: [enemy] }];

    const repaired = tick(state, 1).battles[0].attackers;
    expect(repaired.find(unit => unit.id === 'cohort')!.hp).toBe(100 + COVENANT_GROUND_HULL_REGEN + COVENANT_FIELD_REPAIR_PER_SECOND);
    expect(repaired.find(unit => unit.id === 'drone')!.hp).toBe(100 + COVENANT_GROUND_HULL_REGEN);
  });

  it('lets sustained infantry fire visibly damage a supported Iron Cohort', () => {
    const state = quietState();
    const cohort = { ...makeUnit('cohort', 'covenantCohort', 'player', 40, 50), battleTargetX: 40, battleTargetY: 50 };
    const drone = { ...makeUnit('drone', 'covenantRepairDrone', 'player', 42, 58), battleTargetX: 42, battleTargetY: 58, weaponCooldown: 999 };
    const infantry = { ...makeUnit('infantry', 'infantry', 'enemy', 50, 50), battleTargetX: 50, battleTargetY: 50 };
    state.battles = [{ planetId: 'draven', attackerFaction: 'player', attackers: [cohort, drone], defenders: [infantry] }];

    const result = tick(state, 10).battles[0].attackers.find(unit => unit.id === 'cohort')!;
    expect(result.hp).toBeLessThan(result.maxHp - 10);
  });

  it('uses modular fire, shield breaking, ablative armor, and Juggernaut splash on the ground', () => {
    const fight = (attackers: Unit[], defenders: Unit[]) => {
      const state = quietState();
      state.battles = [{ planetId: 'draven', attackerFaction: 'player', attackers, defenders }];
      return tick(state, .1).battles[0];
    };
    const target = makeUnit('target', 'lightTank', 'enemy', 45, 50);
    const solo = fight([makeUnit('cohort', 'covenantCohort', 'player', 35, 50)], [target]);
    const modular = fight([
      makeUnit('cohort', 'covenantCohort', 'player', 35, 50),
      { ...makeUnit('drone', 'covenantRepairDrone', 'player', 31, 56), weaponCooldown: 999 },
    ], [target]);
    expect(modular.defenders[0].shields).toBeLessThan(solo.defenders[0].shields);

    const shielded = makeUnit('shielded', 'aegisBastionTank', 'enemy', 62, 30);
    const broken = fight([makeUnit('furnace', 'covenantFurnaceArtillery', 'player', 35, 30)], [shielded]);
    expect(shielded.shields - broken.defenders[0].shields).toBeCloseTo(UNITS.covenantFurnaceArtillery.weapon.damage * 1.5);

    const strider = makeUnit('strider', 'covenantBastionStrider', 'player', 45, 70);
    const armored = fight([makeUnit('shooter', 'lightTank', 'enemy', 35, 70)], [strider]);
    expect(strider.shields - armored.defenders[0].shields).toBeCloseTo(UNITS.lightTank.weapon.damage * .7);

    const splashed = fight(
      [makeUnit('juggernaut', 'covenantJuggernaut', 'player', 35, 85)],
      [makeUnit('primary', 'lightTank', 'enemy', 65, 85), makeUnit('secondary', 'lightTank', 'enemy', 67, 85)],
    );
    expect(splashed.defenders.find(unit => unit.id === 'secondary')!.shields).toBeLessThan(UNITS.lightTank.shields);
  });

  it('repairs ships anywhere and combines Assembly Ark and Foundry repair fields in combat', () => {
    const damaged = { ...makeUnit('ship', 'covenantChainFrigate', 'player'), hp: 100 };
    expect(recoverSpaceUnit(damaged, false, 2, 'covenant').hp).toBe(104);

    const state = quietState();
    const planet = state.planets[0];
    planet.orbitUnits = [
      makeUnit('ark', 'covenantAssemblyArk', 'player', 0, 0),
      makeUnit('foundry', 'covenantFoundryCruiser', 'player', 80, 0),
      { ...makeUnit('ally', 'covenantChainFrigate', 'player', 100, 0), hp: 100 },
      { ...makeUnit('enemy', 'escortFrigate', 'enemy', 180, 0), weaponCooldown: 999 },
    ];
    const repaired = tick(state, 1).planets[0].orbitUnits.find(unit => unit.id === 'ally')!;
    expect(repaired.hp).toBe(115);
  });

  it('focuses damaged ships, splits Fabricator volleys, and dismantles orbital platforms', () => {
    const world = quietState().planets[0];
    world.orbitUnits = [makeUnit('chain', 'covenantChainFrigate', 'player'), { ...makeUnit('damaged', 'destroyer', 'enemy', 180, 0), hp: UNITS.destroyer.hp - 1 }];
    expect(orbitalCombatShots(world).find(shot => shot.attackerId === 'chain')?.damageMultiplier).toBe(1.5);

    world.orbitUnits = [makeUnit('carrier', 'covenantFabricatorCarrier', 'player'), makeUnit('target-a', 'destroyer', 'enemy', 150, 0), makeUnit('target-b', 'destroyer', 'enemy', 170, 0)];
    expect(orbitalCombatShots(world).filter(shot => shot.attackerId === 'carrier').map(shot => shot.targetId)).toEqual(['target-a', 'target-b']);

    world.owner = 'enemy';
    world.orbitUnits = [makeUnit('dreadforge', 'covenantDreadforge', 'player', 285, 0)];
    world.buildings = [{ id: 'platform', kind: 'spaceDefense', hp: ORBITAL_DEFENSE_STATS.hp, maxHp: ORBITAL_DEFENSE_STATS.hp, shields: ORBITAL_DEFENSE_STATS.shields, maxShields: ORBITAL_DEFENSE_STATS.shields }];
    expect(orbitalCombatShots(world).find(shot => shot.attackerId === 'dreadforge')?.damageMultiplier).toBe(2);
  });

  it('reclaims ground casualties and boosts orbital metal recovery with a surviving Salvage Frigate', () => {
    const groundState = quietState();
    removePlayerIncome(groundState);
    groundState.battles = [{
      planetId: 'draven', attackerFaction: 'player',
      attackers: [makeUnit('cohort', 'covenantCohort', 'player', 40, 50)],
      defenders: [{ ...makeUnit('victim', 'infantry', 'enemy', 48, 50), hp: 1, shields: 0 }],
    }];
    const groundResult = tick(groundState, .1);
    expect(groundResult.resources.metal).toBe(Math.floor(UNITS.infantry.cost.metal * .25));

    const orbitState = quietState();
    removePlayerIncome(orbitState);
    orbitState.planets[0].orbitUnits = [
      makeUnit('salvager', 'covenantSalvageFrigate', 'player', 0, 0),
      { ...makeUnit('victim', 'transport', 'enemy', 100, 0), hp: 1, shields: 0, weaponCooldown: 999 },
    ];
    const orbitResult = tick(orbitState, .1);
    expect(orbitResult.resources.metal).toBe(Math.floor(Math.floor(UNITS.transport.cost.metal * .25) * 1.5));
    expect(orbitResult.messages[0]).toContain('COVENANT SALVAGE');
  });

  it('makes an AI Covenant empire build only Covenant machines', () => {
    const state = createCompetitiveState({ mapSize: 'small', difficulty: 'commander' }, [
      { faction: 'player', controller: 'human', civilization: 'human' },
      { faction: 'enemy', controller: 'ai', civilization: 'covenant' },
    ]);
    state.enemyActionClock = 0;
    state.enemyAttackClock = 9999;
    const advanced = tick(state, .1);
    const enemyHome = advanced.planets.find(planet => planet.owner === 'enemy')!;
    const queuedKinds = [...enemyHome.groundQueue, ...spaceYards(enemyHome).flatMap(yard => yard.spaceQueue ?? [])].map(item => item.kind);
    const covenantKinds = new Set<UnitKind>([...COVENANT_GROUND_KINDS, ...COVENANT_SPACE_KINDS]);
    expect(queuedKinds.length).toBeGreaterThan(0);
    expect(queuedKinds.every(kind => covenantKinds.has(kind))).toBe(true);
  });
});
