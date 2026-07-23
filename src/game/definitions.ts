import type { Building, BuildingKind, DefenseBuildingKind, Definition, GroundUnitKind, PlayableFaction, ResearchId, ResourcePool, SpaceUnitKind, UnitDefinition, UnitKind } from './types';
import { AEGIS_GROUND_KINDS, AEGIS_SPACE_KINDS, AEGIS_UNITS } from './units/aegis';
import { COVENANT_GROUND_KINDS, COVENANT_SPACE_KINDS, COVENANT_UNITS } from './units/covenant';

export { AEGIS_GROUND_KINDS, AEGIS_SPACE_KINDS } from './units/aegis';
export { COVENANT_GROUND_KINDS, COVENANT_SPACE_KINDS } from './units/covenant';

export const pool = (metal = 0, crystal = 0, gold = 0): ResourcePool => ({ metal, crystal, gold });

export const STANDARD_RESOURCES = ['metal', 'crystal', 'gold'] as const;
export const RESOURCE_TRADE_RATE = 3;
export const RESOURCE_TRADE_DEFAULT_SPEND = 150;
export const RESOURCE_TRADE_MAX_SPEND = 1_000_000_000;
export const GALAXY_CANVAS_WIDTH = 12800;
export const GALAXY_CANVAS_HEIGHT = 8800;

