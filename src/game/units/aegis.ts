import type { GroundUnitKind, ResourcePool, SpaceUnitKind, UnitDefinition } from '../types';

const cost = (metal: number, crystal: number, gold: number): ResourcePool => ({ metal, crystal, gold });

export const AEGIS_GROUND_KINDS = [
  'aegisWarden', 'aegisBastionTank', 'aegisRampartArtillery', 'aegisPaladinGuard', 'aegisFortressWalker',
] satisfies GroundUnitKind[];

export const AEGIS_SPACE_KINDS = [
  'aegisBastionLander', 'aegisShieldMonitor', 'aegisLanceFrigate', 'aegisWardCruiser', 'aegisCitadelCarrier', 'aegisSovereignDreadnought',
] satisfies SpaceUnitKind[];

type AegisUnitKind = typeof AEGIS_GROUND_KINDS[number] | typeof AEGIS_SPACE_KINDS[number];

export const AEGIS_UNITS: Record<AegisUnitKind, UnitDefinition> = {
  aegisWarden: { label: 'Warden Cohort', description: 'Shield-bearing line infantry that advances as a compact defensive wall.', cost: cost(58, 25, 12), time: 18, factory: 'ground', hp: 150, shields: 100, range: 15, moveSpeed: 4.8, weapon: { label: 'Triad Pulse Carbines', damage: 1.5, cooldown: .9, projectiles: 3, effect: 'pulse' } },
  aegisBastionTank: { label: 'Bastion Tank', description: 'A super-heavy shield tank built to anchor a deliberate armored advance.', cost: cost(160, 95, 55), time: 40, factory: 'ground', hp: 420, shields: 230, range: 20, moveSpeed: 3.4, weapon: { label: 'Bastion Rail Cannon', damage: 16, cooldown: 1.6, projectiles: 1, effect: 'railgun' } },
  aegisRampartArtillery: { label: 'Rampart Artillery', description: 'A slow stabilizer platform that breaks formations from behind the shield line.', cost: cost(170, 120, 70), time: 44, factory: 'ground', hp: 250, shields: 170, range: 38, moveSpeed: 2.2, weapon: { label: 'Twin Rampart Bombards', damage: 14, cooldown: 3, projectiles: 2, effect: 'artillery' } },
  aegisPaladinGuard: { label: 'Paladin Guard', description: 'Elite powered infantry with projector shields and paired energy lances.', cost: cost(145, 110, 70), time: 38, factory: 'ground', hp: 300, shields: 240, range: 14, moveSpeed: 4, weapon: { label: 'Paired Arc Lances', damage: 5, cooldown: 1.1, projectiles: 2, effect: 'plasma' }, requires: 'groundWarfare', advancedFactory: true },
  aegisFortressWalker: { label: 'Fortress Walker', description: 'A walking citadel whose siege cannon dominates a planetary battlefield.', cost: cost(390, 300, 200), time: 86, factory: 'ground', hp: 850, shields: 450, range: 42, moveSpeed: 1.7, weapon: { label: 'Judgment Siege Cannon', damage: 52, cooldown: 2.8, projectiles: 1, effect: 'siege' }, requires: 'heavyArmor', advancedFactory: true },
  aegisBastionLander: { label: 'Bastion Lander', description: 'An armored five-squad landing ship protected by paired point-defense emitters.', cost: cost(150, 110, 70), time: 35, factory: 'space', hp: 340, shields: 260, range: 190, moveSpeed: 0, weapon: { label: 'Twin Guardian Lasers', damage: .18, cooldown: .3, projectiles: 2, effect: 'laser' }, capacity: 5 },
  aegisShieldMonitor: { label: 'Shield Monitor', description: 'A close escort with oversized shield banks and three sustained laser emitters.', cost: cost(210, 160, 95), time: 42, factory: 'space', hp: 420, shields: 380, range: 300, moveSpeed: 0, weapon: { label: 'Triune Beam Array', damage: .55, cooldown: .45, projectiles: 3, effect: 'laser' } },
  aegisLanceFrigate: { label: 'Lance Frigate', description: 'A precise long-range frigate built around one slow axial rail strike.', cost: cost(230, 180, 110), time: 48, factory: 'space', hp: 350, shields: 260, range: 500, moveSpeed: 0, weapon: { label: 'Spearpoint Rail Lance', damage: 22, cooldown: 3, projectiles: 1, effect: 'railgun' } },
  aegisWardCruiser: { label: 'Ward Cruiser', description: 'A shielded line cruiser that delivers disciplined plasma broadsides.', cost: cost(480, 360, 230), time: 76, factory: 'space', hp: 850, shields: 700, range: 380, moveSpeed: 0, weapon: { label: 'Quad Ward Batteries', damage: 4, cooldown: 1.1, projectiles: 4, effect: 'plasma' }, requires: 'orbitalEngineering' },
  aegisCitadelCarrier: { label: 'Citadel Carrier', description: 'A ten-squad mobile fortress whose drone wings defend an invasion fleet.', cost: cost(780, 620, 400), time: 110, factory: 'space', hp: 1250, shields: 1050, range: 360, moveSpeed: 0, weapon: { label: 'Citadel Drone Screen', damage: 2, cooldown: .9, projectiles: 6, effect: 'drone' }, requires: 'carrierOperations', advancedFactory: true, capacity: 10 },
  aegisSovereignDreadnought: { label: 'Sovereign Dreadnought', description: 'The Directorate’s ultimate fortress ship, armed with four siege-beam cores.', cost: cost(1400, 1100, 800), time: 180, factory: 'space', hp: 2600, shields: 2100, range: 500, moveSpeed: 0, weapon: { label: 'Sovereign Siege Matrix', damage: 15, cooldown: 1.2, projectiles: 4, effect: 'siege' }, requires: 'titanEngineering', advancedFactory: true },
};
