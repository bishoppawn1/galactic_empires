import antiVehicle from '../../assets/ground/anti-vehicle.png';
import artillery from '../../assets/ground/artillery.png';
import defenseTurret from '../../assets/ground/defense-turret.png';
import infantry from '../../assets/ground/infantry.png';
import lightTank from '../../assets/ground/light-tank.png';
import plasmaTank from '../../assets/ground/plasma-tank.png';
import railgunTank from '../../assets/ground/railgun-tank.png';
import recon from '../../assets/ground/recon.png';
import shockTrooper from '../../assets/ground/shock-trooper.png';
import siegeWalker from '../../assets/ground/siege-walker.png';
import aegisBastionTank from '../../assets/aegis/ground/bastion-tank.png';
import aegisFortressWalker from '../../assets/aegis/ground/fortress-walker.png';
import aegisPaladinGuard from '../../assets/aegis/ground/paladin-guard.png';
import aegisRampartArtillery from '../../assets/aegis/ground/rampart-artillery.png';
import aegisWarden from '../../assets/aegis/ground/warden.png';
import covenantBastionStrider from '../../assets/covenant/ground/bastion-strider.png';
import covenantBulwark from '../../assets/covenant/ground/iron-bulwark.png';
import covenantCohort from '../../assets/covenant/ground/iron-cohort.png';
import covenantFurnaceArtillery from '../../assets/covenant/ground/furnace-artillery.png';
import covenantJuggernaut from '../../assets/covenant/ground/juggernaut-engine.png';
import covenantRepairDrone from '../../assets/covenant/ground/repair-drone.png';
import { BROOD_GROUND_KINDS, type GroundUnitKind, type UnitKind } from '../../game';

const GROUND_UNIT_IMAGES: Record<GroundUnitKind, string> = {
  infantry,
  antiVehicle,
  recon,
  lightTank,
  artillery,
  shockTrooper,
  railgunTank,
  plasmaTank,
  siegeWalker,
  defenseTurret,
  broodling: infantry,
  acidSpitter: antiVehicle,
  skitterer: recon,
  carapaceBeast: lightTank,
  sporeLobber: artillery,
  synapseGuard: shockTrooper,
  crusherBeast: railgunTank,
  acidBehemoth: plasmaTank,
  siegeCrawler: siegeWalker,
  spineTower: defenseTurret,
  aegisWarden,
  aegisBastionTank,
  aegisRampartArtillery,
  aegisPaladinGuard,
  aegisFortressWalker,
  covenantCohort,
  covenantRepairDrone,
  covenantBastionStrider,
  covenantFurnaceArtillery,
  covenantJuggernaut,
  covenantBulwark,
};

const BROOD_GROUND_IMAGES = new Set<GroundUnitKind>([...BROOD_GROUND_KINDS, 'spineTower']);

export const isGroundUnit = (kind: UnitKind): kind is GroundUnitKind => kind in GROUND_UNIT_IMAGES;

export function GroundUnitImage({ kind, className = '' }: { kind: UnitKind; className?: string }) {
  if (!isGroundUnit(kind)) return null;
  return <img className={`ground-unit-image ${BROOD_GROUND_IMAGES.has(kind) ? 'brood-organic' : ''} ${className}`} src={GROUND_UNIT_IMAGES[kind]} alt="" aria-hidden="true" draggable={false} />;
}