export const BUILDINGS: Record<BuildingKind, Definition> = {
  metalMine: { label: 'Metal Mine', description: 'Produces a permanent stream of metal.', cost: pool(0, 80, 45) },
  crystalMine: { label: 'Crystal Extractor', description: 'Produces a permanent stream of crystal.', cost: pool(75, 0, 50) },
  goldMine: { label: 'Gold Mine', description: 'Produces a permanent stream of gold.', cost: pool(85, 65, 0) },
  groundFactory: { label: 'Ground Factory', description: 'Produces basic planetary forces.', cost: pool(140, 80, 40) },
  advancedGroundFactory: { label: 'Advanced Ground Factory', description: 'Produces heavy armies with 2.5× factory capacity.', cost: pool(280, 180, 120), requires: 'advancedIndustry' },
  spaceFactory: { label: 'Space Yard', description: 'Builds transports and light warships.', cost: pool(160, 110, 65) },
  advancedSpaceFactory: { label: 'Advanced Space Yard', description: 'Builds late-game vessels.', cost: pool(340, 240, 170), requires: 'advancedIndustry' },
  groundDefense: { label: 'Ground Defenses', description: 'Deploys a stationary long-range turret during every invasion.', cost: pool(100, 45, 25), time: 8 },
  antiSpaceDefense: { label: 'Anti-Space Battery', description: 'Damages hostile ships in orbit.', cost: pool(130, 75, 55), time: 10 },
  spaceDefense: { label: 'Orbital Defenses', description: 'Protects the planet’s orbital space.', cost: pool(180, 100, 75), time: 12 },
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
  assaultCarrier: { label: 'Assault Carrier', description: 'Eight-squad carrier launching replaceable strike fighters that circle hostile hulls.', cost: pool(360, 250, 145), time: 58, factory: 'space', hp: 650, shields: 330, range: 320, moveSpeed: 0, weapon: { label: 'Falcon Strike Wing', damage: 1.5, cooldown: .92, projectiles: 4, effect: 'drone' }, requires: 'carrierOperations', advancedFactory: true, capacity: 8, fighterWing: { label: 'Falcon Fighters', capacity: 4, rebuildTime: 18, attritionTime: 15 } },
  battlecruiser: { label: 'Battlecruiser', description: 'Capital hull armed with two heavy rail batteries.', cost: pool(520, 360, 240), time: 78, factory: 'space', hp: 980, shields: 520, range: 400, moveSpeed: 0, weapon: { label: 'Twin Capital Railguns', damage: 8, cooldown: 1, projectiles: 2, effect: 'railgun' }, requires: 'capitalShips', advancedFactory: true },
  commandFlagship: { label: 'Vanguard Flagship', description: 'A Coalition command ship whose overlapping flak grid shreds deployed fighter wings.', cost: pool(680, 520, 330), time: 105, factory: 'space', hp: 1320, shields: 720, range: 430, moveSpeed: 0, weapon: { label: 'Aegis Flak Grid', damage: 1, cooldown: .85, projectiles: 8, effect: 'laser' }, requires: 'weaponsCalibration', advancedFactory: true, ability: { kind: 'antiFighterBarrage', label: 'Fleet Flak Screen', description: 'Prioritizes every hostile fighter wing in range and deals triple damage to fighters.' } },
  dreadnought: { label: 'Titan Dreadnought', description: 'Ultimate capital ship firing three colossal siege beams.', cost: pool(900, 680, 460), time: 120, factory: 'space', hp: 1900, shields: 1050, range: 460, moveSpeed: 0, weapon: { label: 'Tri-Core Siege Beams', damage: 10, cooldown: 1, projectiles: 3, effect: 'siege' }, requires: 'titanEngineering', advancedFactory: true },
  broodling: { label: 'Broodling Pack', description: 'A cheap, fast clutch that becomes deadlier when several packs attack together.', cost: pool(20, 5, 2), time: 7, factory: 'ground', hp: 68, shields: 0, range: 7, moveSpeed: 11, weapon: { label: 'Rending Claws', damage: 1, cooldown: .55, projectiles: 2, effect: 'kinetic' }, ability: { kind: 'swarmInstinct', label: 'Swarm Instinct', description: '+20% damage for each nearby Broodling Pack, up to +60%.' } },
  acidSpitter: { label: 'Acid Spitter', description: 'A fragile hunter whose bile strips protection from priority targets.', cost: pool(39, 12, 5), time: 12, factory: 'ground', hp: 82, shields: 0, range: 21, moveSpeed: 6, weapon: { label: 'Caustic Glob', damage: 8, cooldown: 1.8, projectiles: 1, effect: 'plasma' }, ability: { kind: 'corrosiveBile', label: 'Corrosive Bile', description: 'Hits corrode targets for 5 seconds, increasing all damage they take by 35%.' } },
  skitterer: { label: 'Skitterer', description: 'A darting reconnaissance organism that is difficult to pin down.', cost: pool(45, 14, 5), time: 13, factory: 'ground', hp: 100, shields: 0, range: 10, moveSpeed: 14, weapon: { label: 'Spine Volley', damage: .8, cooldown: .35, projectiles: 3, effect: 'kinetic' }, ability: { kind: 'evasiveChitin', label: 'Evasive Chitin', description: 'Reduces incoming damage by 30%.' } },
  carapaceBeast: { label: 'Carapace Beast', description: 'Dense living armor that punishes anything striking its barbed hide.', cost: pool(74, 22, 10), time: 19, factory: 'ground', hp: 245, shields: 0, range: 12, moveSpeed: 5.8, weapon: { label: 'Bone Ram', damage: 9, cooldown: 1.1, projectiles: 1, effect: 'kinetic' }, ability: { kind: 'thornedCarapace', label: 'Thorned Carapace', description: 'Reflects 20% of direct ground damage back at attackers.' } },
  sporeLobber: { label: 'Spore Lobber', description: 'A bombardment organism whose sacs burst across clustered formations.', cost: pool(70, 30, 12), time: 21, factory: 'ground', hp: 95, shields: 0, range: 34, moveSpeed: 3, weapon: { label: 'Burst Spore', damage: 16, cooldown: 2.2, projectiles: 1, effect: 'artillery' }, ability: { kind: 'burstSpores', label: 'Burst Spores', description: 'Deals 35% splash damage to enemies near the primary target.' } },
  synapseGuard: { label: 'Synapse Guard', description: 'A psychic assault caste that drives nearby swarms into a killing focus.', cost: pool(78, 46, 24), time: 25, factory: 'ground', hp: 190, shields: 20, range: 16, moveSpeed: 8.5, weapon: { label: 'Synaptic Lance', damage: 2.4, cooldown: .65, projectiles: 3, effect: 'pulse' }, requires: 'groundWarfare', advancedFactory: true, ability: { kind: 'synapseAura', label: 'Synapse Aura', description: 'Nearby allied ground organisms deal 25% more damage.' } },
  crusherBeast: { label: 'Crusher Beast', description: 'A massive shock organism bred to tear fortified positions apart.', cost: pool(160, 92, 42), time: 38, factory: 'ground', hp: 500, shields: 0, range: 10, moveSpeed: 6.5, weapon: { label: 'Siege Horn', damage: 30, cooldown: 1.6, projectiles: 1, effect: 'kinetic' }, requires: 'heavyArmor', advancedFactory: true, ability: { kind: 'siegeCharge', label: 'Siege Charge', description: 'Deals double damage to Ground Defense emplacements.' } },
  acidBehemoth: { label: 'Acid Behemoth', description: 'A towering reservoir beast that leaves whole formations vulnerable.', cost: pool(148, 84, 40), time: 36, factory: 'ground', hp: 410, shields: 0, range: 23, moveSpeed: 4, weapon: { label: 'Bile Lance', damage: 15, cooldown: 1.15, projectiles: 1, effect: 'plasma' }, requires: 'heavyArmor', advancedFactory: true, ability: { kind: 'corrosiveBile', label: 'Corrosive Torrent', description: 'Hits corrode targets for 5 seconds, increasing all damage they take by 35%.' } },
  siegeCrawler: { label: 'Siege Crawler', description: 'A living fortress whose quake cysts engulf clustered defenders.', cost: pool(200, 124, 64), time: 48, factory: 'ground', hp: 590, shields: 0, range: 40, moveSpeed: 2.4, weapon: { label: 'Quake Cyst', damage: 29, cooldown: 2, projectiles: 1, effect: 'siege' }, requires: 'heavyArmor', advancedFactory: true, ability: { kind: 'burstSpores', label: 'Quake Bloom', description: 'Deals 35% splash damage to enemies near the primary target.' } },
  spineTower: { label: 'Spine Tower', description: 'A rooted defensive organism whose venomous barbs expose invading formations.', cost: pool(), factory: 'ground', hp: 380, shields: 20, range: 35, moveSpeed: 0, weapon: { label: 'Impaler Spines', damage: 5, cooldown: .9, projectiles: 3, effect: 'kinetic' }, ability: { kind: 'corrosiveBile', label: 'Impaling Venom', description: 'Hits corrode targets for 5 seconds, increasing all damage they take by 35%.' } },
  sporeArk: { label: 'Spore Ark', description: 'A living landing vessel that regenerates even while crossing hostile space.', cost: pool(68, 42, 16), time: 16, factory: 'space', hp: 240, shields: 45, range: 140, moveSpeed: 0, weapon: { label: 'Defensive Spores', damage: .18, cooldown: .3, projectiles: 2, effect: 'drone' }, capacity: 5, ability: { kind: 'livingHold', label: 'Living Hold', description: 'Regenerates 4 hull per second in any orbit or phase lane.' } },
  clawFrigate: { label: 'Claw Frigate', description: 'An aggressive hunter organism that specializes in gutting troop carriers.', cost: pool(112, 62, 28), time: 23, factory: 'space', hp: 300, shields: 70, range: 220, moveSpeed: 0, weapon: { label: 'Ripper Talons', damage: .7, cooldown: .32, projectiles: 3, effect: 'kinetic' }, ability: { kind: 'transportHunter', label: 'Transport Hunter', description: 'Deals 50% more damage to ships carrying ground units.' } },
  needleFrigate: { label: 'Needle Frigate', description: 'A brittle sniper whose void spines punch through shields into living hull.', cost: pool(128, 76, 34), time: 27, factory: 'space', hp: 200, shields: 80, range: 470, moveSpeed: 0, weapon: { label: 'Void Needle', damage: 15, cooldown: 2.8, projectiles: 1, effect: 'missile' }, ability: { kind: 'shieldPiercing', label: 'Void Piercing', description: 'Half of each attack bypasses shields and strikes hull directly.' } },
  hiveCruiser: { label: 'Hive Cruiser', description: 'A synaptic war organism coordinating every nearby living ship.', cost: pool(235, 152, 88), time: 42, factory: 'space', hp: 560, shields: 170, range: 320, moveSpeed: 0, weapon: { label: 'Bioplasma Nodes', damage: 1.8, cooldown: .85, projectiles: 5, effect: 'plasma' }, requires: 'orbitalEngineering', ability: { kind: 'orbitalSynapse', label: 'Orbital Synapse', description: 'Nearby allied ships deal 25% more damage.' } },
  voidStalker: { label: 'Void Stalker', description: 'A phase-shifting ambush organism that turns aside incoming fire.', cost: pool(310, 198, 112), time: 50, factory: 'space', hp: 650, shields: 280, range: 380, moveSpeed: 0, weapon: { label: 'Phase Spines', damage: 4.3, cooldown: .9, projectiles: 3, effect: 'kinetic' }, requires: 'orbitalEngineering', advancedFactory: true, ability: { kind: 'phaseCarapace', label: 'Phase Carapace', description: 'Reduces incoming damage by 35%.' } },
  broodCarrier: { label: 'Brood Carrier', description: 'A mobile hive that regrows attack spawn and splits them across hostile ships.', cost: pool(350, 232, 130), time: 54, factory: 'space', hp: 720, shields: 220, range: 300, moveSpeed: 0, weapon: { label: 'Ripper Spawn Wing', damage: 1.4, cooldown: .7, projectiles: 6, effect: 'drone' }, requires: 'carrierOperations', advancedFactory: true, capacity: 10, fighterWing: { label: 'Ripper Spawn', capacity: 6, rebuildTime: 12, attritionTime: 10 }, ability: { kind: 'spawnCloud', label: 'Spawn Cloud', description: 'Every fighter attack also pressures a second nearby hostile ship for 50% damage.' } },
  leviathan: { label: 'Leviathan', description: 'A capital predator that consumes matter to mend its wounded body.', cost: pool(500, 330, 210), time: 72, factory: 'space', hp: 1150, shields: 360, range: 390, moveSpeed: 0, weapon: { label: 'Twin Nova Glands', damage: 9.5, cooldown: 1.1, projectiles: 2, effect: 'plasma' }, requires: 'capitalShips', advancedFactory: true, ability: { kind: 'devour', label: 'Devour', description: 'Restores hull equal to 20% of the damage it deals.' } },
  broodRazorQueen: { label: 'Razor Queen Flagship', description: 'A brood-command organism surrounded by a living halo bred to hunt strike craft.', cost: pool(650, 490, 310), time: 100, factory: 'space', hp: 1480, shields: 190, range: 410, moveSpeed: 0, weapon: { label: 'Hunter-Spore Halo', damage: 1.2, cooldown: .9, projectiles: 8, effect: 'drone' }, requires: 'weaponsCalibration', advancedFactory: true, ability: { kind: 'antiFighterBarrage', label: 'Predator Halo', description: 'Prioritizes every hostile fighter wing in range and deals triple damage to fighters.' } },
  worldEater: { label: 'World Eater', description: 'The apex organism, able to crack orbital fortresses in a few feeding passes.', cost: pool(860, 630, 410), time: 112, factory: 'space', hp: 2200, shields: 650, range: 480, moveSpeed: 0, weapon: { label: 'Devouring Beam', damage: 12, cooldown: 1.1, projectiles: 3, effect: 'siege' }, requires: 'titanEngineering', advancedFactory: true, ability: { kind: 'planetCracker', label: 'Planet Cracker', description: 'Deals double damage to orbital defense platforms.' } },
  ...AEGIS_UNITS,
  ...COVENANT_UNITS,
};

