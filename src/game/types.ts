export type Resource = 'metal' | 'crystal' | 'gold';
export type EmpireFaction = 'player' | 'enemy' | 'rival2' | 'rival3';
export type Faction = EmpireFaction | null;
export type UnitFaction = Exclude<Faction, null> | 'neutral';
export type MapSize = 'small' | 'medium' | 'large' | 'huge';
export type EnemyDifficulty = 'cadet' | 'commander' | 'admiral';
export type PlayableFaction = 'human' | 'brood' | 'aegis' | 'covenant';

export interface GameConfig { mapSize: MapSize; difficulty: EnemyDifficulty; playerFaction?: PlayableFaction }
export const DEFAULT_GAME_CONFIG: GameConfig = { mapSize: 'medium', difficulty: 'commander', playerFaction: 'human' };

export type SpaceShipTier = 1 | 2 | 3;
export type SpaceYardKind = 'spaceFactory' | 'advancedSpaceFactory' | 'experimentalSpaceFactory';
export type BuildingKind =
  | 'metalMine'
  | 'crystalMine'
  | 'goldMine'
  | 'groundFactory'
  | 'advancedGroundFactory'
  | SpaceYardKind
  | 'groundDefense'
  | 'antiSpaceDefense'
  | 'spaceDefense'
  | 'researchLab';
export type DefenseBuildingKind = 'groundDefense' | 'antiSpaceDefense' | 'spaceDefense';

export type GroundUnitKind =
  | 'infantry' | 'antiVehicle' | 'recon' | 'lightTank' | 'artillery' | 'shockTrooper' | 'railgunTank' | 'plasmaTank' | 'siegeWalker' | 'defenseTurret'
  | 'broodling' | 'acidSpitter' | 'skitterer' | 'carapaceBeast' | 'sporeLobber' | 'synapseGuard' | 'crusherBeast' | 'acidBehemoth' | 'siegeCrawler' | 'spineTower'
  | 'aegisWarden' | 'aegisBastionTank' | 'aegisRampartArtillery' | 'aegisPaladinGuard' | 'aegisFortressWalker'
  | 'covenantCohort' | 'covenantRepairDrone' | 'covenantBastionStrider' | 'covenantFurnaceArtillery' | 'covenantJuggernaut' | 'covenantBulwark';
export type SpaceUnitKind =
  | 'transport' | 'escortFrigate' | 'missileFrigate' | 'flakFrigate' | 'lightCruiser' | 'destroyer' | 'assaultCarrier' | 'battlecruiser' | 'dreadnought'
  | 'sporeArk' | 'clawFrigate' | 'needleFrigate' | 'broodSporeguard' | 'hiveCruiser' | 'voidStalker' | 'broodCarrier' | 'leviathan' | 'worldEater'
  | 'aegisBastionLander' | 'aegisShieldMonitor' | 'aegisLanceFrigate' | 'aegisSentinelFrigate' | 'aegisWardCruiser' | 'aegisCitadelCarrier' | 'aegisSovereignDreadnought'
  | 'covenantAssemblyArk' | 'covenantSalvageFrigate' | 'covenantChainFrigate' | 'covenantInterdictor' | 'covenantFoundryCruiser' | 'covenantFabricatorCarrier' | 'covenantIronclad' | 'covenantDreadforge';
export type UnitKind = GroundUnitKind | SpaceUnitKind;
export type WeaponEffect = 'laser' | 'missile' | 'pulse' | 'kinetic' | 'artillery' | 'railgun' | 'plasma' | 'siege' | 'drone';
export type UnitAbilityKind =
  | 'swarmInstinct' | 'corrosiveBile' | 'evasiveChitin' | 'thornedCarapace' | 'burstSpores'
  | 'synapseAura' | 'siegeCharge' | 'livingHold' | 'transportHunter' | 'shieldPiercing'
  | 'orbitalSynapse' | 'phaseCarapace' | 'spawnCloud' | 'devour' | 'planetCracker'
  | 'shieldWall' | 'bastionAnchor' | 'movingTargetBarrage' | 'paladinIntercept' | 'judgmentShockwave'
  | 'armoredApproach' | 'shieldProjection' | 'rangeCalibration' | 'wardInterception' | 'repairDrones' | 'sovereignBarrage'
  | 'modularTargeting' | 'fieldRepair' | 'ablativePlating' | 'shieldBreaker' | 'forgeShockwave'
  | 'assemblyLine' | 'salvageArray' | 'focusFire' | 'foundryAura' | 'fabricatorSwarm' | 'ironcladArmor' | 'dismantlerBeam'
  | 'antiFighterCannons';

