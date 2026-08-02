import { describe, expect, it } from 'vitest';
import {
  canGroundUnitAttackTarget,
  civilizationUnitKind,
  createInitialState,
  groundFormationSize,
  groundUnitKindsForCivilization,
  tick,
  UNITS,
  type GroundUnitKind,
  type PlayableFaction,
  type Unit,
} from './game';

const unit = (id: string, kind: GroundUnitKind, faction: 'player' | 'enemy', battleX: number): Unit => ({
  id,
  kind,
  faction,
  hp: UNITS[kind].hp,
  maxHp: UNITS[kind].hp,
  shields: UNITS[kind].shields,
  maxShields: UNITS[kind].shields,
  battleX,
  battleY: 50,
});

const damageTaken = (target: Unit) =>
  target.maxHp - target.hp + target.maxShields - target.shields;

const SCOUT_AIR: GroundUnitKind[] = [
  'dragonflyScout', 'razorwing', 'aegisSeraphSkimmer', 'covenantWaspDrone',
];
const BOMBER_AIR: GroundUnitKind[] = [
  'falconGunship', 'sporewing', 'aegisHaloGunship', 'covenantFurnaceGunship',
];
const FLAK_BY_FACTION: Record<PlayableFaction, GroundUnitKind> = {
  human: 'flakRover',
  brood: 'spineFlak',
  aegis: 'aegisSkyguard',
  covenant: 'covenantFlakEngine',
};
const SURFACE_ONLY: GroundUnitKind[] = [
  'recon', 'lightTank', 'railgunTank', 'plasmaTank', 'siegeWalker',
  'skitterer', 'carapaceBeast', 'crusherBeast', 'acidBehemoth', 'siegeCrawler',
  'aegisBastionTank', 'aegisFortressWalker',
  'covenantBastionStrider', 'covenantJuggernaut',
  ...BOMBER_AIR,
];

function damageFrom(attackerKind: GroundUnitKind, targetKind: GroundUnitKind) {
  const state = createInitialState();
  const attacker = unit('attacker', attackerKind, 'player', 40);
  const target = { ...unit('target', targetKind, 'enemy', 45), weaponCooldown: 999 };
  state.battles = [{ planetId: 'draven', attackers: [attacker], defenders: [target] }];
  const result = tick(state, .01);
  return damageTaken(result.battles[0].defenders[0]);
}

describe('ground anti-air roles', () => {
  it('keeps aircraft durability and firepower below their original tank-like levels', () => {
    const durability = (kind: GroundUnitKind) => UNITS[kind].hp + UNITS[kind].shields;
    const damagePerSecond = (kind: GroundUnitKind) => {
      const weapon = UNITS[kind].weapon;
      return weapon.damage * weapon.projectiles / weapon.cooldown;
    };

    expect(SCOUT_AIR.map(durability)).toEqual([130, 90, 265, 140]);
    expect(BOMBER_AIR.map(durability)).toEqual([325, 280, 575, 445]);
    expect(BOMBER_AIR.map(damagePerSecond)).toEqual([
      expect.closeTo(7.47, 1),
      6,
      expect.closeTo(9.33, 1),
      14.4,
    ]);
  });

  it('gives every faction a producible ground flak unit with dedicated anti-infantry and anti-air fire', () => {
    (Object.entries(FLAK_BY_FACTION) as [PlayableFaction, GroundUnitKind][]).forEach(([faction, flakKind]) => {
      expect(civilizationUnitKind(faction, 'flakRover')).toBe(flakKind);
      expect(groundUnitKindsForCivilization(faction)).toContain(flakKind);
      expect(UNITS[flakKind]).toMatchObject({
        factory: 'ground',
        ability: { kind: 'groundFlak' },
      });
      expect(groundFormationSize(flakKind)).toBe(4);
      expect(UNITS[flakKind].time).toBeGreaterThan(0);
    });
  });

  it('keeps each aerial scout lightly armed and able to attack other aircraft', () => {
    SCOUT_AIR.forEach((scoutKind, index) => {
      const weapon = UNITS[scoutKind].weapon;
      const bomberWeapon = UNITS[BOMBER_AIR[index]].weapon;
      const scoutDps = weapon.damage * weapon.projectiles / weapon.cooldown;
      const bomberDps = bomberWeapon.damage * bomberWeapon.projectiles / bomberWeapon.cooldown;
      expect(scoutDps).toBeGreaterThan(0);
      expect(scoutDps).toBeLessThan(bomberDps);
      expect(canGroundUnitAttackTarget(unit('scout', scoutKind, 'player', 40), unit('air', 'dragonflyScout', 'enemy', 45))).toBe(true);
      expect(damageFrom(scoutKind, 'dragonflyScout')).toBeGreaterThan(0);
    });
  });

  it('prevents bombers, tanks, walkers, and surface recon from damaging aircraft', () => {
    SURFACE_ONLY.forEach(kind => {
      const attacker = unit('surface-attacker', kind, 'player', 40);
      const aircraft = unit('air-target', 'dragonflyScout', 'enemy', 45);
      expect(UNITS[kind].groundTargeting).toBe('surface');
      expect(canGroundUnitAttackTarget(attacker, aircraft)).toBe(false);
      expect(damageFrom(kind, 'dragonflyScout')).toBe(0);
    });
  });

  it('applies the ground flak damage bonus to both infantry and aircraft, but not vehicles', () => {
    const infantryDamage = damageFrom('flakRover', 'infantry');
    const aircraftDamage = damageFrom('flakRover', 'dragonflyScout');
    const vehicleDamage = damageFrom('flakRover', 'lightTank');

    expect(infantryDamage).toBeCloseTo(vehicleDamage * 1.5);
    expect(aircraftDamage).toBeCloseTo(vehicleDamage * 1.5);
  });

  it('makes every AI civilization establish flak, scout-air, and gunship roles', () => {
    (Object.keys(FLAK_BY_FACTION) as PlayableFaction[]).forEach(civilization => {
      let state = createInitialState({ mapSize: 'small', difficulty: 'commander', enemyFaction: civilization });
      const home = state.planets.find(planet => planet.owner === 'enemy')!;
      home.buildings.push({ id: 'advanced-ground', kind: 'advancedGroundFactory' });
      state.enemyCompletedResearch.push('advancedIndustry', 'groundWarfare');
      state.enemyResources = { metal: 10000, crystal: 10000, gold: 10000, biomass: 10000 };
      state.enemyActionClock = 0;
      state.enemyAttackClock = 9999;
      const expected = [
        civilizationUnitKind(civilization, 'flakRover'),
        civilizationUnitKind(civilization, 'dragonflyScout'),
        civilizationUnitKind(civilization, 'falconGunship'),
      ];

      for (const kind of expected) {
        state = tick(state, 0);
        expect(home.id).toBe(state.planets.find(planet => planet.owner === 'enemy')!.id);
        expect(state.planets.find(planet => planet.id === home.id)!.groundQueue[0].kind).toBe(kind);
        state.planets.find(planet => planet.id === home.id)!.groundQueue[0].remaining = 0;
        state.enemyActionClock = 0;
      }
    });
  });
});