export const RESEARCH: Record<ResearchId, Definition> = {
  advancedIndustry: { label: 'Advanced Industry', description: 'Unlock advanced factories.', cost: pool(220, 180, 140), time: 45 },
  rapidFabrication: { label: 'Rapid Fabrication', description: 'Optimize assembly lines to produce ground and space units 25 percent faster.', cost: pool(330, 280, 210), time: 68, requires: 'advancedIndustry' },
  industrialIteration: { label: 'Industrial Iteration', description: 'Repeatably refine every production chain for another five percent unit production speed.', cost: pool(560, 440, 320), time: 110, requires: 'rapidFabrication' },
  groundWarfare: { label: 'Ground Warfare', description: 'Develop shielded assault formations and advanced battlefield doctrine.', cost: pool(280, 210, 150), time: 55, requires: 'advancedIndustry' },
  planetaryFortifications: { label: 'Planetary Fortifications', description: 'Reinforce ground and orbital defenses with layered armor and redundant systems.', cost: pool(390, 310, 230), time: 74, requires: 'groundWarfare' },
  fleetLogistics: { label: 'Fleet Logistics', description: 'Prepares the empire for larger fleet operations.', cost: pool(320, 250, 210), time: 60, requires: 'advancedIndustry' },
  phaseMastery: { label: 'Phase Mastery', description: 'Tune phase drives to cross every phase lane 25 percent faster.', cost: pool(410, 360, 280), time: 80, requires: 'fleetLogistics' },
  orbitalEngineering: { label: 'Orbital Engineering', description: 'Develop reinforced cruiser hulls and deep-space weapon systems.', cost: pool(300, 275, 190), time: 62, requires: 'advancedIndustry' },
  shieldHarmonics: { label: 'Shield Harmonics', description: 'Increase shield regeneration on every warship by 50 percent.', cost: pool(430, 390, 300), time: 84, requires: 'orbitalEngineering' },
  quantumExtraction: { label: 'Quantum Extraction', description: 'Increase all imperial resource output by 25 percent.', cost: pool(260, 300, 220), time: 58, requires: 'advancedIndustry' },
  deepCoreExtraction: { label: 'Deep-Core Extraction', description: 'Increase the total imperial resource output bonus to 50 percent.', cost: pool(480, 440, 350), time: 92, requires: 'quantumExtraction' },
  resourceSynthesis: { label: 'Resource Synthesis', description: 'Repeatably improve imperial resource output by another five percent.', cost: pool(620, 560, 430), time: 120, requires: 'deepCoreExtraction' },
  heavyArmor: { label: 'Heavy Armor', description: 'Unlock the heaviest ground assault and siege organisms or vehicles.', cost: pool(430, 330, 235), time: 78, requires: 'groundWarfare' },
  carrierOperations: { label: 'Carrier Operations', description: 'Unlock specialized carriers for large planetary assaults.', cost: pool(460, 370, 280), time: 82, requires: 'fleetLogistics' },
  capitalShips: { label: 'Capital Ship Doctrine', description: 'Unlock capital warships and their fleet-command systems.', cost: pool(520, 420, 320), time: 90, requires: 'orbitalEngineering' },
  weaponsCalibration: { label: 'Weapons Calibration', description: 'Increase damage from all ships and orbital installations by 15 percent.', cost: pool(650, 520, 400), time: 105, requires: 'capitalShips' },
  titanEngineering: { label: 'Titan Engineering', description: 'Unlock each civilization’s colossal apex warship.', cost: pool(850, 700, 540), time: 125, requires: 'capitalShips' },
  combatSimulation: { label: 'Combat Simulation', description: 'Repeatably improve ship and orbital weapon damage by another three percent.', cost: pool(760, 640, 500), time: 135, requires: 'weaponsCalibration' },
};

