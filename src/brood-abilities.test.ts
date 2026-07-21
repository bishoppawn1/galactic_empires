import { describe, expect, it } from 'vitest';
import {
  BROOD_GROUND_KINDS, BROOD_SPACE_KINDS, ORBITAL_DEFENSE_STATS, UNITS,
  createInitialState, orbitalCombatShots, recoverSpaceUnit, tick,
  type GameState, type Unit, type UnitKind,
} from './game';

const makeUnit = (id: string, kind: UnitKind, faction: 'player' | 'enemy', x = 0, y = 0): Unit => ({
  id, kind, faction,
  hp: UNITS[kind].hp, maxHp: UNITS[kind].hp,
  shields: UNITS[kind].shields, maxShields: UNITS[kind].shields,
  ...(UNITS[kind].factory === 'ground' ? { battleX: x, battleY: y } : { orbitX: x, orbitY: y }),
});

const quietState = () => {
  const state = createInitialState({ mapSize: 'small', difficulty: 'commander', playerFaction: 'brood' });
  state.enemyActionClock = 9999;
  state.enemyAttackClock = 9999;
  return state;
};

const totalIntegrity = (unit: Unit) => unit.hp + unit.shields;

function groundFight(attackers: Unit[], defenders: Unit[]): GameState {
  const state = quietState();
  state.battles = [{ planetId: 'terra', attackerFaction: 'player', attackers, defenders }];
  return state;
}

