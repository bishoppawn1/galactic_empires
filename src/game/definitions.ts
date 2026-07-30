import type { Building, BuildingKind, DefenseBuildingKind, Definition, GroundUnitKind, MapSize, PlayableFaction, ResearchId, ResourcePool, ShipWeaponBattery, SpaceShipTier, SpaceUnitKind, SpaceYardKind, UnitDefinition, UnitKind, WeaponDefinition } from './types';
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
export const GALACTIC_GALAXY_CANVAS_WIDTH = 19200;
export interface GalaxyCanvasDimensions { width: number; height: number }
export const galaxyCanvasDimensions = (mapSize: MapSize): GalaxyCanvasDimensions => ({
  width: mapSize === 'galactic' ? GALACTIC_GALAXY_CANVAS_WIDTH : GALAXY_CANVAS_WIDTH,
  height: GALAXY_CANVAS_HEIGHT,
});

export const BUILDINGS: Record<BuildingKind, Definition> = {
  metalMine: { label: 'Metal Mine', description: 'Produces a permanent stream of metal.', cost: pool(0, 80, 45) },
  crystalMine: { label: 'Crystal Extractor', description: 'Produces a permanent stream of crystal.', cost: pool(75, 0, 50) },
  goldMine: { label: 'Gold Mine', description: 'Produces a permanent stream of gold.', cost: pool(85, 65, 0) },
  groundFactory: { label: 'Ground Factory', description: 'Produces basic planetary forces.', cost: pool(140, 80, 40) },
  advancedGroundFactory: { label: 'Advanced Ground Factory', description: 'Produces heavy armies with 2.5× factory capacity.', cost: pool(280, 180, 120), requires: 'advancedIndustry' },
  spaceFactory: { label: 'Space Yard', description: 'Tier 1 yard for transports and frigates.', cost: pool(160, 110, 65) },
  advancedSpaceFactory: { label: 'Advanced Space Yard', description: 'Tier 2 yard for upgraded role ships and cruiser-class warships.', cost: pool(340, 240, 170), requires: 'advancedIndustry' },
  experimentalSpaceFactory: { label: 'Experimental Space Yard', description: 'Tier 3 yard for mega-carriers, capital ships, and Titans.', cost: pool(650, 480, 350), requires: 'capitalShips' },
  groundDefense: { label: 'Ground Defenses', description: 'Deploys a stationary long-range turret during every invasion.', cost: pool(100, 45, 25), time: 8 },
  antiSpaceDefense: { label: 'Anti-Space Battery', description: 'Damages hostile ships in orbit.', cost: pool(130, 75, 55), time: 10 },
  spaceDefense: { label: 'Orbital Defenses', description: 'Protects the planet’s orbital space.', cost: pool(180, 100, 75), time: 12 },
  researchLab: { label: 'Research Lab', description: 'Unlocks strategic research; every additional lab compounds research speed by 1.5×.', cost: pool(190, 160, 130) },
};