export const REPEATABLE_RESEARCH: ResearchId[] = ['industrialIteration', 'resourceSynthesis', 'combatSimulation'];
export const isRepeatableResearch = (id: ResearchId) => REPEATABLE_RESEARCH.includes(id);
export const researchLevel = (completed: ResearchId[], id: ResearchId) => completed.filter(completedId => completedId === id).length;
export const researchCost = (id: ResearchId, completed: ResearchId[]) => {
  const level = isRepeatableResearch(id) ? researchLevel(completed, id) : 0;
  const scale = 1 + level * .6;
  const cost = RESEARCH[id].cost;
  return pool(Math.ceil(cost.metal * scale), Math.ceil(cost.crystal * scale), Math.ceil(cost.gold * scale));
};
export const researchTime = (id: ResearchId, completed: ResearchId[]) => Math.ceil(RESEARCH[id].time! * (1 + (isRepeatableResearch(id) ? researchLevel(completed, id) * .4 : 0)));

export const RESEARCH_UNLOCKS: Partial<Record<ResearchId, string[]>> = {
  advancedIndustry: ['Advanced Ground Factory', 'Advanced Space Yard'],
  rapidFabrication: ['+25% unit production speed'],
  industrialIteration: ['Repeatable · +5% unit production speed per level'],
  groundWarfare: ['Shock Troopers'],
  planetaryFortifications: ['+25% defense durability'],
  fleetLogistics: ['Carrier doctrine'],
  phaseMastery: ['25% faster phase travel'],
  orbitalEngineering: ['Light Cruiser', 'Phase Destroyer'],
  shieldHarmonics: ['+50% ship shield regeneration'],
  quantumExtraction: ['+25% resource output'],
  deepCoreExtraction: ['Resource output bonus increased to +50%'],
  resourceSynthesis: ['Repeatable · +5% resource output per level'],
  heavyArmor: ['Railgun Tank', 'Plasma Tank', 'Siege Walker'],
  carrierOperations: ['Assault Carrier'],
  capitalShips: ['Battlecruiser'],
  weaponsCalibration: ['+15% ship and orbital weapon damage'],
  combatSimulation: ['Repeatable · +3% ship and orbital damage per level'],
  titanEngineering: ['Titan Dreadnought'],
};

