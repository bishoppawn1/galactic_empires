export type Resource = 'metal' | 'crystal' | 'gold';
export type EmpireFaction = 'player' | 'enemy' | 'rival2' | 'rival3';
export type Faction = EmpireFaction | null;
export type UnitFaction = Exclude<Faction, null> | 'neutral';
export type MapSize = 'small' | 'medium' | 'large' | 'huge';
export type EnemyDifficulty = 'cadet' | 'commander' | 'admiral';

export interface GameConfig { mapSize: MapSize; difficulty: EnemyDifficulty }
export const DEFAULT_GAME_CONFIG: GameConfig = { mapSize: 'medium', difficulty: 'commander' };

export type BuildingKind =
  | 'metalMine'
  | 'crystalMine'
  | 'goldMine'
  | 'groundFactory'
  | 'advancedGroundFactory'
  | 'spaceFactory'
  | 'advancedSpaceFactory'
  | 'groundDefense'
  | 'antiSpaceDefense'
  | 'spaceDefense'
  | 'researchLab';

export type GroundUnitKind = 'infantry' | 'antiVehicle' | 'recon' | 'lightTank' | 'artillery' | 'shockTrooper' | 'railgunTank' | 'plasmaTank' | 'siegeWalker' | 'defenseTurret';
export type SpaceUnitKind = 'transport' | 'escortFrigate' | 'missileFrigate' | 'lightCruiser' | 'destroyer' | 'assaultCarrier' | 'battlecruiser' | 'dreadnought';
export type UnitKind = GroundUnitKind | SpaceUnitKind;
export type WeaponEffect = 'laser' | 'missile' | 'pulse' | 'kinetic' | 'artillery' | 'railgun' | 'plasma' | 'siege' | 'drone';

export interface ResourcePool { metal: number; crystal: number; gold: number }
export interface Building {
  id: string;
  kind: BuildingKind;
  spaceQueue?: QueueItem[];
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
  phaseArrival?: boolean;
  pendingLanding?: boolean;
  pendingEmbark?: boolean;
  docked?: boolean;
  battleX?: number;
  battleY?: number;
  sourceBuildingId?: string;
  loadedUnitIds?: string[];
  cargo?: Unit[];
  weaponCooldown?: number;
  weaponFlash?: number;
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
export type ResearchId = 'advancedIndustry' | 'groundWarfare' | 'fleetLogistics' | 'orbitalEngineering' | 'quantumExtraction' | 'heavyArmor' | 'carrierOperations' | 'capitalShips' | 'titanEngineering';
export interface ResearchProject { id: ResearchId; remaining: number; total: number }
export interface EmpireEconomy {
  resources: ResourcePool;
  completedResearch: ResearchId[];
  researchQueue: ResearchProject[];
  actionClock: number;
  attackClock: number;
  missionCount: number;
}
export interface MatchEmpireSlot { faction: EmpireFaction; controller: 'human' | 'ai' }
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
  additionalEmpires?: Partial<Record<'rival2' | 'rival3', EmpireEconomy>>;
  aiFactions?: EmpireFaction[];
  elapsed: number;
  nextId: number;
  neutralGarrisonsInitialized: boolean;
  messages: string[];
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
}