export const UNITS: Record<UnitKind, UnitDefinition> = {
  infantry: { label: 'Infantry', description: 'Flexible line squad with rapid pulse-rifle bursts.', cost: pool(30, 8, 4), time: 10, factory: 'ground', hp: 100, shields: 20, range: 14, moveSpeed: 7, weapon: { label: 'Tri-Burst Pulse Rifle', damage: 1, cooldown: .95, projectiles: 3, effect: 'pulse' } },
  antiVehicle: { label: 'Anti-Vehicle Infantry', description: 'Hard counter to armor with a slow guided rocket.', cost: pool(42, 14, 8), time: 14, factory: 'ground', hp: 90, shields: 20, range: 18, moveSpeed: 5.5, weapon: { label: 'Hunter-Killer Rocket', damage: 9, cooldown: 2.2, projectiles: 1, effect: 'missile' } },
  recon: { label: 'Light Recon Vehicle', description: 'Fast scouting armor with twin autocannons.', cost: pool(55, 18, 9), time: 16, factory: 'ground', hp: 130, shields: 15, range: 11, moveSpeed: 11, weapon: { label: 'Twin Autocannon', damage: 1, cooldown: .5, projectiles: 2, effect: 'kinetic' } },
  lightTank: { label: 'Light Tank', description: 'Durable armor carrying a medium accelerator cannon.', cost: pool(82, 30, 15), time: 22, factory: 'ground', hp: 220, shields: 30, range: 16, moveSpeed: 5, weapon: { label: 'Accelerator Cannon', damage: 7, cooldown: 1.2, projectiles: 1, effect: 'kinetic' } },
  artillery: { label: 'Light Artillery', description: 'Long-range fire support delivering heavy mortar salvos.', cost: pool(75, 36, 18), time: 24, factory: 'ground', hp: 115, shields: 10, range: 30, moveSpeed: 3.5, weapon: { label: 'Arc Mortar', damage: 18, cooldown: 2.6, projectiles: 1, effect: 'artillery' } },
  transport: { label: 'Transport', description: 'Carries four squads and mounts a light point-defense laser.', cost: pool(70, 48, 20), time: 18, factory: 'space', spaceTier: 1, hp: 180, shields: 90, range: 160, moveSpeed: 0, weapon: { label: 'Point-Defense Laser', damage: .14, cooldown: .25, projectiles: 1, effect: 'laser' }, capacity: 4 },
  escortFrigate: { label: 'Escort Frigate', description: 'Close escort with three low-damage continuous laser emitters.', cost: pool(120, 70, 35), time: 26, factory: 'space', spaceTier: 1, hp: 260, shields: 130, range: 280, moveSpeed: 0, weapon: { label: 'Laser Emitter', damage: .5, cooldown: .4, projectiles: 3, effect: 'laser' } },
  missileFrigate: { label: 'Missile Frigate', description: 'Long-range frigate with one slow, devastating missile launcher.', cost: pool(135, 82, 42), time: 30, factory: 'space', spaceTier: 1, hp: 230, shields: 115, range: 440, moveSpeed: 0, weapon: { label: 'Heavy Siege Missile Launcher', damage: 17, cooldown: 3.5, projectiles: 1, effect: 'missile' } },
  flakFrigate: { label: 'Flak Frigate', description: 'A compact escort mounting rapid tracking cannons for screening hostile strike craft.', cost: pool(145, 90, 45), time: 32, factory: 'space', spaceTier: 1, hp: 245, shields: 125, range: 300, moveSpeed: 0, weapon: { label: 'Tracking Flak Cannon', damage: .35, cooldown: .42, projectiles: 4, effect: 'kinetic' }, ability: { kind: 'antiFighterCannons', label: 'Fighter Screen', description: 'Prioritizes one hostile fighter wing and deals 50% more damage to fighters.' } },
  reconCutter: { label: 'Recon Cutter', description: 'A lightly armed Tier 1 scout whose oversized phase drive crosses systems at extreme speed.', cost: pool(95, 58, 26), time: 20, factory: 'space', spaceTier: 1, hp: 150, shields: 75, range: 200, moveSpeed: 0, orbitSpeedMultiplier: 2.5, weapon: { label: 'Survey Laser', damage: .18, cooldown: .8, projectiles: 1, effect: 'laser' }, ability: { kind: 'reconDrive', label: 'High-Velocity Recon Drive', description: 'Moves through gravity wells and phase lanes at 2.5× normal ship speed, but carries only a light defensive weapon.' } },
  phaseSuppressionFrigate: { label: 'Suppression Frigate', description: 'A Tier 1 control frigate whose phase coils drag on hostile drives and weapon cycles.', cost: pool(165, 105, 58), time: 36, factory: 'space', spaceTier: 1, hp: 245, shields: 135, range: 340, moveSpeed: 0, weapon: { label: 'Phase Suppression Pulse', damage: .28, cooldown: .8, projectiles: 2, effect: 'pulse' }, ability: { kind: 'phaseControl', label: 'Phase Suppression', description: 'Enemies inside range move and fire at 75% speed. Multiple fields stack multiplicatively.' } },
  advancedTransport: { label: 'Transport Cruiser', description: 'Tier 2 counterpart to the Transport, carrying eight squads behind a reinforced hull.', cost: pool(190, 130, 75), time: 38, factory: 'space', spaceTier: 2, hp: 360, shields: 180, range: 190, moveSpeed: 0, weapon: { label: 'Advanced Point-Defense Laser', damage: .2, cooldown: .25, projectiles: 2, effect: 'laser' }, capacity: 8, requires: 'orbitalEngineering' },
  advancedEscortFrigate: { label: 'Escort Cruiser', description: 'Tier 2 counterpart to the Escort Frigate with heavier protection and a fourth beam mount.', cost: pool(260, 175, 105), time: 48, factory: 'space', spaceTier: 2, hp: 520, shields: 260, range: 330, moveSpeed: 0, weapon: { label: 'Advanced Laser Emitter', damage: .7, cooldown: .4, projectiles: 4, effect: 'laser' }, requires: 'orbitalEngineering' },
  advancedMissileFrigate: { label: 'Missile Cruiser', description: 'Tier 2 counterpart to the Missile Frigate carrying paired long-range siege launchers.', cost: pool(290, 195, 120), time: 54, factory: 'space', spaceTier: 2, hp: 460, shields: 230, range: 480, moveSpeed: 0, weapon: { label: 'Advanced Siege Missile Launcher', damage: 18, cooldown: 3.5, projectiles: 2, effect: 'missile' }, requires: 'orbitalEngineering' },
  advancedFlakFrigate: { label: 'Flak Cruiser', description: 'Tier 2 counterpart to the Flak Frigate with six high-speed tracking cannons.', cost: pool(300, 205, 125), time: 56, factory: 'space', spaceTier: 2, hp: 490, shields: 250, range: 340, moveSpeed: 0, weapon: { label: 'Advanced Tracking Flak Cannon', damage: .45, cooldown: .42, projectiles: 6, effect: 'kinetic' }, requires: 'orbitalEngineering', ability: { kind: 'antiFighterCannons', label: 'Advanced Fighter Screen', description: 'Prioritizes one hostile fighter wing and deals 50% more damage to fighters.' } },
  phaseLockCruiser: { label: 'Phase-Lock Cruiser', description: 'Tier 2 counterpart to the Suppression Frigate, projecting a stronger field that seals hostile phase gates.', cost: pool(365, 245, 150), time: 64, factory: 'space', spaceTier: 2, hp: 510, shields: 285, range: 400, moveSpeed: 0, weapon: { label: 'Phase-Lock Pulse', damage: .42, cooldown: .8, projectiles: 4, effect: 'pulse' }, requires: 'orbitalEngineering', ability: { kind: 'phaseControl', label: 'Phase Interdiction', description: 'Enemies inside range move and fire at 75% speed and cannot enter a phase lane. Multiple fields stack multiplicatively.' } },
  shockTrooper: { label: 'Shock Troopers', description: 'Shielded assault infantry firing paired arc carbines.', cost: pool(88, 55, 30), time: 28, factory: 'ground', hp: 180, shields: 85, range: 17, moveSpeed: 7.5, weapon: { label: 'Dual Arc Carbines', damage: 3, cooldown: .8, projectiles: 2, effect: 'pulse' }, requires: 'groundWarfare', advancedFactory: true },
  railgunTank: { label: 'Railgun Tank', description: 'Fast heavy armor with a deliberate hypervelocity rail shot.', cost: pool(175, 110, 58), time: 42, factory: 'ground', hp: 430, shields: 75, range: 25, moveSpeed: 5.2, weapon: { label: 'Hypervelocity Railgun', damage: 24, cooldown: 1.9, projectiles: 1, effect: 'railgun' }, requires: 'heavyArmor', advancedFactory: true },
  lightCruiser: { label: 'Light Cruiser', description: 'Tier 2 line warship improving on frigate protection and firepower.', cost: pool(250, 170, 105), time: 46, factory: 'space', spaceTier: 2, hp: 480, shields: 240, range: 340, moveSpeed: 0, weapon: { label: 'Pulse Cannon', damage: 1.9, cooldown: 1, projectiles: 4, effect: 'pulse' }, requires: 'orbitalEngineering' },
  destroyer: { label: 'Phase Cruiser', description: 'Tier 2 heavy cruiser with a hardened hull and triple kinetic broadside.', cost: pool(330, 220, 135), time: 54, factory: 'space', spaceTier: 2, hp: 720, shields: 360, range: 360, moveSpeed: 0, weapon: { label: 'Phase-Ion Broadside Cannon', damage: 3.5, cooldown: 1, projectiles: 3, effect: 'kinetic' }, requires: 'orbitalEngineering' },
  plasmaTank: { label: 'Plasma Tank', description: 'Heavy shielded armor built around a plasma lance.', cost: pool(155, 92, 48), time: 38, factory: 'ground', hp: 390, shields: 90, range: 19, moveSpeed: 4.2, weapon: { label: 'Plasma Lance', damage: 13, cooldown: 1.25, projectiles: 1, effect: 'plasma' }, requires: 'heavyArmor', advancedFactory: true },
  siegeWalker: { label: 'Siege Walker', description: 'Long-range armored platform with a fortress-breaking cannon.', cost: pool(210, 135, 72), time: 52, factory: 'ground', hp: 520, shields: 120, range: 36, moveSpeed: 2.6, weapon: { label: 'Quake Siege Cannon', damage: 31, cooldown: 2.1, projectiles: 1, effect: 'siege' }, requires: 'heavyArmor', advancedFactory: true },
  defenseTurret: { label: 'Defense Turret', description: 'Fortified emplacement with a dual repeater cannon.', cost: pool(), factory: 'ground', hp: 320, shields: 70, range: 32, moveSpeed: 0, weapon: { label: 'Dual Repeater Cannon', damage: 4, cooldown: 1, projectiles: 2, effect: 'kinetic' } },
  assaultCarrier: { label: 'Atlas Mega Carrier', description: 'Tier 3 fleet carrier transporting eight squads and launching replaceable strike fighters.', cost: pool(600, 440, 280), time: 92, factory: 'space', spaceTier: 3, hp: 1050, shields: 540, range: 340, moveSpeed: 0, weapon: { label: 'Falcon Strike Fighter', damage: 1.5, cooldown: .92, projectiles: 8, effect: 'drone' }, requires: 'carrierOperations', capacity: 8, fighterWing: { label: 'Falcon Fighters', capacity: 8, rebuildTime: 18, attritionTime: 15 } },
  battlecruiser: { label: 'Battlecruiser', description: 'Tier 3 capital hull armed with two heavy rail batteries.', cost: pool(520, 360, 240), time: 78, factory: 'space', spaceTier: 3, hp: 980, shields: 520, range: 400, moveSpeed: 0, weapon: { label: 'Capital Railgun', damage: 8, cooldown: 1, projectiles: 2, effect: 'railgun' }, requires: 'capitalShips' },
  dreadnought: { label: 'Titan Dreadnought', description: 'The Coalition’s unique Tier 3 Titan, firing three colossal siege beams.', cost: pool(900, 680, 460), time: 120, factory: 'space', spaceTier: 3, hp: 1900, shields: 1050, range: 460, moveSpeed: 0, weapon: { label: 'Siege Beam', damage: 10, cooldown: 1, projectiles: 3, effect: 'siege' }, requires: 'titanEngineering' },
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
  sporeArk: { label: 'Spore Ark', description: 'A living landing vessel that regenerates even while crossing hostile space.', cost: pool(68, 42, 16), time: 16, factory: 'space', spaceTier: 1, hp: 240, shields: 45, range: 140, moveSpeed: 0, weapon: { label: 'Defensive Spore Cyst', damage: .18, cooldown: .3, projectiles: 2, effect: 'drone' }, capacity: 5, ability: { kind: 'livingHold', label: 'Living Hold', description: 'Regenerates 4 hull per second in any orbit or phase lane.' } },
  clawFrigate: { label: 'Claw Frigate', description: 'An aggressive hunter organism that specializes in gutting troop carriers.', cost: pool(112, 62, 28), time: 23, factory: 'space', spaceTier: 1, hp: 300, shields: 70, range: 220, moveSpeed: 0, weapon: { label: 'Ripper Talon', damage: .7, cooldown: .32, projectiles: 3, effect: 'kinetic' }, ability: { kind: 'transportHunter', label: 'Transport Hunter', description: 'Deals 50% more damage to ships carrying ground units.' } },
  needleFrigate: { label: 'Needle Frigate', description: 'A brittle sniper whose void spines punch through shields into living hull.', cost: pool(128, 76, 34), time: 27, factory: 'space', spaceTier: 1, hp: 200, shields: 80, range: 470, moveSpeed: 0, weapon: { label: 'Void Needle', damage: 15, cooldown: 2.8, projectiles: 1, effect: 'missile' }, ability: { kind: 'shieldPiercing', label: 'Void Piercing', description: 'Half of each attack bypasses shields and strikes hull directly.' } },
  broodSporeguard: { label: 'Sporeguard Frigate', description: 'A lean escort organism bred to burst tracking spores among hostile strike craft.', cost: pool(140, 84, 40), time: 29, factory: 'space', spaceTier: 1, hp: 270, shields: 65, range: 290, moveSpeed: 0, weapon: { label: 'Tracking Spore Cyst', damage: .4, cooldown: .4, projectiles: 4, effect: 'drone' }, ability: { kind: 'antiFighterCannons', label: 'Hunter Spores', description: 'Prioritizes one hostile fighter wing and deals 50% more damage to fighters.' } },
  broodSeeker: { label: 'Seeker', description: 'A fragile Tier 1 reconnaissance organism bred around an oversized migration organ.', cost: pool(85, 50, 22), time: 18, factory: 'space', spaceTier: 1, hp: 175, shields: 35, range: 190, moveSpeed: 0, orbitSpeedMultiplier: 2.5, weapon: { label: 'Sighting Spore', damage: .16, cooldown: .75, projectiles: 2, effect: 'drone' }, ability: { kind: 'reconDrive', label: 'Migratory Surge', description: 'Moves through gravity wells and phase lanes at 2.5× normal ship speed, but carries only light sighting spores.' } },
  voidBinder: { label: 'Void Binder', description: 'A Tier 1 control organism whose neural gland weighs down hostile movement and attacks.', cost: pool(150, 90, 42), time: 32, factory: 'space', spaceTier: 1, hp: 260, shields: 55, range: 330, moveSpeed: 0, weapon: { label: 'Binding Cyst', damage: .25, cooldown: .75, projectiles: 2, effect: 'plasma' }, ability: { kind: 'phaseControl', label: 'Void Binding', description: 'Enemies inside range move and fire at 75% speed. Multiple fields stack multiplicatively.' } },
  greaterSporeArk: { label: 'Spore Ark Cruiser', description: 'Tier 2 counterpart to the Spore Ark with ten living holds and a denser regenerating carapace.', cost: pool(180, 118, 62), time: 34, factory: 'space', spaceTier: 2, hp: 480, shields: 90, range: 180, moveSpeed: 0, weapon: { label: 'Greater Defensive Spore Cyst', damage: .25, cooldown: .3, projectiles: 4, effect: 'drone' }, capacity: 10, requires: 'orbitalEngineering', ability: { kind: 'livingHold', label: 'Greater Living Hold', description: 'Regenerates 4 hull per second in any orbit or phase lane.' } },
  clawCruiser: { label: 'Claw Cruiser', description: 'Tier 2 counterpart to the Claw Frigate, enlarged for sustained attacks on troop carriers.', cost: pool(245, 160, 92), time: 44, factory: 'space', spaceTier: 2, hp: 600, shields: 140, range: 280, moveSpeed: 0, weapon: { label: 'Greater Ripper Talon', damage: .9, cooldown: .32, projectiles: 5, effect: 'kinetic' }, requires: 'orbitalEngineering', ability: { kind: 'transportHunter', label: 'Apex Transport Hunter', description: 'Deals 50% more damage to ships carrying ground units.' } },
  needleCruiser: { label: 'Needle Cruiser', description: 'Tier 2 counterpart to the Needle Frigate with paired shield-piercing void spines.', cost: pool(270, 180, 105), time: 50, factory: 'space', spaceTier: 2, hp: 400, shields: 160, range: 510, moveSpeed: 0, weapon: { label: 'Greater Void Needle', damage: 18, cooldown: 2.8, projectiles: 2, effect: 'missile' }, requires: 'orbitalEngineering', ability: { kind: 'shieldPiercing', label: 'Greater Void Piercing', description: 'Half of each attack bypasses shields and strikes hull directly.' } },
  greaterSporeguard: { label: 'Sporeguard Cruiser', description: 'Tier 2 counterpart to the Sporeguard Frigate, bursting larger tracking-spore clouds.', cost: pool(285, 190, 110), time: 52, factory: 'space', spaceTier: 2, hp: 540, shields: 130, range: 340, moveSpeed: 0, weapon: { label: 'Greater Tracking Spore Cyst', damage: .55, cooldown: .4, projectiles: 6, effect: 'drone' }, requires: 'orbitalEngineering', ability: { kind: 'antiFighterCannons', label: 'Greater Hunter Spores', description: 'Prioritizes one hostile fighter wing and deals 50% more damage to fighters.' } },
  greaterVoidBinder: { label: 'Void Binder Cruiser', description: 'Tier 2 counterpart to the Void Binder, sealing phase lanes with a cruiser-scale neural field.', cost: pool(330, 215, 130), time: 58, factory: 'space', spaceTier: 2, hp: 520, shields: 110, range: 390, moveSpeed: 0, weapon: { label: 'Greater Binding Cyst', damage: .38, cooldown: .75, projectiles: 4, effect: 'plasma' }, requires: 'orbitalEngineering', ability: { kind: 'phaseControl', label: 'Void Interdiction', description: 'Enemies inside range move and fire at 75% speed and cannot enter a phase lane. Multiple fields stack multiplicatively.' } },
  hiveCruiser: { label: 'Hive Cruiser', description: 'A Tier 2 synaptic war organism coordinating every nearby living ship.', cost: pool(235, 152, 88), time: 42, factory: 'space', spaceTier: 2, hp: 560, shields: 170, range: 320, moveSpeed: 0, weapon: { label: 'Bioplasma Node', damage: 1.8, cooldown: .85, projectiles: 5, effect: 'plasma' }, requires: 'orbitalEngineering', ability: { kind: 'orbitalSynapse', label: 'Orbital Synapse', description: 'Nearby allied ships deal 25% more damage.' } },
  voidStalker: { label: 'Void Stalker Cruiser', description: 'A Tier 2 phase-shifting ambush organism that turns aside incoming fire.', cost: pool(310, 198, 112), time: 50, factory: 'space', spaceTier: 2, hp: 650, shields: 280, range: 380, moveSpeed: 0, weapon: { label: 'Phase Spine', damage: 4.3, cooldown: .9, projectiles: 3, effect: 'kinetic' }, requires: 'orbitalEngineering', ability: { kind: 'phaseCarapace', label: 'Phase Carapace', description: 'Reduces incoming damage by 35%.' } },
  broodCarrier: { label: 'Brood Mega-Carrier', description: 'A Tier 3 mobile hive that regrows attack spawn and splits them across hostile ships.', cost: pool(590, 410, 250), time: 88, factory: 'space', spaceTier: 3, hp: 1180, shields: 300, range: 330, moveSpeed: 0, weapon: { label: 'Ripper Spawn', damage: 1.4, cooldown: .7, projectiles: 10, effect: 'drone' }, requires: 'carrierOperations', capacity: 12, fighterWing: { label: 'Ripper Spawn', capacity: 10, rebuildTime: 12, attritionTime: 10 }, ability: { kind: 'spawnCloud', label: 'Spawn Cloud', description: 'Every fighter attack also pressures a second nearby hostile ship for 50% damage.' } },
  leviathan: { label: 'Leviathan', description: 'A Tier 3 capital predator that consumes matter to mend its wounded body.', cost: pool(500, 330, 210), time: 72, factory: 'space', spaceTier: 3, hp: 1150, shields: 360, range: 390, moveSpeed: 0, weapon: { label: 'Nova Gland', damage: 9.5, cooldown: 1.1, projectiles: 2, effect: 'plasma' }, requires: 'capitalShips', ability: { kind: 'devour', label: 'Devour', description: 'Restores hull equal to 20% of the damage it deals.' } },
  worldEater: { label: 'World Eater', description: 'The Brood’s unique Tier 3 Titan, able to crack orbital fortresses in a few feeding passes.', cost: pool(860, 630, 410), time: 112, factory: 'space', spaceTier: 3, hp: 2200, shields: 650, range: 480, moveSpeed: 0, weapon: { label: 'Devouring Beam', damage: 12, cooldown: 1.1, projectiles: 3, effect: 'siege' }, requires: 'titanEngineering', ability: { kind: 'planetCracker', label: 'Planet Cracker', description: 'Deals double damage to orbital defense platforms.' } },
  ...AEGIS_UNITS,
  ...COVENANT_UNITS,
};