const BROOD_RESEARCH_UNLOCKS: Partial<Record<ResearchId, string[]>> = {
  advancedIndustry: ['Advanced Ground Factory', 'Advanced Space Yard'],
  groundWarfare: ['Synapse Guard'],
  fleetLogistics: ['Brood Carrier doctrine'],
  orbitalEngineering: ['Hive Cruiser', 'Void Stalker'],
  quantumExtraction: ['+25% planetary biomass'],
  industrialIteration: ['Repeatable · +5% gestation speed per level'],
  resourceSynthesis: ['Repeatable · +5% planetary biomass per level'],
  heavyArmor: ['Crusher Beast', 'Acid Behemoth', 'Siege Crawler'],
  carrierOperations: ['Brood Carrier'],
  capitalShips: ['Leviathan'],
  combatSimulation: ['Repeatable · +3% biofleet damage per level'],
  titanEngineering: ['World Eater'],
};

const AEGIS_RESEARCH_UNLOCKS: Partial<Record<ResearchId, string[]>> = {
  advancedIndustry: ['Advanced Ground Factory', 'Advanced Space Yard'], groundWarfare: ['Paladin Guard'],
  fleetLogistics: ['Citadel carrier doctrine'], orbitalEngineering: ['Ward Cruiser'], quantumExtraction: ['+25% resource output'],
  heavyArmor: ['Fortress Walker'], carrierOperations: ['Citadel Carrier'], capitalShips: ['Sovereign command systems'], titanEngineering: ['Sovereign Dreadnought'],
  industrialIteration: ['Repeatable · +5% sentinel production per level'], resourceSynthesis: ['Repeatable · +5% resource output per level'], combatSimulation: ['Repeatable · +3% fleet damage per level'],
};