export interface ResourcePool { metal: number; crystal: number; gold: number; biomass?: number }
export interface Building {
  id: string;
  kind: BuildingKind;
  spaceQueue?: QueueItem[];
  constructionRemaining?: number;
  constructionTotal?: number;
  hp?: number;
  maxHp?: number;
  shields?: number;
  maxShields?: number;
}
export interface Unit {
  id: string;
  kind: UnitKind;
  faction: UnitFaction;
  hp: number;
  maxHp: number;
  shields: number;
  maxShields: number;
  orbitX?: number;
  orbitY?: number;
  orbitTargetX?: number;
  orbitTargetY?: number;
  heading?: number;
  phaseArrival?: boolean;
  pendingLanding?: boolean;
  pendingEmbark?: boolean;
  docked?: boolean;
  battleX?: number;
  battleY?: number;
  battleTargetX?: number;
  battleTargetY?: number;
  battleRetaliationTargetId?: string;
  sourceBuildingId?: string;
  loadedUnitIds?: string[];
  cargo?: Unit[];
  weaponCooldown?: number;
  weaponFlash?: number;
  corrodedFor?: number;
  fighterCount?: number;
  fighterBuildProgress?: number;
  fighterLossProgress?: number;
  fighterDamage?: number;
}
export interface QueueItem { id: string; kind: UnitKind; remaining: number; total: number }
export interface Planet {
  id: string;
  name: string;
  x: number;
  y: number;
  color: string;
  owner: Faction;
  resourceYield: ResourcePool;
  buildingLimits: Record<BuildingKind, number>;
  buildings: Building[];
  groundUnits: Unit[];
  orbitUnits: Unit[];
  groundQueue: QueueItem[];
  spaceQueue: QueueItem[];
  orbitFocusTargetId?: string;
  enemyOrbitFocusTargetId?: string;
  orbitFocusTargetIds?: Partial<Record<EmpireFaction, string>>;
  defenseRebuildCooldowns?: Partial<Record<DefenseBuildingKind, number>>;
  intelStatus?: 'unscouted' | 'stale' | 'current';
}
export interface PlanetIntel {
  owner: Faction;
  buildings: Building[];
  groundUnits: Unit[];
  observedAt: number;
}
export interface PlanetConnection { from: Planet; to: Planet; distance: number }
export interface Fleet {
  id: string;
  faction: Exclude<Faction, null>;
  originId: string;
  destinationId: string;
  unit: Unit;
  progress: number;
  travelTime: number;
  phase?: 'exiting' | 'charging' | 'tunnel';
  departureX?: number;
  departureY?: number;
  route?: string[];
  finalDestinationId?: string;
}
export interface GroundBattle {
  planetId: string;
  attackers: Unit[];
  defenders: Unit[];
  attackerFaction?: Exclude<Faction, null>;
  groundDefenseBuildingIds?: string[];
  focusTargetId?: string;
  enemyFocusTargetId?: string;
  focusTargetIds?: Partial<Record<EmpireFaction, string>>;
}
export type ResearchId =
  | 'advancedIndustry' | 'rapidFabrication'
  | 'groundWarfare' | 'planetaryFortifications' | 'heavyArmor'
  | 'fleetLogistics' | 'phaseMastery' | 'carrierOperations'
  | 'orbitalEngineering' | 'shieldHarmonics' | 'capitalShips' | 'weaponsCalibration' | 'titanEngineering'
  | 'quantumExtraction' | 'deepCoreExtraction'
  | 'industrialIteration' | 'resourceSynthesis' | 'combatSimulation';
export interface ResearchProject { id: ResearchId; remaining: number; total: number }
export interface EmpireEconomy {
  resources: ResourcePool;
  completedResearch: ResearchId[];
  researchQueue: ResearchProject[];
  actionClock: number;
  attackClock: number;
  missionCount: number;
}
export interface MatchEmpireSlot { faction: EmpireFaction; controller: 'human' | 'ai'; civilization?: PlayableFaction }
export interface GameState {
  mode?: 'solo' | 'competitive';
  config: GameConfig;
  resources: ResourcePool;
  enemyResources: ResourcePool;
  planets: Planet[];
  fleets: Fleet[];
  battles: GroundBattle[];
  completedResearch: ResearchId[];
  enemyCompletedResearch: ResearchId[];
  researchQueue: ResearchProject[];
  enemyResearchQueue: ResearchProject[];
  enemyActionClock: number;
  enemyAttackClock: number;
  enemyMissionCount: number;
  empireCivilizations: Record<EmpireFaction, PlayableFaction>;
  startingPlanetIds?: Partial<Record<EmpireFaction, string>>;
  additionalEmpires?: Partial<Record<'rival2' | 'rival3', EmpireEconomy>>;
  aiFactions?: EmpireFaction[];
  elapsed: number;
  nextId: number;
  neutralGarrisonsInitialized: boolean;
  messages: string[];
  planetIntel?: Partial<Record<EmpireFaction, Record<string, PlanetIntel>>>;
}

export interface Definition {
  label: string;
  description: string;
  cost: ResourcePool;
  time?: number;
  requires?: ResearchId;
}

export interface UnitDefinition extends Definition {
  factory: 'ground' | 'space';
  spaceTier?: SpaceShipTier;
  hp: number;
  shields: number;
  range: number;
  moveSpeed: number;
  weapon: {
    label: string;
    damage: number;
    cooldown: number;
    projectiles: number;
    effect: WeaponEffect;
  };
  advancedFactory?: boolean;
  capacity?: number;
  fighterWing?: {
    label: string;
    capacity: number;
    rebuildTime: number;
    attritionTime: number;
  };
  ability?: {
    kind: UnitAbilityKind;
    label: string;
    description: string;
  };
}