const SHIP_SECONDARY_WEAPONS: Partial<Record<SpaceUnitKind, WeaponDefinition[]>> = {
  lightCruiser: [{ label: 'Point-Defense Laser', damage: .35, cooldown: .45, projectiles: 2, effect: 'laser', range: 180 }],
  destroyer: [{ label: 'Pulse Turret', damage: .8, cooldown: .6, projectiles: 2, effect: 'pulse', range: 240 }],
  assaultCarrier: [{ label: 'Point-Defense Laser', damage: .4, cooldown: .45, projectiles: 4, effect: 'laser', range: 220 }],
  battlecruiser: [{ label: 'Pulse Turret', damage: .9, cooldown: .6, projectiles: 4, effect: 'pulse', range: 260 }],
  dreadnought: [{ label: 'Point-Defense Laser', damage: .7, cooldown: .45, projectiles: 6, effect: 'laser', range: 280 }],
  hiveCruiser: [{ label: 'Needle Cluster', damage: .5, cooldown: .5, projectiles: 2, effect: 'kinetic', range: 200 }],
  voidStalker: [{ label: 'Acid Cusp', damage: .8, cooldown: .55, projectiles: 2, effect: 'plasma', range: 230 }],
  broodCarrier: [{ label: 'Defensive Spore Cyst', damage: .35, cooldown: .4, projectiles: 4, effect: 'drone', range: 220 }],
  leviathan: [{ label: 'Ripper Talon', damage: .9, cooldown: .45, projectiles: 4, effect: 'kinetic', range: 250 }],
  worldEater: [{ label: 'Bioplasma Nodule', damage: .8, cooldown: .5, projectiles: 6, effect: 'plasma', range: 280 }],
  aegisWardCruiser: [{ label: 'Guardian Laser', damage: .55, cooldown: .45, projectiles: 2, effect: 'laser', range: 220 }],
  aegisCitadelCarrier: [{ label: 'Guardian Laser', damage: .55, cooldown: .4, projectiles: 6, effect: 'laser', range: 250 }],
  aegisSovereignDreadnought: [{ label: 'Ward Plasma Turret', damage: .8, cooldown: .5, projectiles: 8, effect: 'plasma', range: 300 }],
  covenantFoundryCruiser: [{ label: 'Point-Defense Laser', damage: .4, cooldown: .45, projectiles: 2, effect: 'laser', range: 210 }],
  covenantFabricatorCarrier: [{ label: 'Chain Cannon', damage: .65, cooldown: .5, projectiles: 4, effect: 'kinetic', range: 230 }],
  covenantIronclad: [{ label: 'Defense Cannon', damage: .8, cooldown: .55, projectiles: 6, effect: 'kinetic', range: 270 }],
  covenantDreadforge: [{ label: 'Defense Cannon', damage: 1, cooldown: .55, projectiles: 8, effect: 'kinetic', range: 300 }],
};

