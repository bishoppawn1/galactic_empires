import assaultCarrier from '../../assets/ships/assault-carrier.png';
import battlecruiser from '../../assets/ships/battlecruiser.png';
import destroyer from '../../assets/ships/destroyer.png';
import dreadnought from '../../assets/ships/dreadnought.png';
import escortFrigate from '../../assets/ships/escort-frigate.png';
import lightCruiser from '../../assets/ships/light-cruiser.png';
import missileFrigate from '../../assets/ships/missile-frigate.png';
import transport from '../../assets/ships/transport.png';
import commandFlagship from '../../assets/ships/vanguard-flagship.png';
import aegisArbiterFlagship from '../../assets/aegis/ships/arbiter-flagship.png';
import aegisBastionLander from '../../assets/aegis/ships/bastion-lander.png';
import aegisCitadelCarrier from '../../assets/aegis/ships/citadel-carrier.png';
import aegisLanceFrigate from '../../assets/aegis/ships/lance-frigate.png';
import aegisShieldMonitor from '../../assets/aegis/ships/shield-monitor.png';
import aegisSovereignDreadnought from '../../assets/aegis/ships/sovereign-dreadnought.png';
import aegisWardCruiser from '../../assets/aegis/ships/ward-cruiser.png';
import covenantAssemblyArk from '../../assets/covenant/ships/assembly-ark.png';
import covenantChainFrigate from '../../assets/covenant/ships/chain-frigate.png';
import covenantDreadforge from '../../assets/covenant/ships/dreadforge-titan.png';
import covenantFabricatorCarrier from '../../assets/covenant/ships/fabricator-carrier.png';
import covenantFoundryCruiser from '../../assets/covenant/ships/foundry-cruiser.png';
import covenantIronclad from '../../assets/covenant/ships/ironclad-battleship.png';
import covenantNullFlagship from '../../assets/covenant/ships/null-foundry-flagship.png';
import covenantSalvageFrigate from '../../assets/covenant/ships/salvage-frigate.png';
import broodCarrier from '../../assets/brood/ships/brood-carrier.png';
import broodRazorQueen from '../../assets/brood/ships/razor-queen-flagship.png';
import clawFrigate from '../../assets/brood/ships/claw-frigate.png';
import hiveCruiser from '../../assets/brood/ships/hive-cruiser.png';
import leviathan from '../../assets/brood/ships/leviathan.png';
import needleFrigate from '../../assets/brood/ships/needle-frigate.png';
import sporeArk from '../../assets/brood/ships/spore-ark.png';
import voidStalker from '../../assets/brood/ships/void-stalker.png';
import worldEater from '../../assets/brood/ships/world-eater.png';
import { BROOD_SPACE_KINDS, SPACE_KINDS, type SpaceUnitKind, type UnitKind } from '../../game';

const SHIP_IMAGES: Record<SpaceUnitKind, string> = {
  transport,
  escortFrigate,
  missileFrigate,
  lightCruiser,
  destroyer,
  assaultCarrier,
  battlecruiser,
  commandFlagship,
  dreadnought,
  sporeArk,
  clawFrigate,
  needleFrigate,
  hiveCruiser,
  voidStalker,
  broodCarrier,
  leviathan,
  broodRazorQueen,
  worldEater,
  aegisBastionLander,
  aegisShieldMonitor,
  aegisLanceFrigate,
  aegisWardCruiser,
  aegisCitadelCarrier,
  aegisArbiterFlagship,
  aegisSovereignDreadnought,
  covenantAssemblyArk,
  covenantSalvageFrigate,
  covenantChainFrigate,
  covenantFoundryCruiser,
  covenantFabricatorCarrier,
  covenantIronclad,
  covenantNullFlagship,
  covenantDreadforge,
};

const BROOD_SHIP_IMAGES = new Set<SpaceUnitKind>(BROOD_SPACE_KINDS);

export const shipImageSource = (kind: SpaceUnitKind) => SHIP_IMAGES[kind];

export const SHIP_DISPLAY_SIZES: Record<SpaceUnitKind, number> = {
  transport: 68,
  escortFrigate: 78,
  missileFrigate: 82,
  lightCruiser: 94,
  destroyer: 104,
  assaultCarrier: 116,
  battlecruiser: 126,
  commandFlagship: 136,
  dreadnought: 140,
  sporeArk: 72,
  clawFrigate: 82,
  needleFrigate: 86,
  hiveCruiser: 100,
  voidStalker: 108,
  broodCarrier: 120,
  leviathan: 132,
  broodRazorQueen: 142,
  worldEater: 148,
  aegisBastionLander: 78,
  aegisShieldMonitor: 84,
  aegisLanceFrigate: 88,
  aegisWardCruiser: 104,
  aegisCitadelCarrier: 128,
  aegisArbiterFlagship: 140,
  aegisSovereignDreadnought: 148,
  covenantAssemblyArk: 78,
  covenantSalvageFrigate: 84,
  covenantChainFrigate: 88,
  covenantFoundryCruiser: 106,
  covenantFabricatorCarrier: 126,
  covenantIronclad: 138,
  covenantNullFlagship: 146,
  covenantDreadforge: 154,
};

export const isSpaceUnit = (kind: UnitKind): kind is SpaceUnitKind => SPACE_KINDS.includes(kind as SpaceUnitKind);

export const shipDisplaySize = (kind: UnitKind) => isSpaceUnit(kind) ? SHIP_DISPLAY_SIZES[kind] : SHIP_DISPLAY_SIZES.transport;

export function ShipImage({ kind, className = '' }: { kind: UnitKind; className?: string }) {
  if (!isSpaceUnit(kind)) return null;
  return <img className={`ship-image ${BROOD_SHIP_IMAGES.has(kind) ? 'brood-organic' : ''} ${className}`} src={SHIP_IMAGES[kind]} alt="" aria-hidden="true" draggable={false} />;
}
