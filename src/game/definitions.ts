import type { BuildingKind, Definition, GroundUnitKind, ResearchId, ResourcePool, SpaceUnitKind, UnitDefinition, UnitKind } from './types';

export const pool = (metal = 0, crystal = 0, gold = 0): ResourcePool => ({ metal, crystal, gold });

export const BUILDINGS: Record<BuildingKind, Definition> = {
  metalMine: { label: 'Metal Mine', description: 'Produces a permanent stream of metal.', cost: pool(0, 80, 45) },
  crystalMine: { label: 'Crystal Extractor', description: 'Produces a permanent stream of crystal.', cost: pool(75, 0, 50) },
  goldMine: { label: 'Gold Mine', description: 'Produces a permanent stream of gold.', cost: pool(85, 65, 0) },
  groundFactory: { label: 'Ground Factory', description: 'Produces basic planetary forces.', cost: pool(140, 80, 40) },
  advancedGroundFactory: { label: 'Advanced Ground Factory', description: 'Foundation for heavy armies.', cost: pool(280, 180, 120), requires: 'advancedIndustry' },
  spaceFactory: { label: 'Space Yard', description: 'Builds transports and light warships.', cost: pool(160, 110, 65) },
  advancedSpaceFactory: { label: 'Advanced Space Yard', description: 'Builds late-game vessels.', cost: pool(340, 240, 170), requires: 'advancedIndustry' },
  groundDefense: { label: 'Ground Defenses', description: 'Deploys a stationary long-range turret during every invasion.', cost: pool(100, 45, 25) },
  antiSpaceDefense: { label: 'Anti-Space Battery', description: 'Damages hostile ships in orbit.', cost: pool(130, 75, 55) },
  spaceDefense: { label: 'Orbital Defenses', description: 'Protects the planet’s orbital space.', cost: pool(180, 100, 75) },
  researchLab: { label: 'Research Lab', description: 'Unlocks strategic research.', cost: pool(190, 160, 130) },
};