const SHIP_WEAPON_BATTERY_CACHE = new Map<SpaceUnitKind, readonly ShipWeaponBattery[]>();
export const shipWeaponBatteries = (kind: SpaceUnitKind): readonly ShipWeaponBattery[] => {
  const cached = SHIP_WEAPON_BATTERY_CACHE.get(kind);
  if (cached) return cached;
  const batteries = [
    UNITS[kind].weapon,
    ...(SHIP_SECONDARY_WEAPONS[kind] ?? []),
  ].map(({ projectiles, range, ...weapon }) => ({
    ...weapon,
    mounts: projectiles,
    range: range ?? UNITS[kind].range,
  }));
  SHIP_WEAPON_BATTERY_CACHE.set(kind, batteries);
  return batteries;
};

export const shipArmor = (kind: SpaceUnitKind) => {
  const definition = UNITS[kind];
  if (isTitanKind(kind)) return .3;
  if (definition.spaceTier === 3) return definition.fighterWing ? .2 : .24;
  if (definition.spaceTier === 2) return .14;
  return definition.capacity ? .05 : .08;
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
  humanStandardization: { label: 'Interstellar Standardization', description: 'Common components let Coalition factories exchange work and finish every unit ten percent faster.', cost: pool(300, 235, 165), time: 58 },
  humanColonialCharters: { label: 'Colonial Charters', description: 'Autonomous colonial administrations increase resource output across the Coalition by ten percent.', cost: pool(360, 285, 210), time: 66 },
  humanJointOperations: { label: 'Joint Operations Command', description: 'Shared targeting and logistics doctrine increases Coalition ship and orbital damage by eight percent.', cost: pool(410, 330, 250), time: 76 },
  humanPhaseCouriers: { label: 'Phase Courier Network', description: 'A chain of navigation relays shortens Coalition phase travel by another ten percent.', cost: pool(430, 360, 270), time: 78 },
  humanFieldEngineering: { label: 'Combat Engineering Corps', description: 'Mobile engineering battalions increase the durability of planetary and orbital defenses by fifteen percent.', cost: pool(470, 370, 280), time: 84 },
  humanTargetingGrid: { label: 'Distributed Targeting Grid', description: 'Fleetwide fire-control coordination adds another ten percent ship and orbital weapon damage.', cost: pool(610, 490, 370), time: 98 },
  broodHypermetabolism: { label: 'Hypermetabolic Genesis', description: 'The first imperial organism consumes each world more efficiently, increasing all Brood biomass income by fifteen percent.', cost: pool(190, 150, 110), time: 40 },
  broodSpawningPools: { label: 'World-Spanning Spawning Pools', description: 'Linked birthing seas accelerate the gestation of every Brood organism by twenty percent.', cost: pool(340, 270, 190), time: 64 },
  broodSynapticDominion: { label: 'Synaptic Dominion', description: 'Overlapping command impulses increase all biofleet and orbital damage by ten percent.', cost: pool(430, 340, 250), time: 78 },
  broodVoidSenses: { label: 'Void-Sense Organs', description: 'Living navigators taste phase currents and shorten phase travel by fifteen percent.', cost: pool(390, 330, 245), time: 72 },
  broodWorldCarapace: { label: 'Planetary Carapace', description: 'Colonies grow continent-scale armor, increasing ground and orbital defense durability by twenty percent.', cost: pool(460, 355, 265), time: 82 },
  broodApexInstinct: { label: 'Apex Regeneration', description: 'Brood warships regenerate hull twice as quickly, even beyond friendly worlds.', cost: pool(570, 455, 345), time: 94 },
  aegisResonanceCore: { label: 'First Resonance', description: 'Awaken the harmonic core that all Directorate wards, sentinels, and structures synchronize through.', cost: pool(205, 185, 145), time: 42 },
  aegisPatientAssembly: { label: 'Patient Assembly', description: 'Perfected fabrication sequences increase sentinel production speed by ten percent.', cost: pool(305, 270, 215), time: 60 },
  aegisSanctuaryField: { label: 'Sanctuary Field', description: 'A fleetwide sanctuary frequency increases ship shield regeneration by seventy-five percent.', cost: pool(520, 480, 390), time: 92 },
  aegisFarcastBeacons: { label: 'Farcast Beacon Choir', description: 'Synchronized beacons shorten every Directorate phase crossing by fifteen percent.', cost: pool(420, 390, 300), time: 78 },
  aegisBastionLattice: { label: 'Bastion Lattice', description: 'Interlocked ward geometry increases planetary and orbital defense durability by forty percent.', cost: pool(540, 470, 360), time: 94 },
  aegisLanceResonance: { label: 'Lance Resonance', description: 'Weapons fire on a shared harmonic interval, increasing ship and orbital damage by ten percent.', cost: pool(600, 520, 410), time: 102 },
  covenantMachineAwakening: { label: 'Machine Awakening', description: 'Activate the prime logic that governs every Covenant foundry and war engine.', cost: pool(200, 165, 130), time: 40 },
  covenantOverclockedForges: { label: 'Overclocked Forges', description: 'Foundries run beyond their safety limits, increasing all unit production speed by twenty percent.', cost: pool(335, 260, 190), time: 62 },
  covenantSalvageAlgorithms: { label: 'Total Reclamation', description: 'Combat salvage protocols reclaim fifty percent more metal from destroyed machinery.', cost: pool(400, 315, 235), time: 72 },
  covenantPhaseCalculation: { label: 'Deterministic Phase Calculation', description: 'Predictive navigation shortens Covenant phase travel by ten percent.', cost: pool(390, 340, 260), time: 74 },
  covenantRedundantCores: { label: 'Redundant Command Cores', description: 'Distributed control systems increase planetary and orbital defense durability by twenty percent.', cost: pool(470, 375, 285), time: 84 },
  covenantSelfRepairMatrices: { label: 'Self-Repair Matrices', description: 'All Covenant ships repair hull twice as quickly in friendly and hostile space.', cost: pool(555, 445, 335), time: 92 },
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
  orbitalEngineering: ['Light Cruiser', 'Phase Cruiser'],
  shieldHarmonics: ['+50% ship shield regeneration'],
  quantumExtraction: ['+25% resource output'],
  deepCoreExtraction: ['Resource output bonus increased to +50%'],
  resourceSynthesis: ['Repeatable · +5% resource output per level'],
  heavyArmor: ['Railgun Tank', 'Plasma Tank', 'Siege Walker'],
  carrierOperations: ['Atlas Mega Carrier'],
  capitalShips: ['Experimental Space Yard', 'Battlecruiser'],
  weaponsCalibration: ['+15% ship and orbital weapon damage'],
  combatSimulation: ['Repeatable · +3% ship and orbital damage per level'],
  titanEngineering: ['Titan Dreadnought'],
  humanStandardization: ['+10% unit production speed'],
  humanColonialCharters: ['+10% resource output'],
  humanJointOperations: ['+8% ship and orbital damage'],
  humanPhaseCouriers: ['10% faster phase travel'],
  humanFieldEngineering: ['+15% defense durability'],
  humanTargetingGrid: ['+10% ship and orbital damage'],
};

