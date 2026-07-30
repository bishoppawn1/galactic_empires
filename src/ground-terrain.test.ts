import { describe, expect, it } from 'vitest';
import {
  GROUND_BATTLEFIELD_WIDTH,
  GROUND_FOREST_DAMAGE_MULTIPLIER,
  GROUND_UNIT_HITBOX_RADIUS,
  UNITS,
  createInitialState,
  groundForestAtPosition,
  groundPositionBlocked,
  groundTerrainForPlanet,
  groundTerrainMovementStep,
  maneuverGroundUnits,
  tick,
  type Unit,
} from './game';

const infantry = (id: string, faction: Unit['faction'], battleX: number, battleY: number): Unit => ({
  id,
  kind: 'infantry',
  faction,
  hp: UNITS.infantry.hp,
  maxHp: UNITS.infantry.hp,
  shields: UNITS.infantry.shields,
  maxShields: UNITS.infantry.shields,
  battleX,
  battleY,
});

describe('functional ground terrain', () => {
  it('generates the same rock and forest layout for the simulation and renderer', () => {
    const first = groundTerrainForPlanet('draven');
    const second = groundTerrainForPlanet('draven');
    expect(second).toEqual(first);
    expect(first.filter(piece => piece.kind === 'rocks')).toHaveLength(12);
    expect(first.filter(piece => piece.kind === 'forest')).toHaveLength(12);
  });

  it('routes movement around impassable rock formations', () => {
    const rock = groundTerrainForPlanet('draven').find(piece => piece.kind === 'rocks')!;
    const clearance = (rock.size * .5 + GROUND_UNIT_HITBOX_RADIUS) / GROUND_BATTLEFIELD_WIDTH * 100;
    const start = { battleX: rock.x - clearance - .5, battleY: rock.y };
    const target = { battleX: rock.x + clearance + .5, battleY: rock.y };
    while (groundPositionBlocked('draven', start)) start.battleX -= .5;
    while (groundPositionBlocked('draven', target)) target.battleX += .5;
    expect(groundPositionBlocked('draven', start)).toBe(false);

    let position = start;
    for (let step = 0; step < 240 && Math.hypot(target.battleX - position.battleX, target.battleY - position.battleY) > .1; step += 1) {
      position = groundTerrainMovementStep('draven', 'pathfinder', position, target, .35);
      expect(groundPositionBlocked('draven', position)).toBe(false);
    }

    expect(Math.hypot(target.battleX - position.battleX, target.battleY - position.battleY)).toBeLessThan(.1);
  });

  it('lets flying ground units cross and occupy rock formations', () => {
    const state = createInitialState();
    const rock = groundTerrainForPlanet('draven').find(piece => piece.kind === 'rocks')!;
    const scout: Unit = {
      id: 'air-scout',
      kind: 'dragonflyScout',
      faction: 'player',
      hp: UNITS.dragonflyScout.hp,
      maxHp: UNITS.dragonflyScout.hp,
      shields: UNITS.dragonflyScout.shields,
      maxShields: UNITS.dragonflyScout.shields,
      battleX: Math.max(5, rock.x - 12),
      battleY: rock.y,
    };
    state.battles = [{
      planetId: 'draven',
      attackers: [scout],
      defenders: [{ ...infantry('distant-defender', 'enemy', 95, 95), weaponCooldown: 999 }],
    }];

    const ordered = maneuverGroundUnits(state, 'draven', [scout.id], rock.x, rock.y, true);
    expect(ordered.ok).toBe(true);
    if (!ordered.ok) return;
    expect(groundPositionBlocked('draven', {
      battleX: ordered.state.battles[0].attackers[0].battleTargetX!,
      battleY: ordered.state.battles[0].attackers[0].battleTargetY!,
    })).toBe(true);

    const arrived = tick(ordered.state, 2);
    const airborne = arrived.battles[0].attackers[0];
    expect(groundPositionBlocked('draven', { battleX: airborne.battleX!, battleY: airborne.battleY! })).toBe(true);
  });

  it('reduces damage received by units inside forests by thirty percent', () => {
    const state = createInitialState();
    const forest = groundTerrainForPlanet('draven').find(piece => piece.kind === 'forest')!;
    const target = infantry('covered', 'player', forest.x, forest.y);
    const attacker = infantry('attacker', 'rival2', forest.x - 5, forest.y);
    expect(groundForestAtPosition('draven', { battleX: target.battleX!, battleY: target.battleY! })).toBe(true);
    state.battles = [{ planetId: 'draven', attackers: [target], defenders: [attacker] }];

    const fired = tick(state, .1);
    const covered = fired.battles[0].attackers[0];
    const salvo = UNITS.infantry.weapon.damage * UNITS.infantry.weapon.projectiles;
    expect(covered.shields).toBeCloseTo(target.maxShields - salvo * GROUND_FOREST_DAMAGE_MULTIPLIER);
  });
});
