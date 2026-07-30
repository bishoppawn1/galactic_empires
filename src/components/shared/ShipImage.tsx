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
import transportCruiser from '../../assets/ships/transport-cruiser.png';
import escortCruiser from '../../assets/ships/escort-cruiser.png';
import missileCruiser from '../../assets/ships/missile-cruiser.png';
import flakCruiser from '../../assets/ships/flak-cruiser.png';
import phaseLockCruiser from '../../assets/ships/phase-lock-cruiser.png';
import aegisBastionLander from '../../assets/aegis/ships/bastion-lander.png';
import aegisBastionLanderCruiser from '../../assets/aegis/ships/bastion-lander-cruiser.png';
import aegisCitadelCarrier from '../../assets/aegis/ships/citadel-carrier.png';
import aegisLanceFrigate from '../../assets/aegis/ships/lance-frigate.png';
import aegisLanceCruiser from '../../assets/aegis/ships/lance-cruiser.png';
import aegisSentinelFrigate from '../../assets/aegis/ships/sentinel-flak-frigate.png';
import aegisSentinelCruiser from '../../assets/aegis/ships/sentinel-flak-cruiser.png';
import aegisShieldMonitor from '../../assets/aegis/ships/shield-monitor.png';
import aegisShieldMonitorCruiser from '../../assets/aegis/ships/shield-monitor-cruiser.png';
import aegisSovereignDreadnought from '../../assets/aegis/ships/sovereign-dreadnought.png';
import aegisWardCruiser from '../../assets/aegis/ships/ward-cruiser.png';
import aegisFarcastScout from '../../assets/aegis/ships/farcast-scout.png';
import aegisResonanceAnchor from '../../assets/aegis/ships/resonance-anchor.png';
import aegisResonanceAnchorCruiser from '../../assets/aegis/ships/resonance-anchor-cruiser.png';
import covenantAssemblyArk from '../../assets/covenant/ships/assembly-ark.png';
import covenantAssemblyArkCruiser from '../../assets/covenant/ships/assembly-ark-cruiser.png';
import covenantChainFrigate from '../../assets/covenant/ships/chain-frigate.png';
import covenantChainCruiser from '../../assets/covenant/ships/chain-cruiser.png';
import covenantDreadforge from '../../assets/covenant/ships/dreadforge-titan.png';
import covenantFabricatorCarrier from '../../assets/covenant/ships/fabricator-carrier.png';
import covenantFoundryCruiser from '../../assets/covenant/ships/foundry-cruiser.png';
import covenantIronclad from '../../assets/covenant/ships/ironclad-battleship.png';
import covenantInterdictor from '../../assets/covenant/ships/interdictor-frigate.png';
import covenantInterdictorCruiser from '../../assets/covenant/ships/interdictor-cruiser.png';
import covenantSalvageFrigate from '../../assets/covenant/ships/salvage-frigate.png';
import covenantSalvageCruiser from '../../assets/covenant/ships/salvage-cruiser.png';
import covenantSurveyorSkiff from '../../assets/covenant/ships/surveyor-skiff.png';
import covenantLockstepFrigate from '../../assets/covenant/ships/lockstep-frigate.png';
import covenantLockstepCruiser from '../../assets/covenant/ships/lockstep-cruiser.png';
import broodCarrier from '../../assets/brood/ships/brood-carrier.png';
import broodSporeguard from '../../assets/brood/ships/sporeguard-frigate.png';
import broodSporeguardCruiser from '../../assets/brood/ships/sporeguard-cruiser.png';
import clawFrigate from '../../assets/brood/ships/claw-frigate.png';
import clawCruiser from '../../assets/brood/ships/claw-cruiser.png';
import hiveCruiser from '../../assets/brood/ships/hive-cruiser.png';
import leviathan from '../../assets/brood/ships/leviathan.png';
import needleFrigate from '../../assets/brood/ships/needle-frigate.png';
import needleCruiser from '../../assets/brood/ships/needle-cruiser.png';
import sporeArk from '../../assets/brood/ships/spore-ark.png';
import sporeArkCruiser from '../../assets/brood/ships/spore-ark-cruiser.png';
import voidStalker from '../../assets/brood/ships/void-stalker.png';
import worldEater from '../../assets/brood/ships/world-eater.png';
import broodSeeker from '../../assets/brood/ships/seeker.png';
import voidBinder from '../../assets/brood/ships/void-binder.png';
import voidBinderCruiser from '../../assets/brood/ships/void-binder-cruiser.png';
import { BROOD_SPACE_KINDS, SPACE_KINDS, type SpaceUnitKind, type UnitKind } from '../../game';

const SHIP_IMAGES: Record<SpaceUnitKind, string> = {
  transport,
  escortFrigate,
  missileFrigate,
  flakFrigate,
  reconCutter,
  phaseSuppressionFrigate,
  advancedTransport: transportCruiser,
  advancedEscortFrigate: escortCruiser,
  advancedMissileFrigate: missileCruiser,
  advancedFlakFrigate: flakCruiser,
  phaseLockCruiser,
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
  greaterSporeArk: sporeArkCruiser,
  clawCruiser,
  needleCruiser,
  greaterSporeguard: broodSporeguardCruiser,
  greaterVoidBinder: voidBinderCruiser,
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
  aegisBastionLanderII: aegisBastionLanderCruiser,
  aegisShieldMonitorII: aegisShieldMonitorCruiser,
  aegisLanceCruiser,
  aegisSentinelCruiser,
  aegisAnchorCruiser: aegisResonanceAnchorCruiser,
  aegisWardCruiser,
  aegisCitadelCarrier,
  aegisSovereignDreadnought,
  covenantAssemblyArk,
  covenantSalvageFrigate,
  covenantChainFrigate,
  covenantInterdictor,
  covenantSurveyorSkiff,
  covenantLockstepFrigate,
  covenantAssemblyArkII: covenantAssemblyArkCruiser,
  covenantSalvageCruiser,
  covenantChainCruiser,
  covenantInterdictorCruiser,
  covenantLockstepCruiser,
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
  advancedTransport: 96,
  advancedEscortFrigate: 106,
  advancedMissileFrigate: 110,
  advancedFlakFrigate: 108,
  phaseLockCruiser: 114,
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
  greaterSporeArk: 100,
  clawCruiser: 108,
  needleCruiser: 114,
  greaterSporeguard: 112,
  greaterVoidBinder: 118,
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
  aegisBastionLanderII: 112,
  aegisShieldMonitorII: 118,
  aegisLanceCruiser: 122,
  aegisSentinelCruiser: 120,
  aegisAnchorCruiser: 126,
  aegisWardCruiser: 104,
  aegisCitadelCarrier: 128,
  aegisSovereignDreadnought: 148,
  covenantAssemblyArk: 78,
  covenantSalvageFrigate: 84,
  covenantChainFrigate: 88,
  covenantInterdictor: 86,
  covenantSurveyorSkiff: 68,
  covenantLockstepFrigate: 88,
  covenantAssemblyArkII: 112,
  covenantSalvageCruiser: 118,
  covenantChainCruiser: 122,
  covenantInterdictorCruiser: 120,
  covenantLockstepCruiser: 124,
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