const BROOD_RESEARCH_UNLOCKS: Partial<Record<ResearchId, string[]>> = {
  advancedIndustry: ['Advanced Ground Factory', 'Advanced Space Yard'],
  groundWarfare: ['Synapse Guard'],
  fleetLogistics: ['Brood Mega-Carrier doctrine'],
  orbitalEngineering: ['Hive Cruiser', 'Void Stalker Cruiser'],
  quantumExtraction: ['+25% planetary biomass'],
  industrialIteration: ['Repeatable · +5% gestation speed per level'],
  resourceSynthesis: ['Repeatable · +5% planetary biomass per level'],
  heavyArmor: ['Crusher Beast', 'Acid Behemoth', 'Siege Crawler'],
  carrierOperations: ['Brood Mega-Carrier'],
  capitalShips: ['Experimental Space Yard', 'Leviathan'],
  combatSimulation: ['Repeatable · +3% biofleet damage per level'],
  titanEngineering: ['World Eater'],
  broodHypermetabolism: ['+15% planetary biomass'],
  broodSpawningPools: ['+20% gestation speed'],
  broodSynapticDominion: ['+10% biofleet damage'],
  broodVoidSenses: ['15% faster phase travel'],
  broodWorldCarapace: ['+20% defense durability'],
  broodApexInstinct: ['2× biofleet hull regeneration'],
};

const AEGIS_RESEARCH_UNLOCKS: Partial<Record<ResearchId, string[]>> = {
  advancedIndustry: ['Advanced Ground Factory', 'Advanced Space Yard'], groundWarfare: ['Paladin Guard'],
  fleetLogistics: ['Citadel Mega-Carrier doctrine'], orbitalEngineering: ['Ward Cruiser'], quantumExtraction: ['+25% resource output'],
  heavyArmor: ['Fortress Walker'], carrierOperations: ['Citadel Mega-Carrier'], capitalShips: ['Experimental Space Yard', 'Sovereign command systems'], titanEngineering: ['Sovereign Titan'],
  industrialIteration: ['Repeatable · +5% sentinel production per level'], resourceSynthesis: ['Repeatable · +5% resource output per level'], combatSimulation: ['Repeatable · +3% fleet damage per level'],
  aegisResonanceCore: ['Harmonic technology lattice'],
  aegisPatientAssembly: ['+10% sentinel production speed'],
  aegisSanctuaryField: ['+75% ship shield regeneration'],
  aegisFarcastBeacons: ['15% faster phase travel'],
  aegisBastionLattice: ['+40% defense durability'],
  aegisLanceResonance: ['+10% ship and orbital damage'],
};

const COVENANT_RESEARCH_UNLOCKS: Partial<Record<ResearchId, string[]>> = {
  advancedIndustry: ['Advanced Ground Factory', 'Advanced Space Yard'], groundWarfare: ['Repair Drone'],
  fleetLogistics: ['Fabricator Mega-Carrier doctrine'], orbitalEngineering: ['Foundry Cruiser'], quantumExtraction: ['+25% resource output'],
  heavyArmor: ['Juggernaut Engine'], carrierOperations: ['Fabricator Mega-Carrier'], capitalShips: ['Experimental Space Yard', 'Ironclad Battleship'], titanEngineering: ['Dreadforge Titan'],
  industrialIteration: ['Repeatable · +5% assembly speed per level'], resourceSynthesis: ['Repeatable · +5% matter reclamation per level'], combatSimulation: ['Repeatable · +3% fleet damage per level'],
  covenantMachineAwakening: ['Prime foundry protocols'],
  covenantOverclockedForges: ['+20% unit production speed'],
  covenantSalvageAlgorithms: ['+50% battlefield salvage'],
  covenantPhaseCalculation: ['10% faster phase travel'],
  covenantRedundantCores: ['+20% defense durability'],
  covenantSelfRepairMatrices: ['2× ship hull repair'],
};