const COVENANT_RESEARCH_UNLOCKS: Partial<Record<ResearchId, string[]>> = {
  advancedIndustry: ['Advanced Ground Factory', 'Advanced Space Yard'], groundWarfare: ['Repair Drone'],
  fleetLogistics: ['Fabricator carrier doctrine'], orbitalEngineering: ['Foundry Cruiser'], quantumExtraction: ['+25% resource output'],
  heavyArmor: ['Juggernaut Engine'], carrierOperations: ['Fabricator Carrier'], capitalShips: ['Ironclad Battleship'], titanEngineering: ['Dreadforge Titan'],
  industrialIteration: ['Repeatable · +5% assembly speed per level'], resourceSynthesis: ['Repeatable · +5% matter reclamation per level'], combatSimulation: ['Repeatable · +3% fleet damage per level'],
};

const FACTION_RESEARCH_LABELS: Record<PlayableFaction, Record<ResearchId, string>> = {
  human: {
    advancedIndustry: 'Coalition Engineering', rapidFabrication: 'Modular Assembly', industrialIteration: 'Autonomous Fabrication',
    groundWarfare: 'Combined Arms Doctrine', planetaryFortifications: 'Fortress Worlds', heavyArmor: 'Siege Corps',
    fleetLogistics: 'Expeditionary Logistics', phaseMastery: 'Navigator Mastery', carrierOperations: 'Marine Carrier Groups',
    orbitalEngineering: 'Naval Architecture', shieldHarmonics: 'Harmonic Shielding', capitalShips: 'Capital Ship Doctrine',
    weaponsCalibration: 'Fire-Control Networks', titanEngineering: 'Titan Command',
    quantumExtraction: 'Quantum Extraction', deepCoreExtraction: 'Deep-Core Exploitation', resourceSynthesis: 'Colonial Optimization',
    combatSimulation: 'Fleet War Games',
  },
  brood: {
    advancedIndustry: 'Evolved Industry', rapidFabrication: 'Accelerated Gestation', industrialIteration: 'Endless Molting',
    groundWarfare: 'Synaptic Warfare', planetaryFortifications: 'Carapace Worlds', heavyArmor: 'Apex Morphology',
    fleetLogistics: 'Spore Migration', phaseMastery: 'Void Instinct', carrierOperations: 'Brood Nurseries',
    orbitalEngineering: 'Biofleet Evolution', shieldHarmonics: 'Regenerative Membranes', capitalShips: 'Leviathan Genesis',
    weaponsCalibration: 'Predatory Synapses', titanEngineering: 'World Eater Genesis',
    quantumExtraction: 'Biomass Assimilation', deepCoreExtraction: 'Planetary Digestion', resourceSynthesis: 'Biomass Recursion',
    combatSimulation: 'Predatory Adaptation',
  },
  aegis: {
    advancedIndustry: 'Harmonic Fabrication', rapidFabrication: 'Sentinel Assembly', industrialIteration: 'Recursive Wardcraft',
    groundWarfare: 'Guardian Doctrine', planetaryFortifications: 'Bastion Worlds', heavyArmor: 'Fortress Chassis',
    fleetLogistics: 'Citadel Logistics', phaseMastery: 'Farcast Navigation', carrierOperations: 'Citadel Operations',
    orbitalEngineering: 'Ward Architecture', shieldHarmonics: 'Resonant Shields', capitalShips: 'Sovereign Doctrine',
    weaponsCalibration: 'Lattice Targeting', titanEngineering: 'Sovereign Ascension',
    quantumExtraction: 'Luminous Extraction', deepCoreExtraction: 'Stellar Refinement', resourceSynthesis: 'Harmonic Abundance',
    combatSimulation: 'Eternal Vigil',
  },
  covenant: {
    advancedIndustry: 'Foundry Awakening', rapidFabrication: 'Accelerated Assembly', industrialIteration: 'Recursive Fabrication',
    groundWarfare: 'Cohort Battle Logic', planetaryFortifications: 'Iron Worlds', heavyArmor: 'Juggernaut Patterns',
    fleetLogistics: 'Machine Logistics', phaseMastery: 'Phase Calculation', carrierOperations: 'Fabricator Operations',
    orbitalEngineering: 'Foundry Hulls', shieldHarmonics: 'Redundant Plating', capitalShips: 'Ironclad Doctrine',
    weaponsCalibration: 'Dismantler Calibration', titanEngineering: 'Dreadforge Protocol',
    quantumExtraction: 'Matter Reclamation', deepCoreExtraction: 'Core Strip-Mining', resourceSynthesis: 'Closed-Loop Reclamation',
    combatSimulation: 'Combat Logic Refinement',
  },
};

export const researchDefinitionForCivilization = (id: ResearchId, civilization: PlayableFaction): Definition => ({
  ...RESEARCH[id],
  label: FACTION_RESEARCH_LABELS[civilization][id],
});

