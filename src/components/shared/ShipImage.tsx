import assaultCarrier from '../../assets/ships/assault-carrier.png';
import battlecruiser from '../../assets/ships/battlecruiser.png';
import destroyer from '../../assets/ships/destroyer.png';
import dreadnought from '../../assets/ships/dreadnought.png';
import escortFrigate from '../../assets/ships/escort-frigate.png';
import lightCruiser from '../../assets/ships/light-cruiser.png';
import missileFrigate from '../../assets/ships/missile-frigate.png';
import transport from '../../assets/ships/transport.png';
import flakFrigate from '../../assets/ships/flak-frigate.png';
import reconCutter from '../../assets/ships/recon-cutter.png';
import phaseSuppressionFrigate from '../../assets/ships/phase-suppression-frigate.png';
import aegisBastionLander from '../../assets/aegis/ships/bastion-lander.png';
import aegisCitadelCarrier from '../../assets/aegis/ships/citadel-carrier.png';
import aegisLanceFrigate from '../../assets/aegis/ships/lance-frigate.png';
import aegisSentinelFrigate from '../../assets/aegis/ships/sentinel-flak-frigate.png';
import aegisShieldMonitor from '../../assets/aegis/ships/shield-monitor.png';
import aegisSovereignDreadnought from '../../assets/aegis/ships/sovereign-dreadnought.png';
import aegisWardCruiser from '../../assets/aegis/ships/ward-cruiser.png';
import aegisFarcastScout from '../../assets/aegis/ships/farcast-scout.png';
import aegisResonanceAnchor from '../../assets/aegis/ships/resonance-anchor.png';
import covenantAssemblyArk from '../../assets/covenant/ships/assembly-ark.png';
import covenantChainFrigate from '../../assets/covenant/ships/chain-frigate.png';
import covenantDreadforge from '../../assets/covenant/ships/dreadforge-titan.png';
import covenantFabricatorCarrier from '../../assets/covenant/ships/fabricator-carrier.png';
import covenantFoundryCruiser from '../../assets/covenant/ships/foundry-cruiser.png';
import covenantIronclad from '../../assets/covenant/ships/ironclad-battleship.png';
import covenantInterdictor from '../../assets/covenant/ships/interdictor-frigate.png';
import covenantSalvageFrigate from '../../assets/covenant/ships/salvage-frigate.png';
import covenantSurveyorSkiff from '../../assets/covenant/ships/surveyor-skiff.png';
import covenantLockstepFrigate from '../../assets/covenant/ships/lockstep-frigate.png';
import broodCarrier from '../../assets/brood/ships/brood-carrier.png';
import broodSporeguard from '../../assets/brood/ships/sporeguard-frigate.png';
import clawFrigate from '../../assets/brood/ships/claw-frigate.png';
import hiveCruiser from '../../assets/brood/ships/hive-cruiser.png';
import leviathan from '../../assets/brood/ships/leviathan.png';
import needleFrigate from '../../assets/brood/ships/needle-frigate.png';
import sporeArk from '../../assets/brood/ships/spore-ark.png';
import voidStalker from '../../assets/brood/ships/void-stalker.png';
import worldEater from '../../assets/brood/ships/world-eater.png';
import broodSeeker from '../../assets/brood/ships/seeker.png';
import voidBinder from '../../assets/brood/ships/void-binder.png';
import { BROOD_SPACE_KINDS, SPACE_KINDS, type SpaceUnitKind, type UnitKind } from '../../game';

const SHIP_IMAGES: Record<SpaceUnitKind, string> = {
  transport,
  escortFrigate,
  missileFrigate,
  flakFrigate,
  reconCutter,
  phaseSuppressionFrigate,
  advancedTransport: transport,
  advancedEscortFrigate: escortFrigate,
  advancedMissileFrigate: missileFrigate,
  advancedFlakFrigate: flakFrigate,
  phaseLockCruiser: phaseSuppressionFrigate,
  lightCruiser,
  destroyer,
  assaultCarrier,
  battlecruiser,
  dreadnought,
  sporeArk,
  clawFrigate,
  needleFrigate,
  broodSporeguard,
  broodSeeker,
  voidBinder,
  greaterSporeArk: sporeArk,
  clawCruiser: clawFrigate,
  needleCruiser: needleFrigate,
  greaterSporeguard: broodSporeguard,
  greaterVoidBinder: voidBinder,
  hiveCruiser,
  voidStalker,
  broodCarrier,
  leviathan,
  worldEater,
  aegisBastionLander,
  aegisShieldMonitor,
  aegisLanceFrigate,
  aegisSentinelFrigate,
  aegisFarcastScout,
  aegisResonanceAnchor,
  aegisBastionLanderII: aegisBastionLander,
  aegisShieldMonitorII: aegisShieldMonitor,
  aegisLanceCruiser: aegisLanceFrigate,
  aegisSentinelCruiser: aegisSentinelFrigate,
  aegisAnchorCruiser: aegisResonanceAnchor,
  aegisWardCruiser,
  aegisCitadelCarrier,
  aegisSovereignDreadnought,
  covenantAssemblyArk,
  covenantSalvageFrigate,
  covenantChainFrigate,
  covenantInterdictor,
  covenantSurveyorSkiff,
  covenantLockstepFrigate,
  covenantAssemblyArkII: covenantAssemblyArk,
  covenantSalvageCruiser: covenantSalvageFrigate,
  covenantChainCruiser: covenantChainFrigate,
  covenantInterdictorCruiser: covenantInterdictor,
  covenantLockstepCruiser: covenantLockstepFrigate,
  covenantFoundryCruiser,
  covenantFabricatorCarrier,
  covenantIronclad,
  covenantDreadforge,
};