const FACTION_RESEARCH_LABELS: Record<PlayableFaction, Partial<Record<ResearchId, string>>> = {
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

export interface ResearchTreeNode {
  id: ResearchId;
  x: number;
  y: number;
  branch: string;
}

export interface ResearchTreeBranch {
  id: string;
  label: string;
  subtitle: string;
  y: number;
}

export interface FactionResearchTree {
  width: number;
  height: number;
  rootLabel: string;
  nodes: ResearchTreeNode[];
  branches: ResearchTreeBranch[];
  requires: Partial<Record<ResearchId, ResearchId>>;
}

const researchNode = (id: ResearchId, branch: string, column: number, y: number): ResearchTreeNode => ({
  id, branch, x: 36 + column * 346, y,
});

const HUMAN_RESEARCH_TREE: FactionResearchTree = {
  width: 2100,
  height: 2110,
  rootLabel: 'COALITION SCIENCE DIRECTORATE',
  branches: [
    { id: 'industry', label: 'INTERSTELLAR INDUSTRY', subtitle: 'Standards and automation', y: 60 },
    { id: 'colonies', label: 'COLONIAL DEVELOPMENT', subtitle: 'Charters and extraction', y: 350 },
    { id: 'army', label: 'COMBINED ARMS COMMAND', subtitle: 'Flexible planetary warfare', y: 640 },
    { id: 'expedition', label: 'EXPEDITIONARY NETWORK', subtitle: 'Carriers and navigation', y: 1120 },
    { id: 'navy', label: 'COALITION NAVAL COMMAND', subtitle: 'Capital fleets and coordinated fire', y: 1510 },
  ],
  nodes: [
    researchNode('advancedIndustry', 'industry', 0, 60), researchNode('rapidFabrication', 'industry', 1, 60),
    researchNode('humanStandardization', 'industry', 2, 60), researchNode('industrialIteration', 'industry', 3, 60),
    researchNode('quantumExtraction', 'colonies', 1, 350), researchNode('humanColonialCharters', 'colonies', 2, 350),
    researchNode('deepCoreExtraction', 'colonies', 3, 350), researchNode('resourceSynthesis', 'colonies', 4, 350),
    researchNode('groundWarfare', 'army', 1, 690), researchNode('humanJointOperations', 'army', 2, 620),
    researchNode('humanFieldEngineering', 'army', 2, 860), researchNode('heavyArmor', 'army', 3, 620),
    researchNode('planetaryFortifications', 'army', 3, 860),
    researchNode('fleetLogistics', 'expedition', 1, 1160), researchNode('humanPhaseCouriers', 'expedition', 2, 1090),
    researchNode('phaseMastery', 'expedition', 3, 1090), researchNode('carrierOperations', 'expedition', 2, 1330),
    researchNode('orbitalEngineering', 'navy', 1, 1580), researchNode('shieldHarmonics', 'navy', 2, 1480),
    researchNode('capitalShips', 'navy', 2, 1730), researchNode('humanTargetingGrid', 'navy', 3, 1480),
    researchNode('weaponsCalibration', 'navy', 4, 1480), researchNode('titanEngineering', 'navy', 3, 1730),
    researchNode('combatSimulation', 'navy', 5, 1480),
  ],
  requires: {
    rapidFabrication: 'advancedIndustry', humanStandardization: 'rapidFabrication', industrialIteration: 'humanStandardization',
    quantumExtraction: 'advancedIndustry', humanColonialCharters: 'quantumExtraction', deepCoreExtraction: 'humanColonialCharters', resourceSynthesis: 'deepCoreExtraction',
    groundWarfare: 'advancedIndustry', humanJointOperations: 'groundWarfare', heavyArmor: 'humanJointOperations',
    humanFieldEngineering: 'groundWarfare', planetaryFortifications: 'humanFieldEngineering',
    fleetLogistics: 'advancedIndustry', humanPhaseCouriers: 'fleetLogistics', phaseMastery: 'humanPhaseCouriers', carrierOperations: 'fleetLogistics',
    orbitalEngineering: 'advancedIndustry', shieldHarmonics: 'orbitalEngineering', capitalShips: 'orbitalEngineering',
    humanTargetingGrid: 'capitalShips', weaponsCalibration: 'humanTargetingGrid', titanEngineering: 'capitalShips', combatSimulation: 'weaponsCalibration',
  },
};

const BROOD_RESEARCH_TREE: FactionResearchTree = {
  width: 2100,
  height: 2170,
  rootLabel: 'PRIME GENETIC MEMORY',
  branches: [
    { id: 'metabolism', label: 'METABOLIC ASCENDANCY', subtitle: 'Consumption becomes evolution', y: 50 },
    { id: 'growth', label: 'GESTATION CYCLE', subtitle: 'Industry grown rather than built', y: 430 },
    { id: 'synapse', label: 'SYNAPTIC DOMINION', subtitle: 'One will across every world', y: 820 },
    { id: 'void', label: 'VOID PREDATION', subtitle: 'Living fleets hunt between stars', y: 1260 },
  ],
  nodes: [
    researchNode('broodHypermetabolism', 'metabolism', 0, 70), researchNode('quantumExtraction', 'metabolism', 1, 70),
    researchNode('deepCoreExtraction', 'metabolism', 2, 70), researchNode('resourceSynthesis', 'metabolism', 3, 70),
    researchNode('advancedIndustry', 'growth', 1, 430), researchNode('rapidFabrication', 'growth', 2, 430),
    researchNode('broodSpawningPools', 'growth', 3, 430), researchNode('industrialIteration', 'growth', 4, 430),
    researchNode('groundWarfare', 'synapse', 2, 820), researchNode('broodSynapticDominion', 'synapse', 3, 750),
    researchNode('heavyArmor', 'synapse', 4, 750), researchNode('broodWorldCarapace', 'synapse', 3, 990),
    researchNode('planetaryFortifications', 'synapse', 4, 990),
    researchNode('fleetLogistics', 'void', 2, 1280), researchNode('broodVoidSenses', 'void', 3, 1210),
    researchNode('phaseMastery', 'void', 4, 1210), researchNode('carrierOperations', 'void', 4, 1450),
    researchNode('orbitalEngineering', 'void', 2, 1690), researchNode('shieldHarmonics', 'void', 3, 1690),
    researchNode('capitalShips', 'void', 3, 1930), researchNode('weaponsCalibration', 'void', 4, 1690),
    researchNode('broodApexInstinct', 'void', 4, 1930), researchNode('combatSimulation', 'void', 5, 1690),
    researchNode('titanEngineering', 'void', 5, 1930),
  ],
  requires: {
    quantumExtraction: 'broodHypermetabolism', deepCoreExtraction: 'quantumExtraction', resourceSynthesis: 'deepCoreExtraction',
    advancedIndustry: 'broodHypermetabolism', rapidFabrication: 'advancedIndustry', broodSpawningPools: 'rapidFabrication', industrialIteration: 'broodSpawningPools',
    groundWarfare: 'advancedIndustry', broodSynapticDominion: 'groundWarfare', heavyArmor: 'broodSynapticDominion',
    broodWorldCarapace: 'groundWarfare', planetaryFortifications: 'broodWorldCarapace',
    fleetLogistics: 'advancedIndustry', broodVoidSenses: 'fleetLogistics', phaseMastery: 'broodVoidSenses',
    carrierOperations: 'fleetLogistics', orbitalEngineering: 'advancedIndustry', shieldHarmonics: 'orbitalEngineering',
    capitalShips: 'orbitalEngineering', weaponsCalibration: 'broodSynapticDominion', broodApexInstinct: 'capitalShips',
    combatSimulation: 'weaponsCalibration', titanEngineering: 'broodApexInstinct',
  },
};

const AEGIS_RESEARCH_TREE: FactionResearchTree = {
  width: 2100,
  height: 2110,
  rootLabel: 'AWAKENED HARMONIC CORE',
  branches: [
    { id: 'resonance', label: 'RESONANCE', subtitle: 'The lattice awakens', y: 50 },
    { id: 'wards', label: 'SANCTUARY WARDS', subtitle: 'Protection through perfect harmony', y: 350 },
    { id: 'sentinels', label: 'SENTINEL FORMS', subtitle: 'Patient armies and flawless assembly', y: 690 },
    { id: 'farcast', label: 'FARCAST CHOIR', subtitle: 'Navigation through synchronized thought', y: 1080 },
    { id: 'sovereign', label: 'SOVEREIGN ASCENSION', subtitle: 'The final geometry of war', y: 1390 },
    { id: 'abundance', label: 'LUMINOUS ABUNDANCE', subtitle: 'Matter conducted through the lattice', y: 1810 },
  ],
  nodes: [
    researchNode('aegisResonanceCore', 'resonance', 0, 60), researchNode('orbitalEngineering', 'resonance', 1, 60),
    researchNode('shieldHarmonics', 'wards', 2, 340), researchNode('aegisSanctuaryField', 'wards', 3, 340),
    researchNode('planetaryFortifications', 'wards', 3, 580), researchNode('aegisBastionLattice', 'wards', 4, 580),
    researchNode('advancedIndustry', 'sentinels', 1, 760), researchNode('groundWarfare', 'sentinels', 2, 700),
    researchNode('heavyArmor', 'sentinels', 3, 700), researchNode('rapidFabrication', 'sentinels', 2, 940),
    researchNode('aegisPatientAssembly', 'sentinels', 3, 940), researchNode('industrialIteration', 'sentinels', 4, 940),
    researchNode('fleetLogistics', 'farcast', 2, 1180), researchNode('aegisFarcastBeacons', 'farcast', 3, 1120),
    researchNode('phaseMastery', 'farcast', 4, 1120), researchNode('carrierOperations', 'farcast', 3, 1360),
    researchNode('capitalShips', 'sovereign', 2, 1530), researchNode('aegisLanceResonance', 'sovereign', 3, 1470),
    researchNode('weaponsCalibration', 'sovereign', 4, 1470), researchNode('titanEngineering', 'sovereign', 3, 1710),
    researchNode('combatSimulation', 'sovereign', 5, 1470),
    researchNode('quantumExtraction', 'abundance', 2, 1910), researchNode('deepCoreExtraction', 'abundance', 3, 1910),
    researchNode('resourceSynthesis', 'abundance', 4, 1910),
  ],
  requires: {
    orbitalEngineering: 'aegisResonanceCore', shieldHarmonics: 'orbitalEngineering', aegisSanctuaryField: 'shieldHarmonics',
    planetaryFortifications: 'shieldHarmonics', aegisBastionLattice: 'planetaryFortifications',
    advancedIndustry: 'aegisResonanceCore', groundWarfare: 'advancedIndustry', heavyArmor: 'groundWarfare',
    rapidFabrication: 'advancedIndustry', aegisPatientAssembly: 'rapidFabrication', industrialIteration: 'aegisPatientAssembly',
    fleetLogistics: 'orbitalEngineering', aegisFarcastBeacons: 'fleetLogistics', phaseMastery: 'aegisFarcastBeacons',
    carrierOperations: 'fleetLogistics', capitalShips: 'orbitalEngineering', aegisLanceResonance: 'capitalShips',
    weaponsCalibration: 'aegisLanceResonance', titanEngineering: 'capitalShips', combatSimulation: 'weaponsCalibration',
    quantumExtraction: 'advancedIndustry', deepCoreExtraction: 'quantumExtraction', resourceSynthesis: 'deepCoreExtraction',
  },
};

const COVENANT_RESEARCH_TREE: FactionResearchTree = {
  width: 2100,
  height: 2170,
  rootLabel: 'PRIME FOUNDRY DIRECTIVE',
  branches: [
    { id: 'foundry', label: 'FOUNDRY RECURSION', subtitle: 'Build the machines that build', y: 60 },
    { id: 'logic', label: 'CONQUEST LOGIC', subtitle: 'War reduced to solvable operations', y: 680 },
    { id: 'reclamation', label: 'TOTAL RECLAMATION', subtitle: 'Nothing is permitted to become waste', y: 1450 },
  ],
  nodes: [
    researchNode('covenantMachineAwakening', 'foundry', 0, 70), researchNode('advancedIndustry', 'foundry', 1, 70),
    researchNode('rapidFabrication', 'foundry', 2, 70), researchNode('covenantOverclockedForges', 'foundry', 3, 70),
    researchNode('industrialIteration', 'foundry', 4, 70),
    researchNode('orbitalEngineering', 'foundry', 2, 310), researchNode('capitalShips', 'foundry', 3, 310),
    researchNode('covenantSelfRepairMatrices', 'foundry', 4, 310), researchNode('titanEngineering', 'foundry', 5, 310),
    researchNode('groundWarfare', 'logic', 1, 720), researchNode('heavyArmor', 'logic', 2, 650),
    researchNode('covenantRedundantCores', 'logic', 3, 650), researchNode('planetaryFortifications', 'logic', 4, 650),
    researchNode('fleetLogistics', 'logic', 2, 890), researchNode('covenantPhaseCalculation', 'logic', 3, 890),
    researchNode('phaseMastery', 'logic', 4, 890), researchNode('carrierOperations', 'logic', 3, 1130),
    researchNode('weaponsCalibration', 'logic', 4, 1130), researchNode('combatSimulation', 'logic', 5, 1130),
    researchNode('quantumExtraction', 'reclamation', 1, 1530), researchNode('covenantSalvageAlgorithms', 'reclamation', 2, 1530),
    researchNode('deepCoreExtraction', 'reclamation', 3, 1530), researchNode('resourceSynthesis', 'reclamation', 4, 1530),
    researchNode('shieldHarmonics', 'reclamation', 4, 1770),
  ],
  requires: {
    advancedIndustry: 'covenantMachineAwakening', rapidFabrication: 'advancedIndustry',
    covenantOverclockedForges: 'rapidFabrication', industrialIteration: 'covenantOverclockedForges',
    orbitalEngineering: 'advancedIndustry', capitalShips: 'orbitalEngineering',
    covenantSelfRepairMatrices: 'capitalShips', titanEngineering: 'covenantSelfRepairMatrices',
    groundWarfare: 'covenantMachineAwakening', heavyArmor: 'groundWarfare', covenantRedundantCores: 'heavyArmor',
    planetaryFortifications: 'covenantRedundantCores', fleetLogistics: 'groundWarfare',
    covenantPhaseCalculation: 'fleetLogistics', phaseMastery: 'covenantPhaseCalculation', carrierOperations: 'fleetLogistics',
    weaponsCalibration: 'carrierOperations', combatSimulation: 'weaponsCalibration',
    quantumExtraction: 'covenantMachineAwakening', covenantSalvageAlgorithms: 'quantumExtraction',
    deepCoreExtraction: 'covenantSalvageAlgorithms', resourceSynthesis: 'deepCoreExtraction', shieldHarmonics: 'deepCoreExtraction',
  },
};

export const FACTION_RESEARCH_TREES: Record<PlayableFaction, FactionResearchTree> = {
  human: HUMAN_RESEARCH_TREE,
  brood: BROOD_RESEARCH_TREE,
  aegis: AEGIS_RESEARCH_TREE,
  covenant: COVENANT_RESEARCH_TREE,
};

export const researchTreeForCivilization = (civilization: PlayableFaction) => FACTION_RESEARCH_TREES[civilization];
export const researchAvailableToCivilization = (id: ResearchId, civilization: PlayableFaction) =>
  FACTION_RESEARCH_TREES[civilization].nodes.some(node => node.id === id);
export const researchRequirementForCivilization = (id: ResearchId, civilization: PlayableFaction) =>
  FACTION_RESEARCH_TREES[civilization].requires[id];

export const researchDefinitionForCivilization = (id: ResearchId, civilization: PlayableFaction): Definition => ({
  ...RESEARCH[id],
  label: FACTION_RESEARCH_LABELS[civilization][id] ?? RESEARCH[id].label,
  requires: researchRequirementForCivilization(id, civilization),
});

export const researchUnlocksForCivilization = (id: ResearchId, civilization: PlayableFaction) => {
  const factionUnlocks = civilization === 'brood' ? BROOD_RESEARCH_UNLOCKS : civilization === 'aegis' ? AEGIS_RESEARCH_UNLOCKS : civilization === 'covenant' ? COVENANT_RESEARCH_UNLOCKS : RESEARCH_UNLOCKS;
  return factionUnlocks[id] ?? RESEARCH_UNLOCKS[id];
};

export const ORBITAL_DEFENSE_STATS = { hp: 420, shields: 220, damage: 32 } as const;
export const ANTI_SPACE_BATTERY_STATS = { hp: 300, shields: 120, damage: 12 } as const;
export const DEFENSE_REBUILD_COOLDOWN_SECONDS = 10;
export const ORBITAL_DEFENSE_BUILDING_CAP = 10;
export const ADVANCED_GROUND_FACTORY_CAPACITY = 2.5;
export const DEFENSE_BUILDING_KINDS: readonly DefenseBuildingKind[] = ['groundDefense', 'antiSpaceDefense', 'spaceDefense'];
export const isDefenseBuildingKind = (kind: BuildingKind): kind is DefenseBuildingKind => DEFENSE_BUILDING_KINDS.includes(kind as DefenseBuildingKind);
export const isBuildingOperational = (building: Building) => (building.constructionRemaining ?? 0) <= 0;
// Covers the full gravity well from a platform on the opposite side of orbit,
// preventing long-range ships from kiting a fixed installation at the edge.
export const ORBITAL_DEFENSE_RANGE = 1065;
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
export const ANTI_FIGHTER_DAMAGE_MULTIPLIER = 1.5;
export const ORBITAL_BOMBARDMENT_DAMAGE_PER_SHIP = 1;
export const RESOURCE_COLLECTION_MULTIPLIER = 4;
export const GRAVITY_WELL_RADIUS = 780;
export const MIN_SYSTEM_CENTER_SEPARATION = GRAVITY_WELL_RADIUS * 2 + 120;
export const MAX_SHIP_ORBIT_RADIUS = GRAVITY_WELL_RADIUS - 80;
export const MIN_SHIP_ORBIT_SEPARATION = 40;
export const ORBIT_MANEUVER_SPEED = 18;
export const SHIP_TURN_RATE_DEGREES_PER_SECOND = 90;
export const LANDING_APPROACH_SPEED = 14;
export const SYSTEM_EXIT_SPEED = 18;
export const PHASE_GATE_CHARGE_SECONDS = 2;

export const COALITION_GROUND_KINDS: GroundUnitKind[] = ['infantry', 'antiVehicle', 'recon', 'lightTank', 'artillery', 'shockTrooper', 'railgunTank', 'plasmaTank', 'siegeWalker'];
export const BROOD_GROUND_KINDS: GroundUnitKind[] = ['broodling', 'acidSpitter', 'skitterer', 'carapaceBeast', 'sporeLobber', 'synapseGuard', 'crusherBeast', 'acidBehemoth', 'siegeCrawler'];
export const COALITION_SPACE_KINDS: SpaceUnitKind[] = [
  'transport', 'escortFrigate', 'missileFrigate', 'flakFrigate', 'reconCutter', 'phaseSuppressionFrigate',
  'advancedTransport', 'advancedEscortFrigate', 'advancedMissileFrigate', 'advancedFlakFrigate', 'phaseLockCruiser',
  'assaultCarrier', 'battlecruiser', 'dreadnought',
];
export const BROOD_SPACE_KINDS: SpaceUnitKind[] = [
  'sporeArk', 'clawFrigate', 'needleFrigate', 'broodSporeguard', 'broodSeeker', 'voidBinder',
  'greaterSporeArk', 'clawCruiser', 'needleCruiser', 'greaterSporeguard', 'greaterVoidBinder',
  'broodCarrier', 'leviathan', 'worldEater',
];
export const GROUND_KINDS: GroundUnitKind[] = [...COALITION_GROUND_KINDS, 'defenseTurret', ...BROOD_GROUND_KINDS, 'spineTower', ...AEGIS_GROUND_KINDS, ...COVENANT_GROUND_KINDS, 'covenantBulwark'];
const RETIRED_SPACE_KINDS: SpaceUnitKind[] = [
  'lightCruiser', 'destroyer', 'hiveCruiser', 'voidStalker', 'aegisWardCruiser', 'covenantFoundryCruiser',
];
export const SPACE_KINDS: SpaceUnitKind[] = [...COALITION_SPACE_KINDS, ...BROOD_SPACE_KINDS, ...AEGIS_SPACE_KINDS, ...COVENANT_SPACE_KINDS, ...RETIRED_SPACE_KINDS];
export const FLAK_FRIGATE_KINDS: ReadonlySet<SpaceUnitKind> = new Set([
  'flakFrigate', 'advancedFlakFrigate',
  'broodSporeguard', 'greaterSporeguard',
  'aegisSentinelFrigate', 'aegisSentinelCruiser',
  'covenantInterdictor', 'covenantInterdictorCruiser',
]);
export const isFlakFrigateKind = (kind: UnitKind): kind is SpaceUnitKind => FLAK_FRIGATE_KINDS.has(kind as SpaceUnitKind);
export const RECON_SHIP_KINDS: ReadonlySet<SpaceUnitKind> = new Set([
  'reconCutter', 'broodSeeker', 'aegisFarcastScout', 'covenantSurveyorSkiff',
]);
export const PHASE_CONTROL_SHIP_KINDS: ReadonlySet<SpaceUnitKind> = new Set([
  'phaseSuppressionFrigate', 'phaseLockCruiser',
  'voidBinder', 'greaterVoidBinder',
  'aegisResonanceAnchor', 'aegisAnchorCruiser',
  'covenantLockstepFrigate', 'covenantLockstepCruiser',
]);
export const PHASE_CONTROL_RATE_MULTIPLIER = .75;
export const isReconShipKind = (kind: UnitKind): kind is SpaceUnitKind => RECON_SHIP_KINDS.has(kind as SpaceUnitKind);
export const isPhaseControlShipKind = (kind: UnitKind): kind is SpaceUnitKind => PHASE_CONTROL_SHIP_KINDS.has(kind as SpaceUnitKind);
export const blocksPhaseGate = (kind: UnitKind) => isPhaseControlShipKind(kind) && UNITS[kind].spaceTier === 2;
export const shipMovementSpeedMultiplier = (kind: UnitKind) => UNITS[kind].orbitSpeedMultiplier ?? 1;
export const phaseControlRateMultiplier = (stacks: number) => PHASE_CONTROL_RATE_MULTIPLIER ** Math.max(0, Math.floor(stacks));
export const TITAN_KINDS: ReadonlySet<SpaceUnitKind> = new Set(['dreadnought', 'worldEater', 'aegisSovereignDreadnought', 'covenantDreadforge']);
export const isTitanKind = (kind: UnitKind): kind is SpaceUnitKind => TITAN_KINDS.has(kind as SpaceUnitKind);
export const TIER_TWO_COPY_BY_TIER_ONE: Readonly<Partial<Record<SpaceUnitKind, SpaceUnitKind>>> = {
  transport: 'advancedTransport',
  escortFrigate: 'advancedEscortFrigate',
  missileFrigate: 'advancedMissileFrigate',
  flakFrigate: 'advancedFlakFrigate',
  phaseSuppressionFrigate: 'phaseLockCruiser',
  sporeArk: 'greaterSporeArk',
  clawFrigate: 'clawCruiser',
  needleFrigate: 'needleCruiser',
  broodSporeguard: 'greaterSporeguard',
  voidBinder: 'greaterVoidBinder',
  aegisBastionLander: 'aegisBastionLanderII',
  aegisShieldMonitor: 'aegisShieldMonitorII',
  aegisLanceFrigate: 'aegisLanceCruiser',
  aegisSentinelFrigate: 'aegisSentinelCruiser',
  aegisResonanceAnchor: 'aegisAnchorCruiser',
  covenantAssemblyArk: 'covenantAssemblyArkII',
  covenantSalvageFrigate: 'covenantSalvageCruiser',
  covenantChainFrigate: 'covenantChainCruiser',
  covenantInterdictor: 'covenantInterdictorCruiser',
  covenantLockstepFrigate: 'covenantLockstepCruiser',
};
export const SPACE_YARD_KIND_BY_TIER: Record<SpaceShipTier, SpaceYardKind> = {
  1: 'spaceFactory',
  2: 'advancedSpaceFactory',
  3: 'experimentalSpaceFactory',
};
export const SPACE_YARD_TIER: Record<SpaceYardKind, SpaceShipTier> = {
  spaceFactory: 1,
  advancedSpaceFactory: 2,
  experimentalSpaceFactory: 3,
};
export const spaceTierForUnit = (kind: UnitKind) => UNITS[kind].factory === 'space' ? UNITS[kind].spaceTier : undefined;
export const requiredSpaceYardKind = (kind: UnitKind) => {
  const tier = spaceTierForUnit(kind);
  return tier ? SPACE_YARD_KIND_BY_TIER[tier] : undefined;
};

const BROOD_EQUIVALENTS: Partial<Record<UnitKind, UnitKind>> = {
  infantry: 'broodling', antiVehicle: 'acidSpitter', recon: 'skitterer', lightTank: 'carapaceBeast', artillery: 'sporeLobber',
  shockTrooper: 'synapseGuard', railgunTank: 'crusherBeast', plasmaTank: 'acidBehemoth', siegeWalker: 'siegeCrawler', defenseTurret: 'spineTower',
  transport: 'sporeArk', escortFrigate: 'clawFrigate', missileFrigate: 'needleFrigate', reconCutter: 'broodSeeker', phaseSuppressionFrigate: 'voidBinder', phaseLockCruiser: 'greaterVoidBinder', lightCruiser: 'hiveCruiser', destroyer: 'voidStalker',
  advancedTransport: 'greaterSporeArk', advancedEscortFrigate: 'clawCruiser', advancedMissileFrigate: 'needleCruiser', advancedFlakFrigate: 'greaterSporeguard',
  flakFrigate: 'broodSporeguard', assaultCarrier: 'broodCarrier', battlecruiser: 'leviathan', dreadnought: 'worldEater',
};
const BROOD_UNIT_KINDS = new Set<UnitKind>([...BROOD_GROUND_KINDS, 'spineTower', ...BROOD_SPACE_KINDS]);
const AEGIS_EQUIVALENTS: Partial<Record<UnitKind, UnitKind>> = {
  infantry: 'aegisWarden', antiVehicle: 'aegisWarden', recon: 'aegisWarden', lightTank: 'aegisBastionTank', artillery: 'aegisRampartArtillery',
  shockTrooper: 'aegisPaladinGuard', railgunTank: 'aegisFortressWalker', plasmaTank: 'aegisFortressWalker', siegeWalker: 'aegisFortressWalker',
  transport: 'aegisBastionLander', escortFrigate: 'aegisShieldMonitor', missileFrigate: 'aegisLanceFrigate', reconCutter: 'aegisFarcastScout', phaseSuppressionFrigate: 'aegisResonanceAnchor', phaseLockCruiser: 'aegisAnchorCruiser', lightCruiser: 'aegisWardCruiser', destroyer: 'aegisWardCruiser',
  advancedTransport: 'aegisBastionLanderII', advancedEscortFrigate: 'aegisShieldMonitorII', advancedMissileFrigate: 'aegisLanceCruiser', advancedFlakFrigate: 'aegisSentinelCruiser',
  flakFrigate: 'aegisSentinelFrigate', assaultCarrier: 'aegisCitadelCarrier', battlecruiser: 'aegisSovereignDreadnought', dreadnought: 'aegisSovereignDreadnought',
};
const AEGIS_UNIT_KINDS = new Set<UnitKind>([...AEGIS_GROUND_KINDS, ...AEGIS_SPACE_KINDS]);
const COVENANT_EQUIVALENTS: Partial<Record<UnitKind, UnitKind>> = {
  infantry: 'covenantCohort', antiVehicle: 'covenantCohort', recon: 'covenantRepairDrone', lightTank: 'covenantBastionStrider', artillery: 'covenantFurnaceArtillery',
  shockTrooper: 'covenantRepairDrone', railgunTank: 'covenantJuggernaut', plasmaTank: 'covenantJuggernaut', siegeWalker: 'covenantJuggernaut', defenseTurret: 'covenantBulwark',
  transport: 'covenantAssemblyArk', escortFrigate: 'covenantSalvageFrigate', missileFrigate: 'covenantChainFrigate', reconCutter: 'covenantSurveyorSkiff', phaseSuppressionFrigate: 'covenantLockstepFrigate', phaseLockCruiser: 'covenantLockstepCruiser', lightCruiser: 'covenantFoundryCruiser', destroyer: 'covenantFoundryCruiser',
  advancedTransport: 'covenantAssemblyArkII', advancedEscortFrigate: 'covenantSalvageCruiser', advancedMissileFrigate: 'covenantChainCruiser', advancedFlakFrigate: 'covenantInterdictorCruiser',
  flakFrigate: 'covenantInterdictor', assaultCarrier: 'covenantFabricatorCarrier', battlecruiser: 'covenantIronclad', dreadnought: 'covenantDreadforge',
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
  'groundFactory', 'advancedGroundFactory', 'spaceFactory', 'advancedSpaceFactory', 'experimentalSpaceFactory',
]);
export const hasUnlimitedBuildingCapacity = (kind: BuildingKind) => UNLIMITED_BUILDING_KINDS.has(kind);
