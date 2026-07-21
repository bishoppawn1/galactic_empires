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
  infantry: { label: 'Infantry', description: 'Flexible line squad.', cost: pool(30, 8, 4), time: 10, factory: 'ground', hp: 100, shields: 20, damage: 13, range: 14, moveSpeed: 7 },
  antiVehicle: { label: 'Anti-Vehicle Infantry', description: 'Hard counter to armor.', cost: pool(42, 14, 8), time: 14, factory: 'ground', hp: 90, shields: 20, damage: 17, range: 18, moveSpeed: 5.5 },
  recon: { label: 'Light Recon Vehicle', description: 'Fast scouting armor.', cost: pool(55, 18, 9), time: 16, factory: 'ground', hp: 130, shields: 15, damage: 16, range: 11, moveSpeed: 11 },
  lightTank: { label: 'Light Tank', description: 'Durable armored unit.', cost: pool(82, 30, 15), time: 22, factory: 'ground', hp: 220, shields: 30, damage: 24, range: 16, moveSpeed: 5 },
  artillery: { label: 'Light Artillery', description: 'High damage fire support.', cost: pool(75, 36, 18), time: 24, factory: 'ground', hp: 115, shields: 10, damage: 29, range: 30, moveSpeed: 3.5 },
  transport: { label: 'Transport', description: 'Carries up to four ground squads.', cost: pool(70, 48, 20), time: 18, factory: 'space', hp: 180, shields: 90, damage: 3, range: 160, moveSpeed: 0, capacity: 4 },
  escortFrigate: { label: 'Escort Frigate', description: 'Reliable close escort.', cost: pool(120, 70, 35), time: 26, factory: 'space', hp: 260, shields: 130, damage: 21, range: 280, moveSpeed: 0 },
  missileFrigate: { label: 'Missile Frigate', description: 'Long-range strike frigate.', cost: pool(135, 82, 42), time: 30, factory: 'space', hp: 230, shields: 115, damage: 27, range: 440, moveSpeed: 0 },
  shockTrooper: { label: 'Shock Troopers', description: 'Shielded assault infantry for breaking defensive lines.', cost: pool(88, 55, 30), time: 28, factory: 'ground', hp: 180, shields: 85, damage: 31, range: 17, moveSpeed: 7.5, requires: 'groundWarfare', advancedFactory: true },
  railgunTank: { label: 'Railgun Tank', description: 'Fast heavy armor with a long-range kinetic cannon.', cost: pool(175, 110, 58), time: 42, factory: 'ground', hp: 430, shields: 75, damage: 53, range: 25, moveSpeed: 5.2, requires: 'heavyArmor', advancedFactory: true },
  lightCruiser: { label: 'Light Cruiser', description: 'Powerful researched warship.', cost: pool(250, 170, 105), time: 46, factory: 'space', hp: 480, shields: 240, damage: 42, range: 340, moveSpeed: 0, requires: 'orbitalEngineering' },
  destroyer: { label: 'Phase Destroyer', description: 'A hardened line warship built to screen capital fleets.', cost: pool(330, 220, 135), time: 54, factory: 'space', hp: 720, shields: 360, damage: 58, range: 360, moveSpeed: 0, requires: 'orbitalEngineering', advancedFactory: true },
  plasmaTank: { label: 'Plasma Tank', description: 'Heavy shielded breakthrough armor.', cost: pool(155, 92, 48), time: 38, factory: 'ground', hp: 390, shields: 90, damage: 44, range: 19, moveSpeed: 4.2, requires: 'heavyArmor', advancedFactory: true },
  siegeWalker: { label: 'Siege Walker', description: 'Long-range armored siege platform.', cost: pool(210, 135, 72), time: 52, factory: 'ground', hp: 520, shields: 120, damage: 62, range: 36, moveSpeed: 2.6, requires: 'heavyArmor', advancedFactory: true },
  defenseTurret: { label: 'Defense Turret', description: 'A fortified planetary gun emplacement.', cost: pool(), factory: 'ground', hp: 320, shields: 70, damage: 34, range: 32, moveSpeed: 0 },
  assaultCarrier: { label: 'Assault Carrier', description: 'Armed carrier for eight ground squads.', cost: pool(360, 250, 145), time: 58, factory: 'space', hp: 650, shields: 330, damage: 36, range: 320, moveSpeed: 0, requires: 'carrierOperations', advancedFactory: true, capacity: 8 },
  battlecruiser: { label: 'Battlecruiser', description: 'Capital hull built to break fortified orbit.', cost: pool(520, 360, 240), time: 78, factory: 'space', hp: 980, shields: 520, damage: 88, range: 400, moveSpeed: 0, requires: 'capitalShips', advancedFactory: true },
  dreadnought: { label: 'Titan Dreadnought', description: 'The empire’s ultimate fortress-breaking capital ship.', cost: pool(900, 680, 460), time: 120, factory: 'space', hp: 1900, shields: 1050, damage: 165, range: 460, moveSpeed: 0, requires: 'titanEngineering', advancedFactory: true },
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
export const SPACE_COMBAT_DAMAGE_MULTIPLIER = 4;
export const RESOURCE_COLLECTION_MULTIPLIER = 4;
export const GRAVITY_WELL_RADIUS = 600;
export const ORBIT_MANEUVER_SPEED = 18;
export const LANDING_APPROACH_SPEED = 14;
export const SYSTEM_EXIT_SPEED = 18;
export const PHASE_GATE_CHARGE_SECONDS = 2;

export const GROUND_KINDS: GroundUnitKind[] = ['infantry', 'antiVehicle', 'recon', 'lightTank', 'artillery', 'shockTrooper', 'railgunTank', 'plasmaTank', 'siegeWalker'];
export const SPACE_KINDS: SpaceUnitKind[] = ['transport', 'escortFrigate', 'missileFrigate', 'lightCruiser', 'destroyer', 'assaultCarrier', 'battlecruiser', 'dreadnought'];
export const BUILDING_KINDS = Object.keys(BUILDINGS) as BuildingKind[];