const BROOD_SHIP_IMAGES = new Set<SpaceUnitKind>([...BROOD_SPACE_KINDS, 'hiveCruiser', 'voidStalker']);

export const shipImageSource = (kind: SpaceUnitKind) => SHIP_IMAGES[kind];

export const SHIP_DISPLAY_SIZES: Record<SpaceUnitKind, number> = {
  transport: 68,
  escortFrigate: 78,
  missileFrigate: 82,
  flakFrigate: 80,
  reconCutter: 68,
  phaseSuppressionFrigate: 86,
  advancedTransport: 92,
  advancedEscortFrigate: 98,
  advancedMissileFrigate: 102,
  advancedFlakFrigate: 100,
  phaseLockCruiser: 110,
  lightCruiser: 94,
  destroyer: 104,
  assaultCarrier: 116,
  battlecruiser: 126,
  dreadnought: 140,
  sporeArk: 72,
  clawFrigate: 82,
  needleFrigate: 86,
  broodSporeguard: 84,
  broodSeeker: 70,
  voidBinder: 88,
  greaterSporeArk: 96,
  clawCruiser: 102,
  needleCruiser: 106,
  greaterSporeguard: 104,
  greaterVoidBinder: 112,
  hiveCruiser: 100,
  voidStalker: 108,
  broodCarrier: 120,
  leviathan: 132,
  worldEater: 148,
  aegisBastionLander: 78,
  aegisShieldMonitor: 84,
  aegisLanceFrigate: 88,
  aegisSentinelFrigate: 86,
  aegisFarcastScout: 72,
  aegisResonanceAnchor: 90,
  aegisBastionLanderII: 102,
  aegisShieldMonitorII: 108,
  aegisLanceCruiser: 112,
  aegisSentinelCruiser: 110,
  aegisAnchorCruiser: 114,
  aegisWardCruiser: 104,
  aegisCitadelCarrier: 128,
  aegisSovereignDreadnought: 148,
  covenantAssemblyArk: 78,
  covenantSalvageFrigate: 84,
  covenantChainFrigate: 88,
  covenantInterdictor: 86,
  covenantSurveyorSkiff: 68,
  covenantLockstepFrigate: 88,
  covenantAssemblyArkII: 102,
  covenantSalvageCruiser: 108,
  covenantChainCruiser: 112,
  covenantInterdictorCruiser: 110,
  covenantLockstepCruiser: 112,
  covenantFoundryCruiser: 106,
  covenantFabricatorCarrier: 126,
  covenantIronclad: 138,
  covenantDreadforge: 154,
};

export const isSpaceUnit = (kind: UnitKind): kind is SpaceUnitKind => SPACE_KINDS.includes(kind as SpaceUnitKind);

export const shipDisplaySize = (kind: UnitKind) => isSpaceUnit(kind) ? SHIP_DISPLAY_SIZES[kind] : SHIP_DISPLAY_SIZES.transport;

export function ShipImage({ kind, className = '', volumetric = false }: { kind: UnitKind; className?: string; volumetric?: boolean }) {
  if (!isSpaceUnit(kind)) return null;
  const classes = `ship-image ${BROOD_SHIP_IMAGES.has(kind) ? 'brood-organic' : ''} ${className}`;
  if (!volumetric) return <img className={classes} src={SHIP_IMAGES[kind]} alt="" aria-hidden="true" draggable={false} />;
  return <span className="ship-model-3d" aria-hidden="true">
    {[6, 5, 4, 3, 2, 1].map(layer => <img key={layer} className={`${classes} ship-volume-layer ship-volume-layer-${layer}`} src={SHIP_IMAGES[kind]} alt="" draggable={false} />)}
    <img className={`${classes} ship-top-surface`} src={SHIP_IMAGES[kind]} alt="" draggable={false} />
  </span>;
}