export const UNITS: Record<UnitKind, UnitDefinition> = {
  infantry: { label: 'Infantry', description: 'Flexible line squad with rapid pulse-rifle bursts.', cost: pool(30, 8, 4), time: 10, factory: 'ground', hp: 100, shields: 20, range: 14, moveSpeed: 7, weapon: { label: 'Tri-Burst Pulse Rifle', damage: 1, cooldown: .95, projectiles: 3, effect: 'pulse' } },
  antiVehicle: { label: 'Anti-Vehicle Infantry', description: 'Hard counter to armor with a slow guided rocket.', cost: pool(42, 14, 8), time: 14, factory: 'ground', hp: 90, shields: 20, range: 18, moveSpeed: 5.5, weapon: { label: 'Hunter-Killer Rocket', damage: 9, cooldown: 2.2, projectiles: 1, effect: 'missile' } },
  recon: { label: 'Light Recon Vehicle', description: 'Fast scouting armor with twin autocannons.', cost: pool(55, 18, 9), time: 16, factory: 'ground', hp: 130, shields: 15, range: 11, moveSpeed: 11, weapon: { label: 'Twin Autocannon', damage: 1, cooldown: .5, projectiles: 2, effect: 'kinetic' } },
  lightTank: { label: 'Light Tank', description: 'Durable armor carrying a medium accelerator cannon.', cost: pool(82, 30, 15), time: 22, factory: 'ground', hp: 220, shields: 30, range: 16, moveSpeed: 5, weapon: { label: 'Accelerator Cannon', damage: 7, cooldown: 1.2, projectiles: 1, effect: 'kinetic' } },
  artillery: { label: 'Light Artillery', description: 'Long-range fire support delivering heavy mortar salvos.', cost: pool(75, 36, 18), time: 24, factory: 'ground', hp: 115, shields: 10, range: 30, moveSpeed: 3.5, weapon: { label: 'Arc Mortar', damage: 18, cooldown: 2.6, projectiles: 1, effect: 'artillery' } },
  transport: { label: 'Transport', description: 'Carries four squads and mounts a light point-defense laser.', cost: pool(70, 48, 20), time: 18, factory: 'space', hp: 180, shields: 90, range: 160, moveSpeed: 0, weapon: { label: 'Point-Defense Laser', damage: .14, cooldown: .25, projectiles: 1, effect: 'laser' }, capacity: 4 },
  escortFrigate: { label: 'Escort Frigate', description: 'Close escort with three low-damage continuous laser emitters.', cost: pool(120, 70, 35), time: 26, factory: 'space', hp: 260, shields: 130, range: 280, moveSpeed: 0, weapon: { label: 'Triple Laser Array', damage: .5, cooldown: .4, projectiles: 3, effect: 'laser' } },
  missileFrigate: { label: 'Missile Frigate', description: 'Long-range frigate with one slow, devastating missile launcher.', cost: pool(135, 82, 42), time: 30, factory: 'space', hp: 230, shields: 115, range: 440, moveSpeed: 0, weapon: { label: 'Heavy Siege Missile', damage: 17, cooldown: 3.5, projectiles: 1, effect: 'missile' } },
  shockTrooper: { label: 'Shock Troopers', description: 'Shielded assault infantry firing paired arc carbines.', cost: pool(88, 55, 30), time: 28, factory: 'ground', hp: 180, shields: 85, range: 17, moveSpeed: 7.5, weapon: { label: 'Dual Arc Carbines', damage: 3, cooldown: .8, projectiles: 2, effect: 'pulse' }, requires: 'groundWarfare', advancedFactory: true },
  railgunTank: { label: 'Railgun Tank', description: 'Fast heavy armor with a deliberate hypervelocity rail shot.', cost: pool(175, 110, 58), time: 42, factory: 'ground', hp: 430, shields: 75, range: 25, moveSpeed: 5.2, weapon: { label: 'Hypervelocity Railgun', damage: 24, cooldown: 1.9, projectiles: 1, effect: 'railgun' }, requires: 'heavyArmor', advancedFactory: true },
  lightCruiser: { label: 'Light Cruiser', description: 'Powerful warship firing four synchronized pulse cannons.', cost: pool(250, 170, 105), time: 46, factory: 'space', hp: 480, shields: 240, range: 340, moveSpeed: 0, weapon: { label: 'Quad Pulse Cannons', damage: 1.9, cooldown: 1, projectiles: 4, effect: 'pulse' }, requires: 'orbitalEngineering' },
  destroyer: { label: 'Phase Destroyer', description: 'Hardened line warship with a triple kinetic broadside.', cost: pool(330, 220, 135), time: 54, factory: 'space', hp: 720, shields: 360, range: 360, moveSpeed: 0, weapon: { label: 'Phase-Ion Broadside', damage: 3.5, cooldown: 1, projectiles: 3, effect: 'kinetic' }, requires: 'orbitalEngineering', advancedFactory: true },
  plasmaTank: { label: 'Plasma Tank', description: 'Heavy shielded armor built around a plasma lance.', cost: pool(155, 92, 48), time: 38, factory: 'ground', hp: 390, shields: 90, range: 19, moveSpeed: 4.2, weapon: { label: 'Plasma Lance', damage: 13, cooldown: 1.25, projectiles: 1, effect: 'plasma' }, requires: 'heavyArmor', advancedFactory: true },
  siegeWalker: { label: 'Siege Walker', description: 'Long-range armored platform with a fortress-breaking cannon.', cost: pool(210, 135, 72), time: 52, factory: 'ground', hp: 520, shields: 120, range: 36, moveSpeed: 2.6, weapon: { label: 'Quake Siege Cannon', damage: 31, cooldown: 2.1, projectiles: 1, effect: 'siege' }, requires: 'heavyArmor', advancedFactory: true },
  defenseTurret: { label: 'Defense Turret', description: 'Fortified emplacement with a dual repeater cannon.', cost: pool(), factory: 'ground', hp: 320, shields: 70, range: 32, moveSpeed: 0, weapon: { label: 'Dual Repeater Cannon', damage: 4, cooldown: 1, projectiles: 2, effect: 'kinetic' } },
  assaultCarrier: { label: 'Assault Carrier', description: 'Eight-squad carrier whose attack drones harry nearby ships.', cost: pool(360, 250, 145), time: 58, factory: 'space', hp: 650, shields: 330, range: 320, moveSpeed: 0, weapon: { label: 'Strike-Drone Wing', damage: 1.5, cooldown: .92, projectiles: 4, effect: 'drone' }, requires: 'carrierOperations', advancedFactory: true, capacity: 8 },
  battlecruiser: { label: 'Battlecruiser', description: 'Capital hull armed with two heavy rail batteries.', cost: pool(520, 360, 240), time: 78, factory: 'space', hp: 980, shields: 520, range: 400, moveSpeed: 0, weapon: { label: 'Twin Capital Railguns', damage: 8, cooldown: 1, projectiles: 2, effect: 'railgun' }, requires: 'capitalShips', advancedFactory: true },
  dreadnought: { label: 'Titan Dreadnought', description: 'Ultimate capital ship firing three colossal siege beams.', cost: pool(900, 680, 460), time: 120, factory: 'space', hp: 1900, shields: 1050, range: 460, moveSpeed: 0, weapon: { label: 'Tri-Core Siege Beams', damage: 10, cooldown: 1, projectiles: 3, effect: 'siege' }, requires: 'titanEngineering', advancedFactory: true },
};