describe('Brood organism abilities', () => {
  it('gives every producible Brood organism a named, explained ability', () => {
    [...BROOD_GROUND_KINDS, ...BROOD_SPACE_KINDS].forEach(kind => {
      expect(UNITS[kind].ability?.label).toBeTruthy();
      expect(UNITS[kind].ability?.description.length).toBeGreaterThan(12);
    });
    expect(UNITS.spineTower.ability?.kind).toBe('corrosiveBile');
  });

  it('makes nearby Broodling Packs strengthen one another', () => {
    const target = makeUnit('target', 'siegeWalker', 'enemy', 48, 50);
    const solo = tick(groundFight([makeUnit('pack-a', 'broodling', 'player', 42, 50)], [target]), .1);
    const swarm = tick(groundFight([
      makeUnit('pack-a', 'broodling', 'player', 42, 50),
      makeUnit('pack-b', 'broodling', 'player', 33, 50),
    ], [target]), .1);
    const soloTarget = solo.battles[0].defenders[0];
    const swarmTarget = swarm.battles[0].defenders[0];
    expect(totalIntegrity(swarmTarget)).toBeLessThan(totalIntegrity(soloTarget));
  });

  it('makes acid hits corrode a target and amplify follow-up damage', () => {
    const marked = tick(groundFight(
      [makeUnit('spitter', 'acidSpitter', 'player', 40, 50)],
      [makeUnit('target', 'siegeWalker', 'enemy', 60, 50)],
    ), .1);
    expect(marked.battles[0].defenders[0].corrodedFor).toBe(5);

    const healthyTarget = { ...makeUnit('target', 'siegeWalker', 'enemy', 50, 50), shields: 0 };
    const corrodedTarget = { ...healthyTarget, corrodedFor: 5 };
    const normal = tick(groundFight([makeUnit('crusher', 'crusherBeast', 'player', 42, 50)], [healthyTarget]), .1);
    const corroded = tick(groundFight([makeUnit('crusher', 'crusherBeast', 'player', 42, 50)], [corrodedTarget]), .1);
    expect(corroded.battles[0].defenders[0].hp).toBeLessThan(normal.battles[0].defenders[0].hp);
  });

  it('lets burst spores splash clustered defenders and thorned carapaces retaliate', () => {
    const splashed = tick(groundFight(
      [makeUnit('lobber', 'sporeLobber', 'player', 40, 50)],
      [{ ...makeUnit('primary', 'siegeWalker', 'enemy', 55, 50), shields: 0 }, { ...makeUnit('secondary', 'siegeWalker', 'enemy', 62, 50), shields: 0 }],
    ), .1);
    expect(splashed.battles[0].defenders.find(unit => unit.id === 'secondary')!.hp).toBeLessThan(UNITS.siegeWalker.hp);

    const attacker = makeUnit('attacker', 'infantry', 'player', 40, 50);
    const thorned = { ...makeUnit('thorned', 'carapaceBeast', 'enemy', 48, 50), weaponCooldown: 999 };
    const reflected = tick(groundFight([attacker], [thorned]), .1);
    expect(reflected.battles[0].attackers[0].hp).toBeLessThan(attacker.hp);
  });

  it('lets Needle Frigates bypass shields and Brood Carriers attack two ships', () => {
    const needleState = quietState();
    const needleWorld = needleState.planets[0];
    needleWorld.orbitUnits = [makeUnit('needle', 'needleFrigate', 'player', 0, 0), makeUnit('target', 'destroyer', 'enemy', 150, 0)];
    const pierced = tick(needleState, .1).planets[0].orbitUnits.find(unit => unit.id === 'target')!;
    expect(pierced.hp).toBeLessThan(pierced.maxHp);
    expect(pierced.shields).toBeLessThan(pierced.maxShields);

    const carrierState = quietState();
    const carrierWorld = carrierState.planets[0];
    carrierWorld.orbitUnits = [
      makeUnit('carrier', 'broodCarrier', 'player', 0, 0),
      makeUnit('target-a', 'destroyer', 'enemy', 150, 0),
      makeUnit('target-b', 'destroyer', 'enemy', 170, 0),
    ];
    const carrierShots = orbitalCombatShots(carrierWorld).filter(shot => shot.attackerId === 'carrier');
    expect(carrierShots.map(shot => shot.targetId)).toEqual(['target-a', 'target-b']);
    const swarmed = tick(carrierState, .1).planets[0].orbitUnits;
    expect(swarmed.find(unit => unit.id === 'target-a')!.shields).toBeLessThan(UNITS.destroyer.shields);
    expect(swarmed.find(unit => unit.id === 'target-b')!.shields).toBeLessThan(UNITS.destroyer.shields);
  });

  it('makes Brood fleet specialists regenerate, hunt transports, devour, and crack platforms', () => {
    const ark = { ...makeUnit('ark', 'sporeArk', 'player'), hp: 100 };
    expect(recoverSpaceUnit(ark, false, 2).hp).toBe(108);

    const target = { ...makeUnit('loaded', 'transport', 'enemy', 100, 0), cargo: [makeUnit('cargo', 'infantry', 'enemy')] };
    const hunterWorld = quietState().planets[0];
    hunterWorld.orbitUnits = [makeUnit('claw', 'clawFrigate', 'player', 0, 0), target];
    expect(orbitalCombatShots(hunterWorld).find(shot => shot.attackerId === 'claw')?.damageMultiplier).toBe(1.5);

    const eaterWorld = quietState().planets[0];
    eaterWorld.owner = 'enemy';
    eaterWorld.orbitUnits = [makeUnit('eater', 'worldEater', 'player', 285, 0)];
    eaterWorld.buildings = [{ id: 'platform', kind: 'spaceDefense', hp: ORBITAL_DEFENSE_STATS.hp, maxHp: ORBITAL_DEFENSE_STATS.hp, shields: ORBITAL_DEFENSE_STATS.shields, maxShields: ORBITAL_DEFENSE_STATS.shields }];
    expect(orbitalCombatShots(eaterWorld).find(shot => shot.attackerId === 'eater')?.damageMultiplier).toBe(2);

    const devourState = quietState();
    const devourWorld = devourState.planets[0];
    devourWorld.owner = 'enemy';
    devourWorld.orbitUnits = [{ ...makeUnit('leviathan', 'leviathan', 'player', 0, 0), hp: 900 }, makeUnit('prey', 'destroyer', 'enemy', 150, 0)];
    const fed = tick(devourState, .1).planets[0].orbitUnits.find(unit => unit.id === 'leviathan')!;
    expect(fed.hp).toBeGreaterThan(900);
  });

  it('lets synapse ships strengthen allies and phase carapaces reduce incoming damage', () => {
    const fleet = (support: boolean, targetKind: UnitKind = 'destroyer') => {
      const state = quietState();
      state.planets[0].orbitUnits = [makeUnit('claw', 'clawFrigate', 'player', -50, 0), makeUnit('target', targetKind, 'enemy', 150, 0)];
      if (support) state.planets[0].orbitUnits.push(makeUnit('hive', 'hiveCruiser', 'player', -250, 0));
      return tick(state, .1).planets[0].orbitUnits.find(unit => unit.id === 'target')!;
    };
    expect(totalIntegrity(fleet(true))).toBeLessThan(totalIntegrity(fleet(false)));

    const destroyer = fleet(false, 'destroyer');
    const stalker = fleet(false, 'voidStalker');
    const destroyerLoss = UNITS.destroyer.hp + UNITS.destroyer.shields - totalIntegrity(destroyer);
    const stalkerLoss = UNITS.voidStalker.hp + UNITS.voidStalker.shields - totalIntegrity(stalker);
    expect(stalkerLoss).toBeLessThan(destroyerLoss);
  });
});