export const researchUnlocksForCivilization = (id: ResearchId, civilization: PlayableFaction) => {
  const factionUnlocks = civilization === 'brood' ? BROOD_RESEARCH_UNLOCKS : civilization === 'aegis' ? AEGIS_RESEARCH_UNLOCKS : civilization === 'covenant' ? COVENANT_RESEARCH_UNLOCKS : RESEARCH_UNLOCKS;
  return factionUnlocks[id] ?? RESEARCH_UNLOCKS[id];
};

export const ORBITAL_DEFENSE_STATS = { hp: 420, shields: 220, damage: 32 } as const;
export const ANTI_SPACE_BATTERY_STATS = { hp: 300, shields: 120, damage: 12 } as const;
export const DEFENSE_REBUILD_COOLDOWN_SECONDS = 10;
export const ADVANCED_GROUND_FACTORY_CAPACITY = 2.5;
export const DEFENSE_BUILDING_KINDS: readonly DefenseBuildingKind[] = ['groundDefense', 'antiSpaceDefense', 'spaceDefense'];
export const isDefenseBuildingKind = (kind: BuildingKind): kind is DefenseBuildingKind => DEFENSE_BUILDING_KINDS.includes(kind as DefenseBuildingKind);
export const isBuildingOperational = (building: Building) => (building.constructionRemaining ?? 0) <= 0;
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
export const FIGHTER_HIT_POINTS = 40;
export const ANTI_FIGHTER_DAMAGE_MULTIPLIER = 3;
export const ORBITAL_BOMBARDMENT_DAMAGE_PER_SHIP = 1;
export const RESOURCE_COLLECTION_MULTIPLIER = 4;
export const GRAVITY_WELL_RADIUS = 780;
export const MAX_SHIP_ORBIT_RADIUS = GRAVITY_WELL_RADIUS - 80;
export const MIN_SHIP_ORBIT_SEPARATION = 40;
export const ORBIT_MANEUVER_SPEED = 18;
export const LANDING_APPROACH_SPEED = 14;
export const SYSTEM_EXIT_SPEED = 18;
export const PHASE_GATE_CHARGE_SECONDS = 2;

export const COALITION_GROUND_KINDS: GroundUnitKind[] = ['infantry', 'antiVehicle', 'recon', 'lightTank', 'artillery', 'shockTrooper', 'railgunTank', 'plasmaTank', 'siegeWalker'];
export const BROOD_GROUND_KINDS: GroundUnitKind[] = ['broodling', 'acidSpitter', 'skitterer', 'carapaceBeast', 'sporeLobber', 'synapseGuard', 'crusherBeast', 'acidBehemoth', 'siegeCrawler'];
export const COALITION_SPACE_KINDS: SpaceUnitKind[] = ['transport', 'escortFrigate', 'missileFrigate', 'lightCruiser', 'destroyer', 'assaultCarrier', 'battlecruiser', 'commandFlagship', 'dreadnought'];
export const BROOD_SPACE_KINDS: SpaceUnitKind[] = ['sporeArk', 'clawFrigate', 'needleFrigate', 'hiveCruiser', 'voidStalker', 'broodCarrier', 'leviathan', 'broodRazorQueen', 'worldEater'];
export const GROUND_KINDS: GroundUnitKind[] = [...COALITION_GROUND_KINDS, 'defenseTurret', ...BROOD_GROUND_KINDS, 'spineTower', ...AEGIS_GROUND_KINDS, ...COVENANT_GROUND_KINDS, 'covenantBulwark'];
export const SPACE_KINDS: SpaceUnitKind[] = [...COALITION_SPACE_KINDS, ...BROOD_SPACE_KINDS, ...AEGIS_SPACE_KINDS, ...COVENANT_SPACE_KINDS];
export const FLAGSHIP_KINDS: ReadonlySet<SpaceUnitKind> = new Set(['commandFlagship', 'broodRazorQueen', 'aegisArbiterFlagship', 'covenantNullFlagship']);
export const isFlagshipKind = (kind: UnitKind): kind is SpaceUnitKind => FLAGSHIP_KINDS.has(kind as SpaceUnitKind);