export const RESEARCH: Record<ResearchId, Definition> = {
  advancedIndustry: { label: 'Advanced Industry', description: 'Unlock advanced factories.', cost: pool(220, 180, 140), time: 45 },
  groundWarfare: { label: 'Ground Warfare', description: 'Develop shielded assault formations and advanced battlefield doctrine.', cost: pool(280, 210, 150), time: 55, requires: 'advancedIndustry' },
  fleetLogistics: { label: 'Fleet Logistics', description: 'Prepares the empire for larger fleet operations.', cost: pool(320, 250, 210), time: 60, requires: 'advancedIndustry' },
  orbitalEngineering: { label: 'Orbital Engineering', description: 'Develop reinforced cruiser hulls and deep-space weapon systems.', cost: pool(300, 275, 190), time: 62, requires: 'advancedIndustry' },
  quantumExtraction: { label: 'Quantum Extraction', description: 'Increase all imperial mine output by 25 percent.', cost: pool(260, 300, 220), time: 58, requires: 'advancedIndustry' },
  heavyArmor: { label: 'Heavy Armor', description: 'Unlock railgun tanks, plasma armor, and siege walkers.', cost: pool(430, 330, 235), time: 78, requires: 'groundWarfare' },
  carrierOperations: { label: 'Carrier Operations', description: 'Unlock Assault Carriers and eight-squad planetary assaults.', cost: pool(460, 370, 280), time: 82, requires: 'fleetLogistics' },
  capitalShips: { label: 'Capital Ship Doctrine', description: 'Unlock Battlecruisers and capital-fleet command systems.', cost: pool(520, 420, 320), time: 90, requires: 'orbitalEngineering' },
  titanEngineering: { label: 'Titan Engineering', description: 'Unlock the colossal Titan Dreadnought.', cost: pool(850, 700, 540), time: 125, requires: 'capitalShips' },
};

export const RESEARCH_UNLOCKS: Partial<Record<ResearchId, string[]>> = {
  advancedIndustry: ['Advanced Ground Factory', 'Advanced Space Yard'],
  groundWarfare: ['Shock Troopers'],
  fleetLogistics: ['Carrier doctrine'],
  orbitalEngineering: ['Light Cruiser', 'Phase Destroyer'],
  quantumExtraction: ['+25% mine output'],
  heavyArmor: ['Railgun Tank', 'Plasma Tank', 'Siege Walker'],
  carrierOperations: ['Assault Carrier'],
  capitalShips: ['Battlecruiser'],
  titanEngineering: ['Titan Dreadnought'],
};

export const ORBITAL_DEFENSE_STATS = { hp: 420, shields: 220, damage: 32 } as const;
export const ORBITAL_DEFENSE_RANGE = 400;
export const ANTI_SPACE_BATTERY_RANGE = 300;
export const ORBITAL_DEFENSE_RADIUS = 285;
export const orbitalDefenseOffset = (index: number, count: number) => {
  const angle = -Math.PI / 4 + index * (Math.PI * 2 / Math.max(2, count));
  return { x: Math.cos(angle) * ORBITAL_DEFENSE_RADIUS, y: Math.sin(angle) * ORBITAL_DEFENSE_RADIUS };
};
export const ORBITAL_DEFENSE_HULL_REGEN = 2;
export const ORBITAL_DEFENSE_SHIELD_REGEN = 16;
export const SPACE_COMBAT_DAMAGE_MULTIPLIER = 4;
export const RESOURCE_COLLECTION_MULTIPLIER = 4;
export const GRAVITY_WELL_RADIUS = 600;
export const MAX_SHIP_ORBIT_RADIUS = GRAVITY_WELL_RADIUS - 72;
export const ORBIT_MANEUVER_SPEED = 18;
export const LANDING_APPROACH_SPEED = 14;
export const SYSTEM_EXIT_SPEED = 18;
export const PHASE_GATE_CHARGE_SECONDS = 2;

export const GROUND_KINDS: GroundUnitKind[] = ['infantry', 'antiVehicle', 'recon', 'lightTank', 'artillery', 'shockTrooper', 'railgunTank', 'plasmaTank', 'siegeWalker'];
export const SPACE_KINDS: SpaceUnitKind[] = ['transport', 'escortFrigate', 'missileFrigate', 'lightCruiser', 'destroyer', 'assaultCarrier', 'battlecruiser', 'dreadnought'];
export const BUILDING_KINDS = Object.keys(BUILDINGS) as BuildingKind[];
