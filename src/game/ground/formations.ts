import type { GroundUnitKind, Unit, UnitKind } from '../types';

export type GroundFormationSize = 1 | 2 | 4 | 8;

export const GROUND_FORMATION_SIZES: Record<GroundUnitKind, GroundFormationSize> = {
  infantry: 8,
  antiVehicle: 8,
  recon: 4,
  lightTank: 4,
  artillery: 4,
  dragonflyScout: 4,
  falconGunship: 4,
  shockTrooper: 8,
  railgunTank: 4,
  plasmaTank: 4,
  siegeWalker: 2,
  defenseTurret: 1,
  broodling: 8,
  acidSpitter: 8,
  skitterer: 4,
  carapaceBeast: 4,
  sporeLobber: 4,
  razorwing: 4,
  sporewing: 4,
  synapseGuard: 8,
  crusherBeast: 2,
  acidBehemoth: 2,
  siegeCrawler: 2,
  spineTower: 1,
  aegisWarden: 8,
  aegisBastionTank: 4,
  aegisRampartArtillery: 4,
  aegisSeraphSkimmer: 4,
  aegisHaloGunship: 4,
  aegisPaladinGuard: 8,
  aegisFortressWalker: 2,
  covenantCohort: 8,
  covenantRepairDrone: 8,
  covenantBastionStrider: 4,
  covenantFurnaceArtillery: 4,
  covenantWaspDrone: 4,
  covenantFurnaceGunship: 4,
  covenantJuggernaut: 2,
  covenantBulwark: 1,
};

export const GROUND_SHELL_PROJECTILE_KINDS = new Set<GroundUnitKind>([
  'lightTank',
  'artillery',
  'railgunTank',
  'plasmaTank',
  'siegeWalker',
  'defenseTurret',
  'sporeLobber',
  'sporewing',
  'siegeCrawler',
  'aegisBastionTank',
  'aegisRampartArtillery',
  'aegisFortressWalker',
  'covenantBastionStrider',
  'covenantFurnaceArtillery',
  'covenantJuggernaut',
  'covenantBulwark',
]);

export const groundFormationSize = (kind: UnitKind): GroundFormationSize =>
  kind in GROUND_FORMATION_SIZES ? GROUND_FORMATION_SIZES[kind as GroundUnitKind] : 1;

export const groundUnitShowsProjectile = (kind: UnitKind) =>
  GROUND_SHELL_PROJECTILE_KINDS.has(kind as GroundUnitKind);

export function groundFormationMemberHealth(unit: Pick<Unit, 'kind' | 'hp' | 'maxHp' | 'memberHp'>): number[] {
  const size = groundFormationSize(unit.kind);
  const memberMaximum = unit.maxHp / size;
  const totalHp = Math.max(0, Math.min(unit.maxHp, unit.hp));
  if (unit.memberHp?.length === size) {
    const normalized = unit.memberHp.map(hp => Math.max(0, Math.min(memberMaximum, Number.isFinite(hp) ? hp : 0)));
    const memberTotal = normalized.reduce((total, hp) => total + hp, 0);
    if (Math.abs(memberTotal - totalHp) <= 1e-6) return normalized;
  }
  let remaining = totalHp;
  return Array.from({ length: size }, () => {
    const hp = Math.min(memberMaximum, remaining);
    remaining -= hp;
    return hp;
  });
}

export const groundFormationAliveCount = (unit: Pick<Unit, 'kind' | 'hp' | 'maxHp' | 'memberHp'>) =>
  groundFormationMemberHealth(unit).filter(hp => hp > 1e-6).length;

export const groundFormationStrength = (unit: Pick<Unit, 'kind' | 'hp' | 'maxHp' | 'memberHp'>) =>
  groundFormationAliveCount(unit) / groundFormationSize(unit.kind);