const BROOD_EQUIVALENTS: Partial<Record<UnitKind, UnitKind>> = {
  infantry: 'broodling', antiVehicle: 'acidSpitter', recon: 'skitterer', lightTank: 'carapaceBeast', artillery: 'sporeLobber',
  shockTrooper: 'synapseGuard', railgunTank: 'crusherBeast', plasmaTank: 'acidBehemoth', siegeWalker: 'siegeCrawler', defenseTurret: 'spineTower',
  transport: 'sporeArk', escortFrigate: 'clawFrigate', missileFrigate: 'needleFrigate', lightCruiser: 'hiveCruiser', destroyer: 'voidStalker',
  assaultCarrier: 'broodCarrier', battlecruiser: 'leviathan', commandFlagship: 'broodRazorQueen', dreadnought: 'worldEater',
};
const BROOD_UNIT_KINDS = new Set<UnitKind>([...BROOD_GROUND_KINDS, 'spineTower', ...BROOD_SPACE_KINDS]);
const AEGIS_EQUIVALENTS: Partial<Record<UnitKind, UnitKind>> = {
  infantry: 'aegisWarden', antiVehicle: 'aegisWarden', recon: 'aegisWarden', lightTank: 'aegisBastionTank', artillery: 'aegisRampartArtillery',
  shockTrooper: 'aegisPaladinGuard', railgunTank: 'aegisFortressWalker', plasmaTank: 'aegisFortressWalker', siegeWalker: 'aegisFortressWalker',
  transport: 'aegisBastionLander', escortFrigate: 'aegisShieldMonitor', missileFrigate: 'aegisLanceFrigate', lightCruiser: 'aegisWardCruiser', destroyer: 'aegisWardCruiser',
  assaultCarrier: 'aegisCitadelCarrier', battlecruiser: 'aegisSovereignDreadnought', commandFlagship: 'aegisArbiterFlagship', dreadnought: 'aegisSovereignDreadnought',
};
const AEGIS_UNIT_KINDS = new Set<UnitKind>([...AEGIS_GROUND_KINDS, ...AEGIS_SPACE_KINDS]);
const COVENANT_EQUIVALENTS: Partial<Record<UnitKind, UnitKind>> = {
  infantry: 'covenantCohort', antiVehicle: 'covenantCohort', recon: 'covenantRepairDrone', lightTank: 'covenantBastionStrider', artillery: 'covenantFurnaceArtillery',
  shockTrooper: 'covenantRepairDrone', railgunTank: 'covenantJuggernaut', plasmaTank: 'covenantJuggernaut', siegeWalker: 'covenantJuggernaut', defenseTurret: 'covenantBulwark',
  transport: 'covenantAssemblyArk', escortFrigate: 'covenantSalvageFrigate', missileFrigate: 'covenantChainFrigate', lightCruiser: 'covenantFoundryCruiser', destroyer: 'covenantFoundryCruiser',
  assaultCarrier: 'covenantFabricatorCarrier', battlecruiser: 'covenantIronclad', commandFlagship: 'covenantNullFlagship', dreadnought: 'covenantDreadforge',
};
const COVENANT_UNIT_KINDS = new Set<UnitKind>([...COVENANT_GROUND_KINDS, 'covenantBulwark', ...COVENANT_SPACE_KINDS]);
const SPECIALIZED_UNIT_KINDS = new Set<UnitKind>([...BROOD_UNIT_KINDS, ...AEGIS_UNIT_KINDS, ...COVENANT_UNIT_KINDS]);

export const groundUnitKindsForCivilization = (civilization: PlayableFaction) => civilization === 'brood' ? BROOD_GROUND_KINDS : civilization === 'aegis' ? AEGIS_GROUND_KINDS : civilization === 'covenant' ? COVENANT_GROUND_KINDS : COALITION_GROUND_KINDS;
export const spaceUnitKindsForCivilization = (civilization: PlayableFaction) => civilization === 'brood' ? BROOD_SPACE_KINDS : civilization === 'aegis' ? AEGIS_SPACE_KINDS : civilization === 'covenant' ? COVENANT_SPACE_KINDS : COALITION_SPACE_KINDS;
export const civilizationUnitKind = (civilization: PlayableFaction, baseline: UnitKind): UnitKind => civilization === 'brood' ? BROOD_EQUIVALENTS[baseline] ?? baseline : civilization === 'aegis' ? AEGIS_EQUIVALENTS[baseline] ?? baseline : civilization === 'covenant' ? COVENANT_EQUIVALENTS[baseline] ?? baseline : baseline;
export const unitAvailableToCivilization = (kind: UnitKind, civilization: PlayableFaction) => civilization === 'brood' ? BROOD_UNIT_KINDS.has(kind) : civilization === 'aegis' ? AEGIS_UNIT_KINDS.has(kind) : civilization === 'covenant' ? COVENANT_UNIT_KINDS.has(kind) : !SPECIALIZED_UNIT_KINDS.has(kind);
export const groundDefenseKindForCivilization = (civilization: PlayableFaction): GroundUnitKind => civilization === 'brood' ? 'spineTower' : civilization === 'covenant' ? 'covenantBulwark' : 'defenseTurret';
export const BUILDING_KINDS = Object.keys(BUILDINGS) as BuildingKind[];
export const UNLIMITED_BUILDING_KINDS: ReadonlySet<BuildingKind> = new Set([
  'groundFactory', 'advancedGroundFactory', 'spaceFactory', 'advancedSpaceFactory',
]);
export const hasUnlimitedBuildingCapacity = (kind: BuildingKind) => UNLIMITED_BUILDING_KINDS.has(kind);
