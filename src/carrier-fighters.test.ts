import { describe, expect, it } from 'vitest';
import {
  SPACE_COMBAT_DAMAGE_MULTIPLIER, UNITS, carrierFighterCount, createInitialState, migrateGameState, recoverCarrierFighters, tick,
  type SpaceUnitKind, type Unit,
} from './game';

const CARRIERS: SpaceUnitKind[] = ['assaultCarrier', 'broodCarrier', 'aegisCitadelCarrier', 'covenantFabricatorCarrier'];

const makeShip = (id: string, kind: SpaceUnitKind, faction: 'player' | 'enemy', x = 0): Unit => ({
  id, kind, faction,
  hp: UNITS[kind].hp, maxHp: UNITS[kind].hp,
  shields: UNITS[kind].shields, maxShields: UNITS[kind].shields,
  orbitX: x, orbitY: 0,
});

const combatState = (fighterCount: number, fighterLossProgress = 0) => {
  const state = createInitialState({ mapSize: 'small', difficulty: 'commander' });
  state.enemyActionClock = 9999;
  state.enemyAttackClock = 9999;
  const carrier = { ...makeShip('carrier', 'assaultCarrier', 'player'), fighterCount, fighterBuildProgress: 0, fighterLossProgress };
  const target = { ...makeShip('target', 'destroyer', 'enemy', 100), weaponCooldown: 999 };
  state.planets[0].orbitUnits = [carrier, target];
  return state;
};

describe('carrier fighter wings', () => {
  it('gives every civilization carrier a replenishing fighter complement', () => {
    CARRIERS.forEach(kind => {
      const wing = UNITS[kind].fighterWing;
      expect(wing?.capacity).toBeGreaterThanOrEqual(4);
      expect(wing?.rebuildTime).toBeGreaterThan(wing?.attritionTime ?? 0);
      expect(carrierFighterCount(makeShip(kind, kind, 'player'))).toBe(wing?.capacity);
    });
  });

  it('migrates existing carriers with a full fighter wing', () => {
    const state = createInitialState({ mapSize: 'small', difficulty: 'commander' });
    state.planets[0].orbitUnits = [makeShip('legacy-carrier', 'assaultCarrier', 'player')];
    const carrier = migrateGameState(state).planets[0].orbitUnits[0];
    expect(carrier.fighterCount).toBe(UNITS.assaultCarrier.fighterWing!.capacity);
    expect(carrier.fighterBuildProgress).toBe(0);
  });

  it('slowly rebuilds destroyed fighters without exceeding wing capacity', () => {
    const wing = UNITS.assaultCarrier.fighterWing!;
    const damaged = { ...makeShip('carrier', 'assaultCarrier', 'player'), fighterCount: 1, fighterBuildProgress: wing.rebuildTime - .25 };
    const rebuilt = recoverCarrierFighters(damaged, .5);
    expect(rebuilt.fighterCount).toBe(2);
    expect(rebuilt.fighterBuildProgress).toBeCloseTo(.25);
    expect(recoverCarrierFighters({ ...rebuilt, fighterCount: wing.capacity }, 100).fighterCount).toBe(wing.capacity);
  });

  it('scales carrier damage with surviving fighters', () => {
    const fullCount = UNITS.assaultCarrier.fighterWing!.capacity;
    const full = tick(combatState(fullCount), .1).planets[0].orbitUnits.find(unit => unit.id === 'target')!;
    const reduced = tick(combatState(fullCount / 2), .1).planets[0].orbitUnits.find(unit => unit.id === 'target')!;
    const fullDamage = UNITS.destroyer.shields - full.shields;
    const reducedDamage = UNITS.destroyer.shields - reduced.shields;
    expect(fullDamage).toBeCloseTo(UNITS.assaultCarrier.weapon.damage * UNITS.assaultCarrier.weapon.projectiles * SPACE_COMBAT_DAMAGE_MULTIPLIER);
    expect(reducedDamage).toBeCloseTo(fullDamage / 2);
  });

  it('loses deployed fighters to combat attrition before rebuilding replacements', () => {
    const wing = UNITS.assaultCarrier.fighterWing!;
    const result = tick(combatState(wing.capacity, wing.attritionTime - .05), .1);
    const carrier = result.planets[0].orbitUnits.find(unit => unit.id === 'carrier')!;
    expect(carrier.fighterCount).toBe(wing.capacity - 1);
    expect(carrier.fighterBuildProgress).toBe(0);
  });
});
